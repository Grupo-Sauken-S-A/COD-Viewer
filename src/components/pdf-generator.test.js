// Test de humo: genera el documento PDF completo para cada COD real (y variantes mutadas que
// simulan etapas de emisión incompletas y errores de entrada) y verifica que no lance
// excepciones. Usa buildCODPDFDocument (no generateCODPDF) para no disparar doc.save(): en este
// entorno de test, jsPDF detecta Node y escribe el PDF directamente a disco en vez de simular
// una descarga de navegador, así que llamar a generateCODPDF de verdad dejaba archivos reales
// (con datos de exportadores/firmantes reales) tirados en el directorio del proyecto.
// Este test no valida el contenido visual/posicional del PDF (para eso se usó una inspección
// manual con pdfjs-dist durante el desarrollo) — es una guarda de regresión contra errores que
// rompan la generación entera, como el bug de wrapping desparejo que motivó este archivo de test
// (ver CHANGELOG, sección "Unreleased"/1.1.0).
import { describe, it, expect } from 'vitest';
import { buildCODPDFDocument } from './pdf-generator';
import {
  hasRealFixtures,
  availableRealFixtures,
  loadRealFixture,
  stripSignatureForReference,
  stripElement,
} from '../../test/helpers/fixtures';

const parse = (xml) => new DOMParser().parseFromString(xml, 'text/xml');

describe.runIf(hasRealFixtures())('buildCODPDFDocument contra COD reales y variantes mutadas', () => {
  for (const name of availableRealFixtures()) {
    it(`${name}: genera el PDF completo sin lanzar excepción`, async () => {
      const doc = parse(loadRealFixture(name));
      const { doc: pdfDoc, filename } = await buildCODPDFDocument(doc, { inputWarnings: [], emissionStage: { stage: 4, label: 'COD completo' } });
      expect(pdfDoc).toBeTruthy();
      expect(filename).toMatch(/\.pdf$/);
    });

    it(`${name}: también genera el PDF para un COD en etapa 3 (con marca de agua de incompleto)`, async () => {
      const xml = stripSignatureForReference(loadRealFixture(name), '#CODEH');
      const doc = parse(xml);
      const { doc: pdfDoc } = await buildCODPDFDocument(doc, { inputWarnings: [], emissionStage: { stage: 3, label: 'Certificado por la EH — pendiente de firma del FH' } });
      expect(pdfDoc).toBeTruthy();
    });

    it(`${name}: también genera el PDF cuando hay advertencias de validación de entrada`, async () => {
      const doc = parse(loadRealFixture(name));
      const { doc: pdfDoc } = await buildCODPDFDocument(doc, {
        inputWarnings: ['El acuerdo "A99" no es uno de los acuerdos reconocidos por esta aplicación.'],
        emissionStage: { stage: 4, label: 'COD completo' },
      });
      expect(pdfDoc).toBeTruthy();
    });

    it(`${name}: no explota si falta el certificado X.509 dentro de la firma`, async () => {
      const xml = stripElement(loadRealFixture(name), 'X509Certificate');
      const doc = parse(xml);
      const { doc: pdfDoc } = await buildCODPDFDocument(doc, { inputWarnings: [], emissionStage: { stage: 4, label: 'COD completo' } });
      expect(pdfDoc).toBeTruthy();
    });
  }
});
