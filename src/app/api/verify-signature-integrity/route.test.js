// Prueba la verificación criptográfica real de integridad de firma (digest + SignatureValue,
// vía xml-crypto) contra COD reales — incluyendo el caso central de esta funcionalidad:
// un COD con ambas firmas presentes al que se le edita un campo firmado después de firmado
// debe detectarse como inválido, no seguir mostrándose como "firma presente y vigente".
import { describe, it, expect } from 'vitest';
import { POST } from './route';
import {
  hasRealFixtures,
  availableRealFixtures,
  loadRealFixture,
  replaceElementText,
} from '../../../../test/helpers/fixtures';

const postJson = async (body) => {
  const request = new Request('http://localhost/api/verify-signature-integrity', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const response = await POST(request);
  return { status: response.status, body: await response.json() };
};

describe('POST /api/verify-signature-integrity — validaciones de entrada', () => {
  it('rechaza si falta xmlContent', async () => {
    const { status, body } = await postJson({});
    expect(status).toBe(400);
    expect(body.error).toBeTruthy();
  });

  it('rechaza un xmlContent demasiado grande', async () => {
    const { status } = await postJson({ xmlContent: 'x'.repeat(6 * 1024 * 1024) });
    expect(status).toBe(413);
  });

  it('devuelve null (sin firma) para ambos elementos si el XML no tiene firmas', async () => {
    const { status, body } = await postJson({ xmlContent: '<root><COD id="COD">sin firmar</COD></root>' });
    expect(status).toBe(200);
    expect(body.COD).toBeNull();
    expect(body.CODEH).toBeNull();
  });
});

describe.runIf(hasRealFixtures())('POST /api/verify-signature-integrity — contra COD reales', () => {
  for (const name of availableRealFixtures()) {
    it(`${name}: ambas firmas (#COD y #CODEH) verifican íntegras`, async () => {
      const { status, body } = await postJson({ xmlContent: loadRealFixture(name) });
      expect(status).toBe(200);
      expect(body.COD).toEqual({ integrityValid: true });
      expect(body.CODEH).toEqual({ integrityValid: true });
    });

    it(`${name}: editar un campo dentro de <COD> después de firmado invalida AMBAS firmas`, async () => {
      // #CODEH cubre todo el documento (incluida la firma de #COD), así que alterar algo
      // dentro de <COD> rompe el digest de las dos referencias — coincide con el mecanismo
      // de emisión real documentado (ver docs/BUSINESS_RULES.md).
      const tampered = replaceElementText(loadRealFixture(name), 'CODSubmitterType', 'FH');
      const { body } = await postJson({ xmlContent: tampered });
      expect(body.COD.integrityValid).toBe(false);
      expect(body.CODEH.integrityValid).toBe(false);
    });

    it(`${name}: editar un campo de <EH> (fuera de <COD>) invalida solo #CODEH, no #COD`, async () => {
      const tampered = replaceElementText(loadRealFixture(name), 'EHId', '999');
      const { body } = await postJson({ xmlContent: tampered });
      expect(body.COD.integrityValid).toBe(true);
      expect(body.CODEH.integrityValid).toBe(false);
    });
  }
});
