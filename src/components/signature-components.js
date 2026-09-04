import React, { useState, useEffect } from 'react';
import { XCircle, Info, AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { verifySignatureForElement, getSignatureStatusDisplay } from './signature-utils';
import { getCountryName } from './country-codes';

/**
 * Verifica si un string es una URL válida
 * @param {string} str - String a verificar
 * @returns {boolean} true si es una URL válida
 */
// Resalta en negrita el nombre de producto "S-FiDE" dentro de un texto plano, sin afectar el resto del formato
const renderWithBoldSFiDE = (text) => {
  const parts = text.split('S-FiDE');
  if (parts.length === 1) return text;
  return parts.flatMap((part, i) => (
    i === 0 ? [part] : [<strong key={i}>S-FiDE</strong>, part]
  ));
};

const isValidUrl = (str) => {
  try {
    const url = new URL(str);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

/**
 * Verifica si un string es un email válido
 * @param {string} str - String a verificar
 * @returns {boolean} true si es un email válido
 */
const isValidEmail = (str) => {
  if (!str) return false;
  // Expresión regular para validar email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(str.trim());
};

/**
 * Renderiza el valor del campo según su tipo
 * @param {string} value - Valor del campo
 * @param {string} label - Etiqueta del campo
 * @returns {React.ReactNode} Elemento renderizado
 */
const renderFieldValue = (value, label) => {
  if (!value) return 'No especificado';

  // Si el label o el nombre del campo contiene la palabra Country/País, convertir el código
  if (label?.toLowerCase().includes('country') || 
      label?.toLowerCase().includes('país') ||
      label?.toLowerCase().includes('pais')) {
    return getCountryName(value);
  }

  // Si es una URL válida, mostrar como enlace
  if (isValidUrl(value)) {
    return (
      <a 
        href={value} 
        target="_blank" 
        rel="noopener noreferrer"
        className="text-blue-600 hover:text-blue-800 hover:underline"
      >
        {value}
      </a>
    );
  }

  // Si es un email válido, mostrar como enlace mailto
  if (isValidEmail(value)) {
    return (
      <a 
        href={`mailto:${value}`}
        className="text-blue-600 hover:text-blue-800 hover:underline"
      >
        {value}
      </a>
    );
  }

  return value;
};

export const Field = ({ label, value, required, optional = false, hasError = false }) => (
  <div className={`field-container ${required ? 'field-required' : optional ? 'field-optional' : ''} ${hasError ? 'field-error' : ''}`}>
    <span className="field-label">
      {label}
      {required && (
        <AlertTriangle 
          className={`w-4 h-4 ${hasError ? 'text-red-500' : 'text-amber-500'}`}
          title={hasError ? "Campo obligatorio faltante" : "Campo obligatorio"} 
        />
      )}
      {optional && (
        <AlertTriangle 
          className="w-4 h-4 text-gray-400" 
          title="Campo opcional" 
        />
      )}
    </span>
    <span className={`field-value ${hasError ? 'field-value-error' : ''}`}>
      {renderFieldValue(value, label)}
    </span>
  </div>
);

export const SignatureStatus = ({ xmlDoc, elementId, elementName, integrityResult }) => {
  const [signatureStatus, setSignatureStatus] = useState(null);

  useEffect(() => {
    const checkSignature = async () => {
      try {
        const status = await verifySignatureForElement(xmlDoc, elementId);
        setSignatureStatus(status);
      } catch (error) {
        console.error(`Error verificando firma para ${elementId}:`, error);
        setSignatureStatus({
          hasSignature: false,
          isValid: false,
          error: `Error al verificar la firma: ${error.message}`
        });
      }
    };

    checkSignature();
  }, [xmlDoc, elementId]);

  if (!signatureStatus) {
    return null;
  }

  // integrityResult llega por separado (se pide una sola vez para todo el documento, no por
  // cada firma — ver checkSignatureIntegrity en signature-utils.js) y se mezcla acá.
  const mergedStatus = {
    ...signatureStatus,
    integrityValid: integrityResult?.integrityValid ?? null
  };
  const displayInfo = getSignatureStatusDisplay(mergedStatus);
  const boxClassBySeverity = {
    ok: 'bg-blue-50 border-blue-200',
    warning: 'bg-amber-50 border-amber-200',
    error: 'bg-red-50 border-red-200'
  };
  const iconColorBySeverity = { warning: 'text-amber-500', error: 'text-red-500' };

  return (
    <Alert
      className={`mt-2 ${boxClassBySeverity[displayInfo.severity]}`}
    >
      <div className="flex items-start gap-2">
        {displayInfo.severity !== 'ok' ? (
          <AlertTriangle className={`h-5 w-5 ${iconColorBySeverity[displayInfo.severity]} mt-0.5 flex-shrink-0`} />
        ) : (
          <Info className="h-5 w-5 text-blue-500 mt-0.5 flex-shrink-0" />
        )}
        <AlertDescription className="flex-1 min-w-0">
          <div className="space-y-1">
            <code className="inline-block px-2 py-1 text-xs font-mono bg-white rounded">
              {elementName}
            </code>
            <div className={`text-sm whitespace-pre-line ${displayInfo.className}`}>
              {renderWithBoldSFiDE(displayInfo.text)}
            </div>
          </div>
        </AlertDescription>
      </div>
    </Alert>
  );
};

export const InputValidationAlert = ({ warnings }) => {
  if (!warnings || warnings.length === 0) {
    return null;
  }

  return (
    <Alert className="bg-amber-50 border-amber-200">
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 flex-shrink-0" />
        <AlertDescription className="flex-1 min-w-0">
          <div className="space-y-1">
            <p className="text-sm font-medium text-amber-800">
              Advertencias sobre el archivo XML
            </p>
            <ul className="text-sm text-amber-700 list-disc list-inside space-y-0.5">
              {warnings.map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
          </div>
        </AlertDescription>
      </div>
    </Alert>
  );
};

export const XsdValidationAlert = ({ xsdValidation }) => {
  if (!xsdValidation?.applicable || xsdValidation.valid !== false) {
    return null;
  }

  return (
    <Alert className="bg-amber-50 border-amber-200">
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 flex-shrink-0" />
        <AlertDescription className="flex-1 min-w-0">
          <div className="space-y-1">
            <p className="text-sm font-medium text-amber-800">
              El documento no cumple el esquema XSD oficial de ALADI
            </p>
            <p className="text-sm text-amber-700">
              Se validó contra <code className="text-xs font-mono bg-white px-1 rounded">{xsdValidation.schemaFile}</code>.
              Esto no impide ver el resto del certificado, pero indica un problema real de estructura.
            </p>
            <ul className="text-sm text-amber-700 list-disc list-inside space-y-0.5">
              {(xsdValidation.errors || []).map((message, index) => (
                <li key={index}>{message}</li>
              ))}
            </ul>
          </div>
        </AlertDescription>
      </div>
    </Alert>
  );
};

export const EmissionStageAlert = ({ emissionStage }) => {
  if (!emissionStage || emissionStage.stage === 4) {
    return null;
  }

  const isAnomaly = emissionStage.stage === 'anomalo';

  return (
    <Alert className="bg-red-50 border-red-200">
      <div className="flex items-start gap-2">
        <XCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
        <AlertDescription className="flex-1 min-w-0">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-red-800">
              {isAnomaly ? 'Orden de firmas inconsistente' : 'Este XML es un COD en proceso — no está completo'}
            </p>
            <p className="text-sm text-red-700">
              {isAnomaly ? emissionStage.label : `Etapa detectada: ${emissionStage.label}.`}
            </p>
            {!isAnomaly && (
              <p className="text-sm text-red-700">
                Este documento no constituye un Certificado de Origen Digital válido hasta que complete todas las etapas de su emisión.
              </p>
            )}
          </div>
        </AlertDescription>
      </div>
    </Alert>
  );
};

export const UnexpectedElementsAlert = ({ elements, agreement, version }) => {
  if (!elements || elements.length === 0) {
    return null;
  }

  return (
    <Alert className="bg-amber-50 border-amber-200">
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 flex-shrink-0" />
        <AlertDescription className="flex-1 min-w-0">
          <div className="space-y-2">
            <p className="text-sm font-medium text-amber-800">
              Elementos con datos que no corresponden a este acuerdo/versión
            </p>
            <p className="text-sm text-amber-700">
              Los siguientes campos tienen contenido en el XML pero, según las especificaciones ALADI,
              no corresponden para el Acuerdo {agreement} / versión {version}. Puede tratarse de datos
              de otro formulario o de un error en la emisión del certificado.
            </p>
            <ul className="space-y-1">
              {elements.map(({ tag, value }) => (
                <li key={tag} className="text-sm text-amber-900">
                  <code className="inline-block px-2 py-0.5 text-xs font-mono bg-white rounded mr-2">
                    {`<${tag}>`}
                  </code>
                  {value.length > 80 ? `${value.slice(0, 80)}…` : value}
                </li>
              ))}
            </ul>
          </div>
        </AlertDescription>
      </div>
    </Alert>
  );
};

export const DocumentSignatures = ({ xmlDoc, integrityResults = {} }) => {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-900">
        Estado de Firmas Digitales
      </h3>

      <SignatureStatus
        xmlDoc={xmlDoc}
        elementId="COD"
        elementName="Exportador (EXP)"
        integrityResult={integrityResults?.COD}
      />

      <SignatureStatus
        xmlDoc={xmlDoc}
        elementId="CODEH"
        elementName="Funcionario Habilitado (FH)"
        integrityResult={integrityResults?.CODEH}
      />
    </div>
  );
};

export const Section = ({ title, children, count, level = 0, className = '' }) => (
  <div 
    className={`section-container ${className}`} 
    style={{ marginLeft: `${level * 0.5}rem` }}
  >
    <div className="flex items-center gap-2 mb-4">
      <h3 className="text-base sm:text-lg font-semibold text-gray-900">{title}</h3>
      {count > 0 && (
        <span className="px-2 py-0.5 text-xs sm:text-sm bg-blue-100 text-blue-800 rounded-full">
          {count} item{count !== 1 ? 's' : ''}
        </span>
      )}
    </div>
    <div className="grid-layout">
      {children}
    </div>
  </div>
);