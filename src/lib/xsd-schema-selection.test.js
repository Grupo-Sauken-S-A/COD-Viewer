import { describe, it, expect } from 'vitest';
import { resolveXsdSchema, XSD_NOT_APPLICABLE_REASON } from './xsd-schema-selection';

describe('resolveXsdSchema', () => {
  it('1.8.0 usa el XSD de 1.8.2 (1.8.0 nunca tuvo XSD propio)', () => {
    expect(resolveXsdSchema('1.8.0', 4)).toEqual({ applicable: true, fileName: 'cod_ver_1.8.2.xsd' });
  });

  it('cada versión conocida resuelve a su propia familia para la etapa 4 (completo)', () => {
    expect(resolveXsdSchema('1.8.2', 4)).toEqual({ applicable: true, fileName: 'cod_ver_1.8.2.xsd' });
    expect(resolveXsdSchema('1.8.3', 4)).toEqual({ applicable: true, fileName: 'cod_ver_1.8.3.xsd' });
    expect(resolveXsdSchema('4.1.1', 4)).toEqual({ applicable: true, fileName: 'cod_ver_4.1.1.xsd' });
  });

  it('etapa 1 (borrador) usa el sufijo _exporter_unsigned', () => {
    expect(resolveXsdSchema('4.1.1', 1)).toEqual({ applicable: true, fileName: 'cod_ver_4.1.1_exporter_unsigned.xsd' });
  });

  it('etapa 2 (firmado por EXP) usa el sufijo _exporter_signed', () => {
    expect(resolveXsdSchema('4.1.1', 2)).toEqual({ applicable: true, fileName: 'cod_ver_4.1.1_exporter_signed.xsd' });
  });

  it('etapa 3 (certificado por la EH, sin firma del FH) no tiene XSD', () => {
    expect(resolveXsdSchema('4.1.1', 3)).toEqual({ applicable: false, reason: XSD_NOT_APPLICABLE_REASON.STAGE_3 });
  });

  it('etapa "anomalo" no tiene XSD', () => {
    expect(resolveXsdSchema('4.1.1', 'anomalo')).toEqual({ applicable: false, reason: XSD_NOT_APPLICABLE_REASON.STAGE_ANOMALO });
  });

  it('una versión de CODVer desconocida no tiene XSD', () => {
    expect(resolveXsdSchema('9.9.9', 4)).toEqual({ applicable: false, reason: XSD_NOT_APPLICABLE_REASON.UNKNOWN_VERSION });
  });

  it('un stage indefinido/null no tiene XSD', () => {
    expect(resolveXsdSchema('4.1.1', undefined)).toEqual({ applicable: false, reason: XSD_NOT_APPLICABLE_REASON.UNKNOWN_STAGE });
    expect(resolveXsdSchema('4.1.1', null)).toEqual({ applicable: false, reason: XSD_NOT_APPLICABLE_REASON.UNKNOWN_STAGE });
  });
});
