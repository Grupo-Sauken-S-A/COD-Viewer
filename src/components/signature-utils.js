// Namespace constante para XMLDSig
const XMLDSIG_NS = "http://www.w3.org/2000/09/xmldsig#";

/**
 * Extrae el nombre del firmante del X509SubjectName
 * @param {Element} signature - Elemento de firma
 * @returns {string} Nombre del firmante o null si no se encuentra
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

/**
 * Verifica la existencia de firma digital para un elemento específico
 * @param {Document} xmlDoc - Documento XML
 * @param {string} elementId - ID del elemento a verificar
 * @returns {Object} Información sobre la firma
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

        // Buscar la firma correspondiente
        let targetSignature = null;
        const signatures = xmlDoc.getElementsByTagNameNS(XMLDSIG_NS, "Signature");
        for (const sig of Array.from(signatures)) {
            const reference = sig.getElementsByTagNameNS(XMLDSIG_NS, "Reference")[0];
            if (reference?.getAttribute("URI") === `#${elementId}`) {
                targetSignature = sig;
                break;
            }
        }

        if (!targetSignature) {
            return {
                hasSignature: false,
                isValid: false,
                error: `No se encontró firma digital para el elemento: ${elementId}`
            };
        }

        // Obtener información de la firma
        return {
            hasSignature: true,
            isValid: true,
            algorithm: targetSignature.getElementsByTagNameNS(XMLDSIG_NS, "DigestMethod")[0]?.getAttribute("Algorithm"),
            signerName: extractSignerName(targetSignature)
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

/**
 * Obtiene el texto para mostrar el estado de la firma
 */
export const getSignatureStatusDisplay = (signatureStatus) => {
    if (!signatureStatus.hasSignature) {
        return {
            text: signatureStatus.error || "Firma digital no encontrada",
            className: "text-amber-600 font-medium"
        };
    }

    const algorithm = signatureStatus.algorithm ? 
        (signatureStatus.algorithm.includes('sha256') ? 'SHA-256' : 'SHA-1') : 
        'No especificado';
    
    const signerInfo = signatureStatus.signerName ? 
        `Firmado por: ${signatureStatus.signerName}` : 
        'Firmante no especificado';

    return {
        text: `Firma digital presente\n${signerInfo}\nAlgoritmo: ${algorithm}\n\nNota: Esta aplicación no realiza validaciones sobre la firma digital. Si desea validar la firma, por favor utilice otra aplicación.`,
        className: "text-blue-600 font-medium"
    };
};
