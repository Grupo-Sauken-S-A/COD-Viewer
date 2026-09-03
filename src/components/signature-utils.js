// Namespace constante para XMLDSig
const XMLDSIG_NS = "http://www.w3.org/2000/09/xmldsig#";

/**
 * Extrae el nombre del firmante del X509SubjectName
 */
const extractSignerName = (signature) => {
    try {
        const x509Data = signature.getElementsByTagNameNS(XMLDSIG_NS, "X509SubjectName")[0];
        if (!x509Data?.textContent) return null;

        const match = x509Data.textContent.match(/CN=([^,]+)/);
        return match ? match[1].trim() : null;
    } catch (error) {
        console.error("Error extrayendo nombre del firmante:", error);
        return null;
    }
};

// --- Parseo mínimo de ASN.1 DER para extraer la vigencia (Validity) de un certificado X.509 ---
// Certificate ::= SEQUENCE { tbsCertificate, signatureAlgorithm, signatureValue }
// tbsCertificate ::= SEQUENCE { version [0] OPTIONAL, serialNumber, signature, issuer, validity, ... }
// validity ::= SEQUENCE { notBefore Time, notAfter Time }  (Time = UTCTime[0x17] | GeneralizedTime[0x18])

const readDerLength = (bytes, offset) => {
    const first = bytes[offset];
    if ((first & 0x80) === 0) return { length: first, bytesRead: 1 };
    const numBytes = first & 0x7f;
    let length = 0;
    for (let i = 0; i < numBytes; i++) length = (length << 8) | bytes[offset + 1 + i];
    return { length, bytesRead: 1 + numBytes };
};

const readDerTLV = (bytes, offset) => {
    const tag = bytes[offset];
    const { length, bytesRead } = readDerLength(bytes, offset + 1);
    const valueStart = offset + 1 + bytesRead;
    return { tag, length, valueStart, nextOffset: valueStart + length };
};

const parseDerTime = (bytes, tlv) => {
    let str = '';
    for (let i = tlv.valueStart; i < tlv.valueStart + tlv.length; i++) str += String.fromCharCode(bytes[i]);

    if (tlv.tag === 0x17) { // UTCTime: YYMMDDHHMMSSZ
        const yy = parseInt(str.slice(0, 2), 10);
        const year = yy >= 50 ? 1900 + yy : 2000 + yy;
        return new Date(Date.UTC(year, parseInt(str.slice(2, 4), 10) - 1, parseInt(str.slice(4, 6), 10), parseInt(str.slice(6, 8), 10), parseInt(str.slice(8, 10), 10), parseInt(str.slice(10, 12), 10)));
    }
    if (tlv.tag === 0x18) { // GeneralizedTime: YYYYMMDDHHMMSSZ
        return new Date(Date.UTC(parseInt(str.slice(0, 4), 10), parseInt(str.slice(4, 6), 10) - 1, parseInt(str.slice(6, 8), 10), parseInt(str.slice(8, 10), 10), parseInt(str.slice(10, 12), 10), parseInt(str.slice(12, 14), 10)));
    }
    return null;
};

/**
 * Extrae notBefore/notAfter de un certificado X.509 en base64 (DER).
 * Devuelve null si el certificado no se puede interpretar.
 */
const getCertificateValidity = (base64Cert) => {
    try {
        const binary = atob(base64Cert.replace(/\s+/g, ''));
        const der = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) der[i] = binary.charCodeAt(i);

        const cert = readDerTLV(der, 0);
        if (cert.tag !== 0x30) return null;
        const tbs = readDerTLV(der, cert.valueStart);
        if (tbs.tag !== 0x30) return null;

        let offset = tbs.valueStart;
        let elem = readDerTLV(der, offset);
        if (elem.tag === 0xA0) { // version [0] EXPLICIT, opcional
            offset = elem.nextOffset;
            elem = readDerTLV(der, offset);
        }
        // elem es serialNumber acá; avanzamos a signature AlgorithmIdentifier y después a issuer
        offset = elem.nextOffset; elem = readDerTLV(der, offset); // signature AlgorithmIdentifier
        offset = elem.nextOffset; elem = readDerTLV(der, offset); // issuer
        offset = elem.nextOffset;
        const validity = readDerTLV(der, offset); // validity
        if (validity.tag !== 0x30) return null;

        const notBeforeTlv = readDerTLV(der, validity.valueStart);
        const notAfterTlv = readDerTLV(der, notBeforeTlv.nextOffset);

        const notBefore = parseDerTime(der, notBeforeTlv);
        const notAfter = parseDerTime(der, notAfterTlv);
        if (!notBefore || !notAfter) return null;

        return { notBefore, notAfter };
    } catch (error) {
        return null;
    }
};

// Mapeo de URIs de algoritmo de firma XMLDSig a nombre legible + si se considera débil
const SIGNATURE_ALGORITHMS = {
    'rsa-sha1': { name: 'RSA-SHA1', weak: true },
    'dsa-sha1': { name: 'DSA-SHA1', weak: true },
    'rsa-sha256': { name: 'RSA-SHA256', weak: false },
    'rsa-sha384': { name: 'RSA-SHA384', weak: false },
    'rsa-sha512': { name: 'RSA-SHA512', weak: false },
    'ecdsa-sha256': { name: 'ECDSA-SHA256', weak: false },
    'ecdsa-sha384': { name: 'ECDSA-SHA384', weak: false },
    'ecdsa-sha512': { name: 'ECDSA-SHA512', weak: false }
};

const describeSignatureAlgorithm = (algorithmUri) => {
    if (!algorithmUri) return { name: 'No especificado', weak: false };
    const key = Object.keys(SIGNATURE_ALGORITHMS).find(k => algorithmUri.toLowerCase().includes(k));
    if (key) return SIGNATURE_ALGORITHMS[key];
    return { name: algorithmUri.split('#').pop() || algorithmUri, weak: algorithmUri.toLowerCase().includes('sha1') || algorithmUri.toLowerCase().includes('md5') };
};

const describeDigestAlgorithm = (algorithmUri) => {
    if (!algorithmUri) return 'No especificado';
    if (algorithmUri.includes('sha256')) return 'SHA-256';
    if (algorithmUri.includes('sha384')) return 'SHA-384';
    if (algorithmUri.includes('sha512')) return 'SHA-512';
    if (algorithmUri.includes('sha1')) return 'SHA-1';
    return algorithmUri.split('#').pop() || algorithmUri;
};

// Cada firma corresponde a un momento real distinto: el Exportador firma #COD al declarar
// (DeclarationDate), la EH firma #CODEH al certificar/emitir (CertificateDate). La vigencia
// del certificado hay que compararla contra ESA fecha, nunca contra la fecha de hoy — un COD
// de hace 5 años va a tener el certificado "vencido hoy" aunque haya sido válido al firmarlo.
const REFERENCE_DATE_TAG = { COD: 'DeclarationDate', CODEH: 'CertificateDate' };

// Los COD traen estas fechas como "YYYY-MM-DDTHH:mm:ss", sin offset de zona horaria
// (ej. "2022-09-21T00:00:00"). new Date(...) interpreta eso como hora LOCAL del entorno
// donde corre el código, lo que puede desalinearla contra las fechas del certificado
// X.509 (que sí son UTC/Zulu, ver parseDerTime). Se parsea acá explícitamente como UTC
// para que ambos lados de la comparación usen la misma referencia sin importar la zona
// horaria del navegador o del servidor.
const parseCodDateTimeAsUTC = (raw) => {
    if (!raw) return null;
    const match = raw.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}):(\d{2}))?/);
    if (!match) return null;
    const [, year, month, day, hour = '0', minute = '0', second = '0'] = match;
    const date = new Date(Date.UTC(
        parseInt(year, 10),
        parseInt(month, 10) - 1,
        parseInt(day, 10),
        parseInt(hour, 10),
        parseInt(minute, 10),
        parseInt(second, 10)
    ));
    return Number.isNaN(date.getTime()) ? null : date;
};

const getSignatureReferenceDate = (xmlDoc, elementId) => {
    const tag = REFERENCE_DATE_TAG[elementId];
    if (!tag) return null;
    const raw = xmlDoc.querySelector(tag)?.textContent?.trim();
    return parseCodDateTimeAsUTC(raw);
};

/**
 * Verifica la existencia de firma digital para un elemento específico y junta
 * la información relevante: algoritmos, firmante, vigencia del certificado
 * (comparada contra la fecha real de esa firma, no contra hoy) y si hay más
 * de una firma apuntando al mismo elemento.
 */
export const verifySignatureForElement = async (xmlDoc, elementId) => {
    try {
        const signedElement = xmlDoc.getElementById(elementId);
        if (!signedElement) {
            return {
                hasSignature: false,
                isValid: false,
                error: `No se encontró el elemento: ${elementId}`
            };
        }

        const allSignatures = xmlDoc.getElementsByTagNameNS(XMLDSIG_NS, "Signature");
        const matchingSignatures = Array.from(allSignatures).filter(sig => {
            const reference = sig.getElementsByTagNameNS(XMLDSIG_NS, "Reference")[0];
            return reference?.getAttribute("URI") === `#${elementId}`;
        });

        if (matchingSignatures.length === 0) {
            return {
                hasSignature: false,
                isValid: false,
                error: `No se encontró firma digital para el elemento: ${elementId}`
            };
        }

        const targetSignature = matchingSignatures[0];
        const digestAlgorithmUri = targetSignature.getElementsByTagNameNS(XMLDSIG_NS, "DigestMethod")[0]?.getAttribute("Algorithm");
        const signatureAlgorithmUri = targetSignature.getElementsByTagNameNS(XMLDSIG_NS, "SignatureMethod")[0]?.getAttribute("Algorithm");
        const signatureAlgorithm = describeSignatureAlgorithm(signatureAlgorithmUri);
        const certBase64 = targetSignature.getElementsByTagNameNS(XMLDSIG_NS, "X509Certificate")[0]?.textContent;
        const certValidity = certBase64 ? getCertificateValidity(certBase64) : null;

        const referenceDate = getSignatureReferenceDate(xmlDoc, elementId);
        const certValidityKnown = !!(certValidity && referenceDate);
        const certExpired = certValidityKnown ? referenceDate > certValidity.notAfter : false;
        const certNotYetValid = certValidityKnown ? referenceDate < certValidity.notBefore : false;

        return {
            hasSignature: true,
            isValid: true,
            algorithm: digestAlgorithmUri, // se mantiene por compatibilidad
            digestAlgorithm: describeDigestAlgorithm(digestAlgorithmUri),
            signatureAlgorithm: signatureAlgorithm.name,
            signatureAlgorithmWeak: signatureAlgorithm.weak,
            signerName: extractSignerName(targetSignature),
            certNotBefore: certValidity?.notBefore ?? null,
            certNotAfter: certValidity?.notAfter ?? null,
            referenceDate,
            referenceDateSource: REFERENCE_DATE_TAG[elementId],
            certValidityKnown,
            certExpired,
            certNotYetValid,
            duplicateSignatures: matchingSignatures.length > 1
        };
    } catch (error) {
        console.error("Error verificando firma:", error);
        return {
            hasSignature: false,
            isValid: false,
            error: `Error al verificar la firma: ${error.message}`
        };
    }
};

// Se formatea en UTC (timeZone fijo) para que lo que se muestra coincida siempre con el
// valor literal del XML/certificado, sin importar la zona horaria del navegador o servidor.
// El locale es-AR escribe "a. m."/"p. m." con un espacio interno; se reemplaza por un
// espacio de no separación para que el wrap de texto no lo corte a mitad ("a." / "m.)").
const formatDate = (date) => {
    if (!date) return null;
    return date
        .toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'UTC' })
        .replace(/([ap])\.\s+m\./i, '$1. m.');
};

/**
 * Obtiene el texto para mostrar el estado de la firma
 */
export const getSignatureStatusDisplay = (signatureStatus) => {
    if (!signatureStatus.hasSignature) {
        return {
            text: signatureStatus.error || "Firma digital no encontrada",
            className: "text-amber-600 font-medium",
            severity: 'warning'
        };
    }

    const signerInfo = signatureStatus.signerName ?
        `Firmado por: ${signatureStatus.signerName}` :
        'Firmante no especificado';

    const lines = [
        'Firma digital presente',
        signerInfo,
        `Algoritmo de firma: ${signatureStatus.signatureAlgorithm}${signatureStatus.signatureAlgorithmWeak ? ' (algoritmo débil/obsoleto)' : ''}`,
        `Algoritmo de digest: ${signatureStatus.digestAlgorithm}`
    ];

    const REFERENCE_DATE_LABEL = { DeclarationDate: 'Fecha de Declaración del Exportador', CertificateDate: 'Fecha de Certificación de la EH' };
    const certInvalidAtSigning = signatureStatus.certValidityKnown && (signatureStatus.certExpired || signatureStatus.certNotYetValid);

    // Se arma como un único párrafo continuo (no una línea forzada por oración) para que el
    // ajuste de texto use todo el ancho disponible en vez de cortar cada frase por separado
    // dejando renglones de largos muy dispares.
    if (signatureStatus.certNotBefore && signatureStatus.certNotAfter) {
        // formatDate puede terminar en "m." (a. m./p. m.) — evita el punto doble.
        const vigenciaRango = `Certificado vigente: ${formatDate(signatureStatus.certNotBefore)} a ${formatDate(signatureStatus.certNotAfter)}`;
        let vigenciaText = vigenciaRango + (vigenciaRango.endsWith('.') ? ' ' : '. ');

        if (signatureStatus.certValidityKnown) {
            const refLabel = REFERENCE_DATE_LABEL[signatureStatus.referenceDateSource] || 'la fecha de la firma';
            const refDateText = formatDate(signatureStatus.referenceDate);
            if (certInvalidAtSigning) {
                const motivo = signatureStatus.certExpired ? 'ya había vencido' : 'todavía no era válido';
                vigenciaText += `⚠ El certificado NO estaba vigente en ${refLabel} (${refDateText}): ${motivo} en esa fecha. `;
            } else {
                vigenciaText += `El certificado estaba vigente en ${refLabel} (${refDateText}). `;
            }
            vigenciaText += 'Esta aplicación no verifica si el certificado estaba revocado en esa fecha — solo si estaba dentro de su período de vigencia.';
        } else {
            vigenciaText += 'No se pudo determinar si el certificado estaba vigente al momento de firmar (falta la fecha de referencia en el XML).';
        }

        lines.push('', vigenciaText);
    }

    if (signatureStatus.duplicateSignatures) {
        lines.push('⚠ Se encontró más de una firma digital para este mismo elemento.');
    }

    lines.push('', 'Nota: Esta aplicación no realiza validaciones criptográficas sobre la firma digital (no verifica que el hash coincida, la revocación ni la cadena de confianza del certificado). Si desea validar la firma, por favor utilice otra aplicación.');

    const hasWarning = signatureStatus.signatureAlgorithmWeak || signatureStatus.duplicateSignatures;

    let severity = 'ok';
    if (hasWarning) severity = 'warning';
    if (certInvalidAtSigning) severity = 'error';

    const classNameBySeverity = {
        ok: 'text-blue-600 font-medium',
        warning: 'text-amber-700 font-medium',
        error: 'text-red-700 font-medium'
    };

    return {
        text: lines.join('\n'),
        className: classNameBySeverity[severity],
        severity
    };
};

// --- Etapa de emisión del COD (ver mecanismo de 4 etapas: EXP firma #COD, la EH agrega
// EH/CertificationEH sin romper esa firma, y por último el FH firma #CODEH) ---

const hasSignatureReferencing = (xmlDoc, elementId) => {
    const signatures = xmlDoc.getElementsByTagNameNS(XMLDSIG_NS, "Signature");
    return Array.from(signatures).some(sig => {
        const reference = sig.getElementsByTagNameNS(XMLDSIG_NS, "Reference")[0];
        return reference?.getAttribute("URI") === `#${elementId}`;
    });
};

export const EMISSION_STAGE_LABELS = {
    1: 'Borrador — sin firmar',
    2: 'Firmado por el Exportador (EXP) — pendiente de certificación por la Entidad Habilitada',
    3: 'Certificado por la Entidad Habilitada — pendiente de la firma del Funcionario Habilitado (FH)',
    4: 'COD completo'
};

/**
 * Determina en qué etapa del proceso de emisión está el XML, según el mecanismo:
 * 1) sin firmas, 2) firmado por el Exportador, 3) con datos de certificación de la EH
 * pero sin firmar por el FH, 4) completo (ambas firmas presentes).
 */
export const getEmissionStage = (xmlDoc) => {
    const hasCodElement = xmlDoc.getElementById('COD') !== null;
    const hasCodehElement = xmlDoc.getElementById('CODEH') !== null;
    const hasCodSignature = hasCodElement && hasSignatureReferencing(xmlDoc, 'COD');
    const hasEhData = xmlDoc.querySelector('EH') !== null && xmlDoc.querySelector('CertificationEH') !== null;
    const hasCodehSignature = hasCodehElement && hasSignatureReferencing(xmlDoc, 'CODEH');

    if (hasCodehSignature && !hasCodSignature) {
        return {
            stage: 'anomalo',
            label: 'Orden de firmas inconsistente: la Entidad Habilitada firmó (#CODEH) sin que el Exportador haya firmado primero (#COD).'
        };
    }
    if (hasEhData && !hasCodSignature) {
        return {
            stage: 'anomalo',
            label: 'Se agregaron datos de certificación de la Entidad Habilitada sin que el Exportador haya firmado el COD.'
        };
    }

    if (!hasCodSignature && !hasEhData) {
        return { stage: 1, label: EMISSION_STAGE_LABELS[1] };
    }
    if (hasCodSignature && !hasEhData) {
        return { stage: 2, label: EMISSION_STAGE_LABELS[2] };
    }
    if (hasCodSignature && hasEhData && !hasCodehSignature) {
        return { stage: 3, label: EMISSION_STAGE_LABELS[3] };
    }
    return { stage: 4, label: EMISSION_STAGE_LABELS[4] };
};

/**
 * CODSubmitterType debería ser siempre "EXP" (el mecanismo de emisión asume que quien
 * carga el COD es el Exportador). No cruza contra la firma #COD: su ausencia ya la
 * cubre getEmissionStage (un borrador sin firmar no es una inconsistencia, es normal).
 */
export const validateSubmitterType = (xmlDoc) => {
    const submitterType = xmlDoc.querySelector('CODSubmitterType')?.textContent?.trim();
    if (submitterType && submitterType !== 'EXP') {
        return `CODSubmitterType es "${submitterType}" (se esperaba "EXP").`;
    }
    return null;
};
