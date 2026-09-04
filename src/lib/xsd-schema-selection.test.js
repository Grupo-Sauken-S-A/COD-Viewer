import { describe, it, expect } from 'vitest';
import { resolveXsdFileName } from './xsd-schema-selection';

describe('resolveXsdFileName', () => {
  it('1.8.0 usa el XSD de 1.8.2 (1.8.0 nunca tuvo XSD propio)', () => {
    expect(resolveXsdFileName('1.8.0', 4)).toBe('cod_ver_1.8.2.xsd');
  });

  it('cada versión conocida resuelve a su propia familia para la etapa 4 (completo)', () => {
    expect(resolveXsdFileName('1.8.2', 4)).toBe('cod_ver_1.8.2.xsd');
    expect(resolveXsdFileName('1.8.3', 4)).toBe('cod_ver_1.8.3.xsd');
    expect(resolveXsdFileName('4.1.1', 4)).toBe('cod_ver_4.1.1.xsd');
  });

  it('etapa 1 (borrador) usa el sufijo _exporter_unsigned', () => {
    expect(resolveXsdFileName('4.1.1', 1)).toBe('cod_ver_4.1.1_exporter_unsigned.xsd');
  });

  it('etapa 2 (firmado por EXP) usa el sufijo _exporter_signed', () => {
    expect(resolveXsdFileName('4.1.1', 2)).toBe('cod_ver_4.1.1_exporter_signed.xsd');
  });

  it('etapa 3 (certificado por la EH, sin firma del FH) no tiene XSD — devuelve null', () => {
    expect(resolveXsdFileName('4.1.1', 3)).toBeNull();
  });

  it('etapa "anomalo" no tiene XSD — devuelve null', () => {
    expect(resolveXsdFileName('4.1.1', 'anomalo')).toBeNull();
  });

  it('una versión de CODVer desconocida devuelve null', () => {
    expect(resolveXsdFileName('9.9.9', 4)).toBeNull();
  });

  it('un stage indefinido/null devuelve null', () => {
    expect(resolveXsdFileName('4.1.1', undefined)).toBeNull();
    expect(resolveXsdFileName('4.1.1', null)).toBeNull();
  });
});
