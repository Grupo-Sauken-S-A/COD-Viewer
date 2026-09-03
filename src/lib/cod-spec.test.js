import { describe, it, expect } from 'vitest';
import {
  AGREEMENT_MAPPING,
  getMappedAgreement,
  getFieldRequirement,
  getElementWithSpecPriority,
  getGoodsItemNameField,
  getValueFieldWithSpecPriority,
  getOperatorContent,
  getEHCityFieldWithSpecPriority,
  getUnexpectedElements,
  isRequiredFieldEmpty,
} from './cod-spec';
import { XML_SPECIFICATIONS } from '@/components/xml-specifications';

const parseFragment = (xml) => new DOMParser().parseFromString(xml, 'text/xml');

describe('AGREEMENT_MAPPING / getMappedAgreement', () => {
  it('mapea A13, A14 y A57 a A18 (regla post-ROM MERCOSUR)', () => {
    expect(getMappedAgreement('A13')).toBe('A18');
    expect(getMappedAgreement('A14')).toBe('A18');
    expect(getMappedAgreement('A57')).toBe('A18');
  });

  it('deja A18, A35 y A72 sin cambios', () => {
    expect(getMappedAgreement('A18')).toBe('A18');
    expect(getMappedAgreement('A35')).toBe('A35');
    expect(getMappedAgreement('A72')).toBe('A72');
  });

  it('devuelve el acuerdo original si no está en la tabla', () => {
    expect(getMappedAgreement('A99')).toBe('A99');
  });

  it('la tabla no tiene más acuerdos de los 6 esperados', () => {
    expect(Object.keys(AGREEMENT_MAPPING).sort()).toEqual(['A13', 'A14', 'A18', 'A35', 'A57', 'A72']);
  });
});

describe('getFieldRequirement', () => {
  it('devuelve NC para un elemento que no existe en la especificación', () => {
    expect(getFieldRequirement(XML_SPECIFICATIONS, '1.8.2', 'A18', 'ElementoInventado')).toBe('NC');
  });

  it('devuelve O si falta alguno de los parámetros (comportamiento conservador)', () => {
    expect(getFieldRequirement(null, '1.8.2', 'A18', 'Affidavit')).toBe('O');
    expect(getFieldRequirement(XML_SPECIFICATIONS, null, 'A18', 'Affidavit')).toBe('O');
    expect(getFieldRequirement(XML_SPECIFICATIONS, '1.8.2', null, 'Affidavit')).toBe('O');
  });

  it('Affidavit es NC en 1.8.x y M solo en 4.1.1 (regla post-ROM)', () => {
    expect(getFieldRequirement(XML_SPECIFICATIONS, '1.8.2', 'A18', 'Affidavit')).toBe('NC');
    expect(getFieldRequirement(XML_SPECIFICATIONS, '4.1.1', 'A18', 'Affidavit')).toBe('M');
  });

  it('Op3cStatement es Opcional (no NC) para A72 en todas las versiones', () => {
    // Regresión: este campo estaba mal cargado como NC para 1.8.x hasta que se corrigió contra un XML real.
    for (const version of ['1.8.0', '1.8.2', '1.8.3', '4.1.1']) {
      expect(getFieldRequirement(XML_SPECIFICATIONS, version, 'A72', 'Op3cStatement')).toBe('O');
    }
  });

  it('aplica el mapeo de acuerdo antes de consultar la tabla (A57 se comporta como A18)', () => {
    expect(getFieldRequirement(XML_SPECIFICATIONS, '4.1.1', 'A57', 'Affidavit'))
      .toBe(getFieldRequirement(XML_SPECIFICATIONS, '4.1.1', 'A18', 'Affidavit'));
    expect(getFieldRequirement(XML_SPECIFICATIONS, '4.1.1', 'A57', 'Affidavit')).toBe('M');
  });

  it('los campos *Fax (EHFax, ExporterFax, ImporterFax) ya no existen en 4.1.1: NC en todos los acuerdos', () => {
    // Regresión: el XSD real de 4.1.1 no tiene ningún campo Fax (confirmado por el usuario);
    // la tabla tenía A35/A72 en O por error, heredado de las versiones 1.8.x donde sí existen.
    for (const field of ['EHFax', 'ExporterFax', 'ImporterFax']) {
      for (const agreement of ['A18', 'A35', 'A72']) {
        expect(getFieldRequirement(XML_SPECIFICATIONS, '4.1.1', agreement, field)).toBe('NC');
      }
    }
  });

  it('CertificateControlCode es Facultativo (no NC) en 4.1.1 para todos los acuerdos', () => {
    // Regresión: ALADI_SEC_di2327_Rev13.pdf marca A18/4.1.1 como NC, pero el XSD real de 4.1.1
    // sí lo acepta (confirmado por el usuario contra un COD real en producción).
    for (const agreement of ['A18', 'A35', 'A72']) {
      expect(getFieldRequirement(XML_SPECIFICATIONS, '4.1.1', agreement, 'CertificateControlCode')).toBe('O');
    }
  });

  it('UnloadingPortName es Opcional en las 12 combinaciones — confirmado que nunca se usa', () => {
    // Regresión: la tabla lo traía como M en casi todas las combinaciones (heredado del
    // estándar ALADI), pero el usuario confirmó que nunca aparece en ningún COD real de los
    // acuerdos/versiones que maneja esta app. Se baja a O para que, si alguna vez aparece con
    // contenido, no se marque como "dato inesperado" — sigue sin código que lo lea o lo muestre.
    for (const version of ['1.8.0', '1.8.2', '1.8.3', '4.1.1']) {
      for (const agreement of ['A18', 'A35', 'A72']) {
        expect(getFieldRequirement(XML_SPECIFICATIONS, version, agreement, 'UnloadingPortName')).toBe('O');
      }
    }
  });
});

describe('getElementWithSpecPriority', () => {
  it('usa el primer elemento de la lista cuya especificación no sea NC', () => {
    const xmlDoc = parseFragment('<root><Affidavit>si</Affidavit></root>');
    const result = getElementWithSpecPriority(
      XML_SPECIFICATIONS, '4.1.1', 'A18', xmlDoc, 'ElementoInventado', ['Affidavit']
    );
    expect(result).toEqual({ value: 'si', foundElement: 'Affidavit', requirement: 'M' });
  });

  it('devuelve NC si ningún elemento de la lista aplica a esta versión/acuerdo', () => {
    const xmlDoc = parseFragment('<root><Affidavit>si</Affidavit></root>');
    const result = getElementWithSpecPriority(
      XML_SPECIFICATIONS, '1.8.2', 'A18', xmlDoc, 'Affidavit', []
    );
    expect(result).toEqual({ value: null, foundElement: null, requirement: 'NC' });
  });
});

describe('getGoodsItemNameField (alternancia por presencia, no por prioridad de especificación)', () => {
  // GoodsItemName y GoodsDescription tienen la misma fila M/O/NC en las 12 combinaciones
  // version/acuerdo, así que a diferencia de otros pares alternativos se elige por presencia real.
  it('usa GoodsItemName cuando está presente', () => {
    const good = parseFragment('<Good><GoodsItemName>Tornillos</GoodsItemName></Good>').documentElement;
    const result = getGoodsItemNameField(XML_SPECIFICATIONS, '1.8.0', 'A18', good);
    expect(result).toEqual({ value: 'Tornillos', foundElement: 'GoodsItemName', requirement: 'M' });
  });

  it('cae a GoodsDescription cuando GoodsItemName está ausente (regresión: antes siempre elegía GoodsItemName)', () => {
    const good = parseFragment('<Good><GoodsDescription>Tornillos de acero</GoodsDescription></Good>').documentElement;
    const result = getGoodsItemNameField(XML_SPECIFICATIONS, '1.8.0', 'A18', good);
    expect(result).toEqual({ value: 'Tornillos de acero', foundElement: 'GoodsDescription', requirement: 'M' });
  });

  it('devuelve NC si el par no corresponde a esta versión/acuerdo (ej. A72 en 1.8.2)', () => {
    const good = parseFragment('<Good><GoodsItemName>Tornillos</GoodsItemName></Good>').documentElement;
    const result = getGoodsItemNameField(XML_SPECIFICATIONS, '1.8.2', 'A72', good);
    expect(result).toEqual({ value: null, foundElement: null, requirement: 'NC' });
  });
});

describe('getValueFieldWithSpecPriority (GoodsItemValue vs GoodsItemFOB)', () => {
  it('A18 usa GoodsItemValue', () => {
    const good = parseFragment('<Good><GoodsItemValue>1000</GoodsItemValue><GoodsItemFOB>900</GoodsItemFOB></Good>').documentElement;
    const result = getValueFieldWithSpecPriority(XML_SPECIFICATIONS, '1.8.0', 'A18', good);
    expect(result).toMatchObject({ value: '1000', foundElement: 'GoodsItemValue', requirement: 'M', type: 'Value' });
  });

  it('A35 usa GoodsItemFOB', () => {
    const good = parseFragment('<Good><GoodsItemValue>1000</GoodsItemValue><GoodsItemFOB>900</GoodsItemFOB></Good>').documentElement;
    const result = getValueFieldWithSpecPriority(XML_SPECIFICATIONS, '1.8.0', 'A35', good);
    expect(result).toMatchObject({ value: '900', foundElement: 'GoodsItemFOB', requirement: 'M', type: 'FOB' });
  });
});

describe('getOperatorContent (familias Op3c / ThirdOp, nunca vienen ambas)', () => {
  it('A72 en 1.8.0 usa la familia Op3c para Statement', () => {
    const xmlDoc = parseFragment('<root><Op3cStatement>declaro</Op3cStatement></root>');
    const result = getOperatorContent(XML_SPECIFICATIONS, '1.8.0', 'A72', xmlDoc, 'Statement');
    expect(result).toMatchObject({ value: 'declaro', foundElement: 'Op3cStatement', family: 'Op3c' });
  });

  it('A18 en 4.1.1 usa la familia ThirdOp para Statement', () => {
    const xmlDoc = parseFragment('<root><ThirdOpStatement>declaro</ThirdOpStatement></root>');
    const result = getOperatorContent(XML_SPECIFICATIONS, '4.1.1', 'A18', xmlDoc, 'Statement');
    expect(result).toMatchObject({ value: 'declaro', foundElement: 'ThirdOpStatement', family: 'ThirdOp' });
  });

  it('devuelve NC si ninguna familia aplica', () => {
    const xmlDoc = parseFragment('<root></root>');
    const result = getOperatorContent(XML_SPECIFICATIONS, '1.8.0', 'A18', xmlDoc, 'Statement');
    expect(result.requirement).toBe('NC');
    expect(result.family).toBeNull();
  });
});

describe('getEHCityFieldWithSpecPriority (EHCity legacy vs EHCityLocality 4.1.1)', () => {
  it('1.8.x usa EHCity', () => {
    const eh = parseFragment('<EH><EHCity>Buenos Aires</EHCity></EH>').documentElement;
    const result = getEHCityFieldWithSpecPriority(XML_SPECIFICATIONS, '1.8.0', 'A18', eh);
    expect(result).toMatchObject({ value: 'Buenos Aires', foundElement: 'EHCity', version: 'legacy' });
  });

  it('4.1.1 usa EHCityLocality', () => {
    const eh = parseFragment('<EH><EHCityLocality>Buenos Aires</EHCityLocality></EH>').documentElement;
    const result = getEHCityFieldWithSpecPriority(XML_SPECIFICATIONS, '4.1.1', 'A18', eh);
    expect(result).toMatchObject({ value: 'Buenos Aires', foundElement: 'EHCityLocality', version: 'current' });
  });
});

describe('getUnexpectedElements', () => {
  it('detecta un elemento con contenido que debería ser NC para esta versión/acuerdo', () => {
    // Affidavit es NC en 1.8.2/A18 pero acá viene con contenido.
    const xmlDoc = parseFragment('<root><Affidavit>si</Affidavit></root>');
    const unexpected = getUnexpectedElements(XML_SPECIFICATIONS, '1.8.2', 'A18', xmlDoc);
    expect(unexpected).toContainEqual({ tag: 'Affidavit', value: 'si' });
  });

  it('no reporta nada si todos los elementos presentes corresponden', () => {
    const xmlDoc = parseFragment('<root><Affidavit>si</Affidavit></root>');
    const unexpected = getUnexpectedElements(XML_SPECIFICATIONS, '4.1.1', 'A18', xmlDoc);
    expect(unexpected.find((u) => u.tag === 'Affidavit')).toBeUndefined();
  });

  it('devuelve [] si falta algún parámetro', () => {
    expect(getUnexpectedElements(null, '1.8.2', 'A18', parseFragment('<root/>'))).toEqual([]);
  });
});

describe('isRequiredFieldEmpty', () => {
  it('true solo cuando el requerimiento es M y el valor está vacío', () => {
    expect(isRequiredFieldEmpty('', 'M')).toBe(true);
    expect(isRequiredFieldEmpty('   ', 'M')).toBe(true);
    expect(isRequiredFieldEmpty(null, 'M')).toBe(true);
    expect(isRequiredFieldEmpty('algo', 'M')).toBe(false);
    expect(isRequiredFieldEmpty('', 'O')).toBe(false);
    expect(isRequiredFieldEmpty('', 'NC')).toBe(false);
  });
});
