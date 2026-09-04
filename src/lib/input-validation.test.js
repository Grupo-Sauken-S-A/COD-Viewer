import { describe, it, expect } from 'vitest';
import { validateEncoding, validateStructure, validateSize, validateBOM, decodeXmlBytes, MAX_XML_SIZE_BYTES } from './input-validation';
import { XML_SPECIFICATIONS } from '@/components/xml-specifications';
import { hasRealFixtures, availableRealFixtures, loadRealFixture, replaceElementText } from '../../test/helpers/fixtures';

const parse = (xml) => new DOMParser().parseFromString(xml, 'text/xml');

describe('validateEncoding', () => {
  it('no advierte nada para un prólogo UTF-8 sin caracteres de reemplazo', () => {
    expect(validateEncoding('<?xml version="1.0" encoding="UTF-8"?><root>ok</root>')).toEqual([]);
  });

  it('advierte si el prólogo declara una codificación distinta de UTF-8', () => {
    const warnings = validateEncoding('<?xml version="1.0" encoding="ISO-8859-1"?><root>ok</root>');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/ISO-8859-1/);
    expect(warnings[0]).toMatch(/UTF-8/);
  });

  it('detecta el carácter de reemplazo U+FFFD (indicio de decodificación incorrecta)', () => {
    const warnings = validateEncoding('<?xml version="1.0" encoding="UTF-8"?><root>Exportador �</root>');
    expect(warnings.some((w) => w.includes('�'))).toBe(true);
  });

  it('puede acumular ambas advertencias a la vez', () => {
    const warnings = validateEncoding('<?xml version="1.0" encoding="ISO-8859-1"?><root>Exportador �</root>');
    expect(warnings).toHaveLength(2);
  });

  it('no revienta con contenido vacío o sin prólogo', () => {
    expect(validateEncoding('')).toEqual([]);
    expect(validateEncoding('<root>sin prologo</root>')).toEqual([]);
  });
});

describe('validateStructure', () => {
  const minimalCod = '<CODEH id="CODEH"><CODExporter><COD id="COD"><CODVer>4.1.1</CODVer><AgreementAcronym>A18</AgreementAcronym></COD></CODExporter></CODEH>';

  it('no advierte nada para una estructura mínima válida y reconocida', () => {
    expect(validateStructure(parse(minimalCod), XML_SPECIFICATIONS)).toEqual([]);
  });

  it('advierte si falta <CODVer>', () => {
    const doc = parse('<CODEH id="CODEH"><COD id="COD"><AgreementAcronym>A18</AgreementAcronym></COD></CODEH>');
    const warnings = validateStructure(doc, XML_SPECIFICATIONS);
    expect(warnings.some((w) => w.includes('<CODVer>'))).toBe(true);
  });

  it('advierte si la versión no es reconocida', () => {
    const doc = parse('<CODEH id="CODEH"><COD id="COD"><CODVer>9.9.9</CODVer><AgreementAcronym>A18</AgreementAcronym></COD></CODEH>');
    const warnings = validateStructure(doc, XML_SPECIFICATIONS);
    expect(warnings.some((w) => w.includes('9.9.9'))).toBe(true);
  });

  it('advierte si falta <AgreementAcronym>', () => {
    const doc = parse('<CODEH id="CODEH"><COD id="COD"><CODVer>4.1.1</CODVer></COD></CODEH>');
    const warnings = validateStructure(doc, XML_SPECIFICATIONS);
    expect(warnings.some((w) => w.includes('<AgreementAcronym>'))).toBe(true);
  });

  it('advierte si el acuerdo no es reconocido', () => {
    const doc = parse('<CODEH id="CODEH"><COD id="COD"><CODVer>4.1.1</CODVer><AgreementAcronym>A99</AgreementAcronym></COD></CODEH>');
    const warnings = validateStructure(doc, XML_SPECIFICATIONS);
    expect(warnings.some((w) => w.includes('A99'))).toBe(true);
  });

  it('advierte si falta <COD id="COD"> o <CODEH id="CODEH">', () => {
    const doc = parse('<root><CODVer>4.1.1</CODVer><AgreementAcronym>A18</AgreementAcronym></root>');
    const warnings = validateStructure(doc, XML_SPECIFICATIONS);
    expect(warnings.some((w) => w.includes('id="COD"'))).toBe(true);
    expect(warnings.some((w) => w.includes('id="CODEH"'))).toBe(true);
  });
});

describe('validateSize', () => {
  it('no bloquea un archivo dentro del límite', () => {
    expect(validateSize(1024)).toBeNull();
    expect(validateSize(MAX_XML_SIZE_BYTES)).toBeNull();
  });

  it('bloquea un archivo que supera 4MB, con el tamaño en el mensaje', () => {
    const error = validateSize(MAX_XML_SIZE_BYTES + 1);
    expect(error).toMatch(/4 MB/);
  });
});

describe('decodeXmlBytes / validateBOM', () => {
  const encodeUtf8 = (str) => new TextEncoder().encode(str).buffer;

  it('decodifica sin BOM y no lo reporta', () => {
    const { content, hasBOM } = decodeXmlBytes(encodeUtf8('<root>ok</root>'));
    expect(content).toBe('<root>ok</root>');
    expect(hasBOM).toBe(false);
    expect(validateBOM(hasBOM)).toBeNull();
  });

  it('detecta un BOM UTF-8 al inicio, lo quita del contenido y avisa (sin bloquear)', () => {
    const { content, hasBOM } = decodeXmlBytes(encodeUtf8('﻿<root>ok</root>'));
    expect(content).toBe('<root>ok</root>');
    expect(hasBOM).toBe(true);
    const warning = validateBOM(hasBOM);
    expect(warning).toMatch(/BOM/);
    expect(warning).toMatch(/aduanera/i);
  });
});

describe.runIf(hasRealFixtures())('validateEncoding/validateStructure contra COD reales', () => {
  for (const name of availableRealFixtures()) {
    it(`${name}: no genera advertencias sobre un COD real sin modificar`, () => {
      const xmlContent = loadRealFixture(name);
      const doc = parse(xmlContent);
      expect(validateEncoding(xmlContent)).toEqual([]);
      expect(validateStructure(doc, XML_SPECIFICATIONS)).toEqual([]);
    });

    it(`${name}: detecta una versión de COD adulterada`, () => {
      const xmlContent = replaceElementText(loadRealFixture(name), 'CODVer', '0.0.0');
      const doc = parse(xmlContent);
      const warnings = validateStructure(doc, XML_SPECIFICATIONS);
      expect(warnings.some((w) => w.includes('0.0.0'))).toBe(true);
    });

    it(`${name}: detecta una declaración de encoding distinta de UTF-8`, () => {
      const xmlContent = loadRealFixture(name).replace(/encoding="UTF-8"/i, 'encoding="ISO-8859-1"');
      const warnings = validateEncoding(xmlContent);
      expect(warnings.some((w) => w.includes('ISO-8859-1'))).toBe(true);
    });
  }
});
