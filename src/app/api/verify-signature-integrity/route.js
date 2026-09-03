import { NextResponse } from 'next/server';
import { DOMParser } from '@xmldom/xmldom';
import { SignedXml } from 'xml-crypto';

const XMLDSIG_NS = 'http://www.w3.org/2000/09/xmldsig#';
const ELEMENT_IDS = ['COD', 'CODEH'];

// Límite generoso: los COD reales pesan unos pocos KB a lo sumo; esto solo evita
// que un XML descomunal (por error o abuso) se procese sin ningún límite.
const MAX_XML_LENGTH = 5 * 1024 * 1024; // 5 MB

// Verificación criptográfica real de integridad de la firma XMLDSig: recalcula el digest del
// contenido referenciado (aplicando la canonicalización/transforms declarados en la propia
// firma) y lo compara contra <DigestValue>, y verifica <SignatureValue> contra <SignedInfo>
// usando la clave pública del certificado embebido (<X509Certificate>). Esto es justamente lo
// que esta aplicación históricamente NO hacía (ver signature-utils.js) — si alguien edita un
// campo dentro de <COD>/<CODEH> después de firmado, esto lo detecta.
//
// Corre server-side (no en el navegador) porque usa @xmldom/xmldom + Node crypto (vía
// xml-crypto), no Web Crypto — la canonicalización XML (C14N/exclusive-C14N) no tiene
// equivalente nativo en el navegador.
const checkSignatureForElement = (xmlContent, doc, elementId) => {
  const allSignatures = doc.getElementsByTagNameNS(XMLDSIG_NS, 'Signature');
  let targetSignature = null;
  for (let i = 0; i < allSignatures.length; i++) {
    const sig = allSignatures[i];
    const reference = sig.getElementsByTagNameNS(XMLDSIG_NS, 'Reference')[0];
    if (reference?.getAttribute('URI') === `#${elementId}`) {
      targetSignature = sig;
      break;
    }
  }

  if (!targetSignature) {
    return null; // sin firma para este elemento — no es un error, signature-utils.js ya lo reporta
  }

  try {
    const sig = new SignedXml({ getCertFromKeyInfo: SignedXml.getCertFromKeyInfo });
    sig.loadSignature(targetSignature);
    const integrityValid = sig.checkSignature(xmlContent);
    return { integrityValid };
  } catch (error) {
    return { integrityValid: null, error: error.message };
  }
};

export async function POST(request) {
  try {
    const { xmlContent } = await request.json();

    if (!xmlContent || typeof xmlContent !== 'string') {
      return NextResponse.json({ error: 'Se requiere xmlContent como string' }, { status: 400 });
    }
    if (xmlContent.length > MAX_XML_LENGTH) {
      return NextResponse.json({ error: 'El XML excede el tamaño máximo soportado' }, { status: 413 });
    }

    const doc = new DOMParser({ onError: () => {} }).parseFromString(xmlContent, 'text/xml');

    const results = {};
    for (const elementId of ELEMENT_IDS) {
      results[elementId] = checkSignatureForElement(xmlContent, doc, elementId);
    }

    return NextResponse.json(results);
  } catch (error) {
    return NextResponse.json({ error: 'Error al verificar la integridad de las firmas' }, { status: 500 });
  }
}
