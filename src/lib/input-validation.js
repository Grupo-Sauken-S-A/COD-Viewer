import { AGREEMENT_MAPPING } from './cod-spec';

const KNOWN_AGREEMENTS = Object.keys(AGREEMENT_MAPPING);

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
