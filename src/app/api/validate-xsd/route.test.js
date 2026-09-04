// Prueba la validación contra el XSD oficial de ALADI (Etapa 2) contra COD reales — el
// esquema a usar se elige según CODVer y la etapa de emisión real de cada fixture (ver
// src/lib/xsd-schema-selection.js), no se asume que todos estén completos.
import { describe, it, expect } from 'vitest';
import { POST } from './route';
import { getEmissionStage } from '@/components/signature-utils';
import { XSD_NOT_APPLICABLE_REASON } from '@/lib/xsd-schema-selection';
import {
  hasRealFixtures,
  availableRealFixtures,
  loadRealFixture,
  stripElement,
} from '../../../../test/helpers/fixtures';

const postJson = async (body) => {
  const request = new Request('http://localhost/api/validate-xsd', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const response = await POST(request);
  return { status: response.status, body: await response.json() };
};

const versionOf = (xml) => xml.match(/<CODVer>([^<]*)<\/CODVer>/)?.[1];
const stageOf = (xml) => getEmissionStage(new DOMParser().parseFromString(xml, 'text/xml')).stage;

describe('POST /api/validate-xsd — validaciones de entrada', () => {
  it('rechaza si falta xmlContent', async () => {
    const { status, body } = await postJson({ version: '4.1.1', stage: 4 });
    expect(status).toBe(400);
    expect(body.error).toBeTruthy();
  });

  it('rechaza un xmlContent demasiado grande', async () => {
    const { status } = await postJson({ xmlContent: 'x'.repeat(6 * 1024 * 1024), version: '4.1.1', stage: 4 });
    expect(status).toBe(413);
  });

  it('devuelve applicable:false con el motivo para una versión desconocida', async () => {
    const { status, body } = await postJson({ xmlContent: '<root/>', version: '9.9.9', stage: 4 });
    expect(status).toBe(200);
    expect(body.applicable).toBe(false);
    expect(body.reason).toBe(XSD_NOT_APPLICABLE_REASON.UNKNOWN_VERSION);
  });

  it('devuelve applicable:false con el motivo para la etapa 3 (sin XSD que la describa)', async () => {
    const { status, body } = await postJson({ xmlContent: '<root/>', version: '4.1.1', stage: 3 });
    expect(status).toBe(200);
    expect(body.applicable).toBe(false);
    expect(body.reason).toBe(XSD_NOT_APPLICABLE_REASON.STAGE_3);
  });

  it('devuelve applicable:false con el motivo para la etapa "anomalo"', async () => {
    const { body } = await postJson({ xmlContent: '<root/>', version: '4.1.1', stage: 'anomalo' });
    expect(body.applicable).toBe(false);
    expect(body.reason).toBe(XSD_NOT_APPLICABLE_REASON.STAGE_ANOMALO);
  });
});

describe.runIf(hasRealFixtures())('POST /api/validate-xsd — contra COD reales', () => {
  for (const name of availableRealFixtures()) {
    it(`${name}: valida limpio contra el XSD que le corresponde según su versión/etapa reales`, async () => {
      const xmlContent = loadRealFixture(name);
      const version = versionOf(xmlContent);
      const stage = stageOf(xmlContent);

      const { status, body } = await postJson({ xmlContent, version, stage });

      expect(status).toBe(200);
      expect(body.applicable).toBe(true);
      expect(body.valid).toBe(true);
      expect(body.errors).toEqual([]);
    });

    it(`${name}: quitar un elemento mandatorio del XSD (Declaration) hace que la validación falle`, async () => {
      const xmlContent = loadRealFixture(name);
      const version = versionOf(xmlContent);
      const stage = stageOf(xmlContent);
      const tampered = stripElement(xmlContent, 'Declaration');

      const { body } = await postJson({ xmlContent: tampered, version, stage });

      expect(body.applicable).toBe(true);
      expect(body.valid).toBe(false);
      expect(body.errors.length).toBeGreaterThan(0);
      // Cada error debe poder ubicarse en el XML — no alcanza con decir "hay un problema".
      expect(body.errors[0].message).toBeTruthy();
      expect(typeof body.errors[0].line).toBe('number');
    });
  }
});
