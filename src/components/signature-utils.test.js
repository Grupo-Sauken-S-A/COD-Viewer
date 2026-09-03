import { describe, it, expect } from 'vitest';
import {
  verifySignatureForElement,
  getSignatureStatusDisplay,
  getEmissionStage,
  validateSubmitterType,
  EMISSION_STAGE_LABELS,
} from './signature-utils';
import {
  hasRealFixtures,
  availableRealFixtures,
  loadRealFixture,
  stripElement,
  stripSignatureForReference,
  replaceElementText,
} from '../../test/helpers/fixtures';

const parse = (xml) => new DOMParser().parseFromString(xml, 'text/xml');

describe.runIf(hasRealFixtures())('verifySignatureForElement contra COD reales completos', () => {
  for (const name of availableRealFixtures()) {
    it(`${name}: ambas firmas (EXP #COD y FH #CODEH) están presentes y su certificado era válido al firmar`, async () => {
      const doc = parse(loadRealFixture(name));

      for (const elementId of ['COD', 'CODEH']) {
        const status = await verifySignatureForElement(doc, elementId);
        expect(status.hasSignature, `${elementId} debería tener firma`).toBe(true);
        expect(status.signerName).toBeTruthy();
        expect(status.duplicateSignatures).toBe(false);

        // Regresión del bug del parser ASN.1: getCertificateValidity devolvía null
        // silenciosamente por leer un campo equivocado de la estructura DER.
        expect(status.certNotBefore, 'certNotBefore no debería ser null (bug del parser ASN.1)').not.toBeNull();
        expect(status.certNotAfter).not.toBeNull();
        expect(status.certNotBefore.getTime()).toBeLessThan(status.certNotAfter.getTime());

        // Regresión del bug de fecha de referencia: la vigencia se compara contra la fecha
        // real de ESA firma (DeclarationDate/CertificateDate), nunca contra "hoy".
        expect(status.certValidityKnown, 'debería poder determinar la fecha de referencia').toBe(true);
        expect(status.referenceDateSource).toBe(elementId === 'COD' ? 'DeclarationDate' : 'CertificateDate');
        expect(status.certExpired, 'un COD real de producción no debería figurar vencido al momento de firmarlo').toBe(false);
        expect(status.certNotYetValid).toBe(false);
      }
    });
  }

  // Valores exactos verificados manualmente contra el certificado real (investigación de esta
  // sesión al corregir el parser ASN.1) — guarda de regresión de esos valores puntuales.
  it('AR004A57220000042500.xml: valores exactos de vigencia y firmante conocidos', async () => {
    const doc = parse(loadRealFixture('AR004A57220000042500.xml'));

    const exp = await verifySignatureForElement(doc, 'COD');
    expect(exp.signerName).toBe('FERRUTTI Cristian Ernesto');
    expect(exp.certNotBefore.toISOString()).toBe('2020-12-15T13:10:18.000Z');
    expect(exp.certNotAfter.toISOString()).toBe('2022-12-15T13:10:18.000Z');
    expect(exp.signatureAlgorithm).toBe('RSA-SHA1');
    expect(exp.signatureAlgorithmWeak).toBe(true);
    expect(exp.digestAlgorithm).toBe('SHA-1');

    const fh = await verifySignatureForElement(doc, 'CODEH');
    expect(fh.signerName).toBe('MORENO Emiliano David');
    expect(fh.certNotBefore.toISOString()).toBe('2020-09-29T14:03:32.000Z');
    expect(fh.certNotAfter.toISOString()).toBe('2022-09-29T14:03:32.000Z');
  });
});

describe('verifySignatureForElement — casos sintéticos de error', () => {
  it('devuelve hasSignature:false si el elemento no existe', async () => {
    const doc = parse('<root></root>');
    const status = await verifySignatureForElement(doc, 'COD');
    expect(status.hasSignature).toBe(false);
    expect(status.error).toMatch(/No se encontró el elemento/);
  });

  it('devuelve hasSignature:false si el elemento existe pero no tiene firma', async () => {
    const doc = parse('<root><COD id="COD">contenido</COD></root>');
    const status = await verifySignatureForElement(doc, 'COD');
    expect(status.hasSignature).toBe(false);
    expect(status.error).toMatch(/No se encontró firma digital/);
  });

  it('detecta firmas duplicadas para el mismo elemento', async () => {
    const sig = (uri) => `<ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><ds:SignedInfo><ds:Reference URI="${uri}"/></ds:SignedInfo></ds:Signature>`;
    const doc = parse(`<root><COD id="COD">c</COD>${sig('#COD')}${sig('#COD')}</root>`);
    const status = await verifySignatureForElement(doc, 'COD');
    expect(status.hasSignature).toBe(true);
    expect(status.duplicateSignatures).toBe(true);
  });

  it('certValidityKnown es false si no hay fecha de referencia en el XML (no debe asumir que es válido)', async () => {
    const doc = parse(
      '<root><COD id="COD">c</COD>' +
      '<ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><ds:SignedInfo><ds:Reference URI="#COD"/></ds:SignedInfo></ds:Signature>' +
      '</root>'
    );
    const status = await verifySignatureForElement(doc, 'COD');
    expect(status.hasSignature).toBe(true);
    expect(status.certValidityKnown).toBe(false);
    expect(status.certExpired).toBe(false);
    expect(status.certNotYetValid).toBe(false);
  });
});

describe('getSignatureStatusDisplay', () => {
  it('severidad "warning" y texto correspondiente cuando no hay firma', () => {
    const display = getSignatureStatusDisplay({ hasSignature: false, error: 'No se encontró firma digital para el elemento: COD' });
    expect(display.severity).toBe('warning');
    expect(display.text).toContain('No se encontró firma digital');
  });

  it('severidad "error" cuando el certificado no estaba vigente al firmar', () => {
    const display = getSignatureStatusDisplay({
      hasSignature: true,
      signerName: 'Alguien',
      signatureAlgorithm: 'RSA-SHA256',
      signatureAlgorithmWeak: false,
      digestAlgorithm: 'SHA-256',
      certNotBefore: new Date('2020-01-01T00:00:00Z'),
      certNotAfter: new Date('2020-06-01T00:00:00Z'),
      referenceDate: new Date('2021-01-01T00:00:00Z'),
      referenceDateSource: 'DeclarationDate',
      certValidityKnown: true,
      certExpired: true,
      certNotYetValid: false,
      duplicateSignatures: false,
    });
    expect(display.severity).toBe('error');
    expect(display.text).toMatch(/NO estaba vigente/);
  });

  it('severidad "warning" (no "error") por algoritmo débil aunque el certificado sí estuviera vigente', () => {
    const display = getSignatureStatusDisplay({
      hasSignature: true,
      signerName: 'Alguien',
      signatureAlgorithm: 'RSA-SHA1',
      signatureAlgorithmWeak: true,
      digestAlgorithm: 'SHA-1',
      certNotBefore: new Date('2020-01-01T00:00:00Z'),
      certNotAfter: new Date('2022-01-01T00:00:00Z'),
      referenceDate: new Date('2021-01-01T00:00:00Z'),
      referenceDateSource: 'DeclarationDate',
      certValidityKnown: true,
      certExpired: false,
      certNotYetValid: false,
      duplicateSignatures: false,
    });
    expect(display.severity).toBe('warning');
  });

  it('severidad "ok" para una firma fuerte y vigente al momento de firmar', () => {
    const display = getSignatureStatusDisplay({
      hasSignature: true,
      signerName: 'Alguien',
      signatureAlgorithm: 'RSA-SHA256',
      signatureAlgorithmWeak: false,
      digestAlgorithm: 'SHA-256',
      certNotBefore: new Date('2020-01-01T00:00:00Z'),
      certNotAfter: new Date('2022-01-01T00:00:00Z'),
      referenceDate: new Date('2021-01-01T00:00:00Z'),
      referenceDateSource: 'DeclarationDate',
      certValidityKnown: true,
      certExpired: false,
      certNotYetValid: false,
      duplicateSignatures: false,
    });
    expect(display.severity).toBe('ok');
  });

  it('severidad "error" y alerta clara cuando integrityValid es false (documento editado post-firma)', () => {
    // Este es el caso central que motivó agregar la verificación de integridad: un COD con
    // certificado vigente y algoritmo fuerte, pero cuyo contenido firmado fue alterado.
    const display = getSignatureStatusDisplay({
      hasSignature: true,
      signerName: 'Alguien',
      signatureAlgorithm: 'RSA-SHA256',
      signatureAlgorithmWeak: false,
      digestAlgorithm: 'SHA-256',
      certNotBefore: new Date('2020-01-01T00:00:00Z'),
      certNotAfter: new Date('2022-01-01T00:00:00Z'),
      referenceDate: new Date('2021-01-01T00:00:00Z'),
      referenceDateSource: 'DeclarationDate',
      certValidityKnown: true,
      certExpired: false,
      certNotYetValid: false,
      duplicateSignatures: false,
      integrityValid: false,
    });
    expect(display.severity).toBe('error');
    expect(display.text).toMatch(/modificado después de haber sido firmado/);
    expect(display.text).toMatch(/INVÁLIDA/);
  });

  it('confirma la integridad cuando integrityValid es true', () => {
    const display = getSignatureStatusDisplay({
      hasSignature: true, signerName: 'Alguien', signatureAlgorithm: 'RSA-SHA256',
      signatureAlgorithmWeak: false, digestAlgorithm: 'SHA-256', duplicateSignatures: false,
      integrityValid: true,
    });
    expect(display.text).toMatch(/Integridad verificada/);
    expect(display.severity).toBe('ok');
  });

  it('no afirma nada cuando integrityValid es null/undefined (no se pudo determinar)', () => {
    const display = getSignatureStatusDisplay({
      hasSignature: true, signerName: 'Alguien', signatureAlgorithm: 'RSA-SHA256',
      signatureAlgorithmWeak: false, digestAlgorithm: 'SHA-256', duplicateSignatures: false,
    });
    expect(display.text).toMatch(/No se pudo verificar criptográficamente/);
    expect(display.severity).toBe('ok');
  });

  it('menciona S-FiDE como sugerencia de aplicación alternativa', () => {
    const display = getSignatureStatusDisplay({ hasSignature: false, error: 'x' });
    // El caso sin firma no incluye la nota; se prueba con un caso con firma.
    const displayConFirma = getSignatureStatusDisplay({
      hasSignature: true, signerName: 'Alguien', signatureAlgorithm: 'RSA-SHA256',
      signatureAlgorithmWeak: false, digestAlgorithm: 'SHA-256', duplicateSignatures: false,
    });
    expect(displayConFirma.text).toContain('S-FiDE');
  });
});

describe('getEmissionStage', () => {
  const sig = (uri) => `<ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><ds:SignedInfo><ds:Reference URI="${uri}"/></ds:SignedInfo></ds:Signature>`;

  it('etapa 1: borrador sin firmar', () => {
    const doc = parse('<CODEH id="CODEH"><CODExporter><COD id="COD"></COD></CODExporter></CODEH>');
    expect(getEmissionStage(doc)).toEqual({ stage: 1, label: EMISSION_STAGE_LABELS[1] });
  });

  it('etapa 2: firmado por el Exportador, sin datos de la EH', () => {
    const doc = parse(`<CODEH id="CODEH"><CODExporter><COD id="COD"></COD>${sig('#COD')}</CODExporter></CODEH>`);
    expect(getEmissionStage(doc)).toEqual({ stage: 2, label: EMISSION_STAGE_LABELS[2] });
  });

  it('etapa 3: con datos de certificación de la EH, sin firma del FH', () => {
    const doc = parse(`<CODEH id="CODEH"><CODExporter><COD id="COD"></COD>${sig('#COD')}</CODExporter><EH>e</EH><CertificationEH>c</CertificationEH></CODEH>`);
    expect(getEmissionStage(doc)).toEqual({ stage: 3, label: EMISSION_STAGE_LABELS[3] });
  });

  it('etapa 4: completo, ambas firmas presentes', () => {
    const doc = parse(`<CODEH id="CODEH"><CODExporter><COD id="COD"></COD>${sig('#COD')}</CODExporter><EH>e</EH><CertificationEH>c</CertificationEH>${sig('#CODEH')}</CODEH>`);
    expect(getEmissionStage(doc)).toEqual({ stage: 4, label: EMISSION_STAGE_LABELS[4] });
  });

  it('anómalo: la EH firmó #CODEH sin que el Exportador haya firmado #COD', () => {
    const doc = parse(`<CODEH id="CODEH"><CODExporter><COD id="COD"></COD></CODExporter>${sig('#CODEH')}</CODEH>`);
    expect(getEmissionStage(doc).stage).toBe('anomalo');
  });

  it('anómalo: hay datos de certificación de la EH sin que el Exportador haya firmado', () => {
    const doc = parse('<CODEH id="CODEH"><CODExporter><COD id="COD"></COD></CODExporter><EH>e</EH><CertificationEH>c</CertificationEH></CODEH>');
    expect(getEmissionStage(doc).stage).toBe('anomalo');
  });
});

describe.runIf(hasRealFixtures())('getEmissionStage / validateSubmitterType contra COD reales', () => {
  for (const name of availableRealFixtures()) {
    it(`${name}: es un COD completo (etapa 4) sin advertencia de tipo de remitente`, () => {
      const doc = parse(loadRealFixture(name));
      expect(getEmissionStage(doc)).toEqual({ stage: 4, label: EMISSION_STAGE_LABELS[4] });
      expect(validateSubmitterType(doc)).toBeNull();
    });

    it(`${name}: si se quita la firma del Funcionario Habilitado (#CODEH), baja a etapa 3`, () => {
      const xml = stripSignatureForReference(loadRealFixture(name), '#CODEH');
      const doc = parse(xml);
      expect(getEmissionStage(doc).stage).toBe(3);
    });

    it(`${name}: si además se quita <EH>/<CertificationEH>, baja a etapa 2`, () => {
      let xml = stripSignatureForReference(loadRealFixture(name), '#CODEH');
      xml = stripElement(xml, 'CertificationEH');
      xml = stripElement(xml, 'EH');
      const doc = parse(xml);
      expect(getEmissionStage(doc).stage).toBe(2);
    });

    it(`${name}: CODSubmitterType adulterado a "FH" genera advertencia`, () => {
      const xml = replaceElementText(loadRealFixture(name), 'CODSubmitterType', 'FH');
      const doc = parse(xml);
      expect(validateSubmitterType(doc)).toMatch(/FH/);
    });
  }
});
