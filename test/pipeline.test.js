// Replica el pipeline de CODViewer.processXML() (src/components/CODViewer.jsx) para probar,
// de punta a punta, cómo reacciona la aplicación ante entradas reales y ante errores generales
// de carga, sin necesidad de montar el árbol de React completo.
import { describe, it, expect } from 'vitest';
import { validateEncoding, validateStructure } from '@/lib/input-validation';
import { getEmissionStage, validateSubmitterType } from '@/components/signature-utils';
import { XML_SPECIFICATIONS } from '@/components/xml-specifications';
import {
  hasRealFixtures,
  availableRealFixtures,
  loadRealFixture,
  stripElement,
} from './helpers/fixtures';

// Mismos pasos que CODViewer.processXML(): parsear, y si no hay parsererror, correr las
// validaciones de entrada + detección de etapa de emisión.
const runPipeline = (xmlContent) => {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlContent, 'text/xml');

  if (xmlDoc.getElementsByTagName('parsererror').length > 0) {
    return { parseError: true };
  }

  const submitterTypeWarning = validateSubmitterType(xmlDoc);
  const warnings = [
    ...validateEncoding(xmlContent),
    ...validateStructure(xmlDoc, XML_SPECIFICATIONS),
    ...(submitterTypeWarning ? [submitterTypeWarning] : []),
  ];

  return { parseError: false, xmlDoc, warnings, emissionStage: getEmissionStage(xmlDoc) };
};

describe('pipeline de carga: entradas que no son un COD válido', () => {
  it('contenido que no es XML en absoluto produce un error de parseo detectable', () => {
    const result = runPipeline('Esto no es un XML, es texto plano.');
    expect(result.parseError).toBe(true);
  });

  it('XML mal formado (tag sin cerrar) produce un error de parseo detectable', () => {
    const result = runPipeline('<root><abierto></root>');
    expect(result.parseError).toBe(true);
  });

  it('un objeto JSON no es XML válido', () => {
    const result = runPipeline('{"esto": "es json, no xml"}');
    expect(result.parseError).toBe(true);
  });

  it('XML válido pero sin ninguna estructura de COD genera advertencias, no una excepción', () => {
    const result = runPipeline('<?xml version="1.0" encoding="UTF-8"?><algoOtroCosa>hola</algoOtroCosa>');
    expect(result.parseError).toBe(false);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some((w) => w.includes('CODVer'))).toBe(true);
    expect(result.warnings.some((w) => w.includes('AgreementAcronym'))).toBe(true);
    expect(result.warnings.some((w) => w.includes('id="COD"'))).toBe(true);
  });
});

describe.runIf(hasRealFixtures())('pipeline de carga contra los 6 COD reales', () => {
  for (const name of availableRealFixtures()) {
    it(`${name}: se procesa sin advertencias y queda en etapa 4 (completo)`, () => {
      const result = runPipeline(loadRealFixture(name));
      expect(result.parseError).toBe(false);
      expect(result.warnings).toEqual([]);
      expect(result.emissionStage.stage).toBe(4);
    });

    it(`${name}: quitarle solo la firma del Exportador (queda la de la EH) se detecta como orden de firmas anómalo, sin romper el pipeline`, () => {
      // stripElement saca la primera <ds:Signature> del documento, que es la del Exportador
      // (#COD) — la de la EH (#CODEH) y los datos de <EH>/<CertificationEH> quedan intactos,
      // así que el documento queda con la firma "de más" sin la firma previa que debería existir.
      const xml = stripElement(loadRealFixture(name), 'ds:Signature');
      const result = runPipeline(xml);
      expect(result.parseError).toBe(false);
      expect(result.emissionStage.stage).toBe('anomalo');
    });

    it(`${name}: contenido truncado a la mitad (simulación de una descarga incompleta) da error de parseo`, () => {
      const full = loadRealFixture(name);
      const truncated = full.slice(0, Math.floor(full.length / 2));
      const result = runPipeline(truncated);
      expect(result.parseError).toBe(true);
    });
  }
});
