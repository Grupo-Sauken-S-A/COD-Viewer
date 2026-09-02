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

export const SignatureStatus = ({ xmlDoc, elementId, elementName }) => {
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

  const displayInfo = getSignatureStatusDisplay(signatureStatus);

  return (
    <Alert 
      className={`mt-2 ${!signatureStatus.hasSignature ? 'bg-amber-50 border-amber-200' : 'bg-blue-50 border-blue-200'}`}
    >
      <div className="flex items-start gap-2">
        {!signatureStatus.hasSignature ? (
          <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5" />
        ) : (
          <Info className="h-5 w-5 text-blue-500 mt-0.5" />
        )}
        <AlertDescription>
          <div className="space-y-1">
            <code className="inline-block px-2 py-1 text-xs font-mono bg-white rounded">
              {elementName}
            </code>
            <div className={`text-sm whitespace-pre-line ${displayInfo.className}`}>
              {displayInfo.text}
            </div>
          </div>
        </AlertDescription>
      </div>
    </Alert>
  );
};

export const DocumentSignatures = ({ xmlDoc }) => {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-900">
        Estado de Firmas Digitales
      </h3>
      
      <SignatureStatus
        xmlDoc={xmlDoc}
        elementId="COD"
        elementName="Certificado de Origen Digital (COD)"
      />

      <SignatureStatus
        xmlDoc={xmlDoc}
        elementId="CODEH"
        elementName="Certificado de Origen Digital con Entidad Habilitada (CODEH)"
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