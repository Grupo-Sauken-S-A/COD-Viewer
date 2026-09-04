import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import { validateXML } from 'xmllint-wasm';
import { resolveXsdFileName } from '@/lib/xsd-schema-selection';

const XSD_DIR = path.join(process.cwd(), 'src', 'lib', 'xsd');
const XMLDSIG_SCHEMA_FILE = 'xmldsig-core-schema.xsd';

// Misma cota defensiva que /api/verify-signature-integrity: los COD reales pesan unos
// pocos KB — esto solo evita procesar algo descomunal. El límite de negocio real (4MB,
// bloqueante) ya se aplicó antes, en la carga del archivo (src/lib/input-validation.js).
const MAX_XML_LENGTH = 5 * 1024 * 1024;

// Los XSD no cambian en runtime — se leen una sola vez y se reutilizan entre requests.
const schemaCache = new Map();
const loadSchemaFile = async (fileName) => {
  if (!schemaCache.has(fileName)) {
    schemaCache.set(fileName, readFile(path.join(XSD_DIR, fileName), 'utf8'));
  }
  return schemaCache.get(fileName);
};

export async function POST(request) {
  try {
    const { xmlContent, version, stage } = await request.json();

    if (!xmlContent || typeof xmlContent !== 'string') {
      return NextResponse.json({ error: 'Se requiere xmlContent como string' }, { status: 400 });
    }
    if (xmlContent.length > MAX_XML_LENGTH) {
      return NextResponse.json({ error: 'El XML excede el tamaño máximo soportado' }, { status: 413 });
    }

    const fileName = resolveXsdFileName(version, stage);
    if (!fileName) {
      return NextResponse.json({ applicable: false });
    }

    const [schemaContent, xmldsigContent] = await Promise.all([
      loadSchemaFile(fileName),
      loadSchemaFile(XMLDSIG_SCHEMA_FILE)
    ]);

    const result = await validateXML({
      xml: [{ fileName: 'cod.xml', contents: xmlContent }],
      schema: [schemaContent],
      // xmllint-wasm no hace red ni IO propio para resolver xsd:import — el XSD de ALADI
      // importa xmldsig-core-schema.xsd, así que hay que precargarlo explícitamente.
      preload: [{ fileName: XMLDSIG_SCHEMA_FILE, contents: xmldsigContent }]
    });

    return NextResponse.json({
      applicable: true,
      schemaFile: fileName,
      valid: result.valid,
      errors: (result.errors || []).map((e) => e.message || String(e))
    });
  } catch (error) {
    return NextResponse.json({ error: 'Error al validar contra el XSD: ' + error.message }, { status: 500 });
  }
}
