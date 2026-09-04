import { AGREEMENT_MAPPING } from './cod-spec';

const KNOWN_AGREEMENTS = Object.keys(AGREEMENT_MAPPING);

// Tope de tamaño para el XML de entrada. A diferencia del resto de las validaciones de
// este archivo, esta es una protección de recursos (no una regla de negocio de ALADI) —
// por eso bloquea en vez de solo advertir (decisión explícita del dueño del proyecto).
export const MAX_XML_SIZE_BYTES = 4 * 1024 * 1024; // 4 MB

// Chequea el tamaño del archivo ANTES de leerlo/decodificarlo — recibe bytes, no el string
// ya decodificado (evita cargar en memoria algo descomunal solo para poder medirlo).
export const validateSize = (byteLength) => {
  if (byteLength > MAX_XML_SIZE_BYTES) {
    const mb = (byteLength / (1024 * 1024)).toFixed(1);
    return `El archivo pesa ${mb} MB, supera el máximo admitido de 4 MB.`;
  }
  return null;
};

// Decodifica bytes crudos (ArrayBuffer) como UTF-8 preservando la información de si el
// archivo traía BOM — TextDecoder con la opción por defecto (ignoreBOM: false) lo quita
// en silencio, que es justo lo que no queremos acá: necesitamos saber si estaba.
export const decodeXmlBytes = (arrayBuffer) => {
  const decoded = new TextDecoder('utf-8', { ignoreBOM: true }).decode(arrayBuffer);
  const hasBOM = decoded.charCodeAt(0) === 0xFEFF;
  return { content: hasBOM ? decoded.slice(1) : decoded, hasBOM };
};

// Un COD con BOM no es un error de esta app en particular, pero ALADI no lo admite —
// se puede procesar igual (por eso es un warning, no un bloqueo), pero hay que avisar
// porque es probable que la autoridad aduanera lo rechace por esta causa.
export const validateBOM = (hasBOM) => {
  if (hasBOM) {
    return 'El archivo tiene una marca BOM (Byte Order Mark) al inicio. Un COD no debe contener BOM — es probable que la autoridad aduanera rechace este certificado por esa causa, aunque esta aplicación pudo procesarlo igual.';
  }
  return null;
};

// Chequea la codificación declarada en el prólogo del XML contra UTF-8 (requisito ALADI),
// y detecta caracteres de reemplazo que delatan una decodificación incorrecta.
export const validateEncoding = (xmlContent) => {
  const warnings = [];
  if (!xmlContent) return warnings;

  const prologMatch = xmlContent.match(/<\?xml[^?]*\?>/);
  const encodingMatch = prologMatch ? prologMatch[0].match(/encoding=["']([^"']+)["']/i) : null;
  const declaredEncoding = encodingMatch ? encodingMatch[1] : null;

  if (declaredEncoding && declaredEncoding.toUpperCase() !== 'UTF-8') {
    warnings.push(`El XML declara la codificación "${declaredEncoding}", pero ALADI exige UTF-8.`);
  }

  if (xmlContent.includes('�')) {
    warnings.push('El contenido tiene caracteres no válidos (�) — es probable que la codificación real del archivo no sea UTF-8, aunque el prólogo del XML lo declare.');
  }

  return warnings;
};

// Chequea que el XML tenga la estructura mínima esperada de un COD antes de procesarlo.
export const validateStructure = (xmlDoc, xmlSpecifications) => {
  const warnings = [];
  if (!xmlDoc) return warnings;

  const version = xmlDoc.querySelector('CODVer')?.textContent?.trim();
  const agreement = xmlDoc.querySelector('AgreementAcronym')?.textContent?.trim();
  const knownVersions = xmlSpecifications?.metadata?.versiones || [];

  if (!version) {
    warnings.push('No se encontró el elemento <CODVer> — no se puede determinar la versión del COD.');
  } else if (knownVersions.length > 0 && !knownVersions.includes(version)) {
    warnings.push(`La versión de COD "${version}" no es una de las versiones reconocidas (${knownVersions.join(', ')}).`);
  }

  if (!agreement) {
    warnings.push('No se encontró el elemento <AgreementAcronym> — no se puede determinar el acuerdo comercial.');
  } else if (!KNOWN_AGREEMENTS.includes(agreement)) {
    warnings.push(`El acuerdo "${agreement}" no es uno de los acuerdos reconocidos por esta aplicación (${KNOWN_AGREEMENTS.join(', ')}).`);
  }

  if (xmlDoc.getElementById('COD') === null) {
    warnings.push('No se encontró el elemento <COD id="COD"> — falta la estructura básica de un COD.');
  }
  if (xmlDoc.getElementById('CODEH') === null) {
    warnings.push('No se encontró el elemento <CODEH id="CODEH"> — falta la estructura básica de un COD.');
  }

  return warnings;
};
