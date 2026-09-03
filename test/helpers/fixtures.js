import fs from 'fs';
import path from 'path';

const REAL_FIXTURES_DIR = path.resolve(__dirname, '../fixtures/real');

export const REAL_FIXTURE_NAMES = [
  'AR004A13260000000200.xml', // A13 -> mapea a A18
  'AR004A14260000000200.xml', // A14 -> mapea a A18
  'AR004A57220000042500.xml', // A57 -> mapea a A18, v1.8.2
  'AR004A57260000000200.xml',
  'AR004A57260000000300.xml',
  'AR004A72230000181000.xml', // A72, no mapea
];

export const hasRealFixtures = () => fs.existsSync(REAL_FIXTURES_DIR);

export const loadRealFixture = (name) =>
  fs.readFileSync(path.join(REAL_FIXTURES_DIR, name), 'utf-8');

export const availableRealFixtures = () =>
  hasRealFixtures() ? REAL_FIXTURE_NAMES.filter((n) => fs.existsSync(path.join(REAL_FIXTURES_DIR, n))) : [];

// --- Utilidades para armar copias mutadas de un COD real (misma técnica usada en QA manual:
// tomar un COD real y quitarle elementos para simular etapas de emisión y errores de entrada) ---

// Elimina la primera ocurrencia de un elemento (con cualquier prefijo de namespace) y su contenido.
export const stripElement = (xml, tagName) => {
  const re = new RegExp(`<(?:\\w+:)?${tagName}(?:\\s[^>]*)?>[\\s\\S]*?</(?:\\w+:)?${tagName}>`);
  return xml.replace(re, '');
};

// Elimina la firma XMLDSig cuyo Reference apunta a un id dado (p.ej. "#COD" o "#CODEH").
export const stripSignatureForReference = (xml, referenceUri) => {
  const re = /<ds:Signature\b[\s\S]*?<\/ds:Signature>/g;
  return xml.replace(re, (match) => (match.includes(`URI="${referenceUri}"`) ? '' : match));
};

export const replaceElementText = (xml, tagName, newText) => {
  const re = new RegExp(`(<(?:\\w+:)?${tagName}(?:\\s[^>]*)?>)[\\s\\S]*?(</(?:\\w+:)?${tagName}>)`);
  return xml.replace(re, `$1${newText}$2`);
};
