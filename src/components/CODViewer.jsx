"use client";

import React, { useState, useEffect } from 'react';
import { Upload, XCircle, FileText, Download } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Field, Section, DocumentSignatures, UnexpectedElementsAlert } from './signature-components';
import { generateCODPDF } from './pdf-generator';
import { XML_SPECIFICATIONS } from './xml-specifications.js';
import {
  AGREEMENT_MAPPING,
  getFieldRequirement as getFieldRequirementSpec,
  getElementWithSpecPriority as getElementWithSpecPrioritySpec,
  getGoodsItemNameField as getGoodsItemNameFieldSpec,
  getValueFieldWithSpecPriority as getValueFieldWithSpecPrioritySpec,
  getOperatorContent as getOperatorContentSpec,
  getEHCityFieldWithSpecPriority as getEHCityFieldWithSpecPrioritySpec,
  getUnexpectedElements,
  isRequiredFieldEmpty
} from '@/lib/cod-spec';

const CODViewer = () => {
  const [xmlData, setXmlData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [xmlSpecifications, setXmlSpecifications] = useState(null);
  const [currentVersion, setCurrentVersion] = useState(null);
  const [currentAgreement, setCurrentAgreement] = useState(null);
  const [originalAgreement, setOriginalAgreement] = useState(null);

  const getFieldRequirement = (elementName) => {
    return getFieldRequirementSpec(xmlSpecifications, currentVersion, currentAgreement, elementName);
  };

  const shouldShowField = (elementName) => {
    const requirement = getFieldRequirement(elementName);
    return requirement !== 'NC';
  };

  // Nueva función para determinar si debe mostrar la sección de facturas
  const shouldShowInvoiceSection = () => {
    // Verificar si hay elementos Invoice en el XML o si algún campo relacionado debe mostrarse
    const hasInvoiceElements = xmlData && xmlData.querySelectorAll('Invoice').length > 0;
    const invoiceFields = ['InvoiceQty', 'InvoiceOrderNo', 'InvoiceNo', 'InvoiceDate'];
    const hasRelevantInvoiceFields = invoiceFields.some(field => shouldShowField(field));
    
    return hasInvoiceElements || hasRelevantInvoiceFields;
  };

  // Nueva función para determinar si debe mostrar la sección de mercaderías
  const shouldShowGoodsSection = () => {
    // Verificar si hay elementos Goods en el XML o si algún campo relacionado debe mostrarse
    const hasGoodsElements = xmlData && xmlData.querySelectorAll('Goods').length > 0;
    const goodsFields = ['GoodsQty', 'GoodsOrderNo', 'GoodsItemCode', 'GoodsItemName', 'GoodsDescription', 'GoodsItemWeightAmount', 'GoodsItemMeasureUnit', 'GoodsItemValue', 'GoodsItemFOB', 'GoodsItemOriginRules', 'GoodsDeclarationDate', 'GoodsDeclarationNumber'];
    const hasRelevantGoodsFields = goodsFields.some(field => shouldShowField(field));
    
    return hasGoodsElements || hasRelevantGoodsFields;
  };

  const getElementWithSpecPriority = (xmlData, primaryElement, alternativeElements = []) => {
    return getElementWithSpecPrioritySpec(xmlSpecifications, currentVersion, currentAgreement, xmlData, primaryElement, alternativeElements);
  };

  const getValueFieldWithSpecPriority = (good) => {
    return getValueFieldWithSpecPrioritySpec(xmlSpecifications, currentVersion, currentAgreement, good);
  };

  const getOperatorContent = (xmlData, fieldName) => {
    return getOperatorContentSpec(xmlSpecifications, currentVersion, currentAgreement, xmlData, fieldName);
  };

  const getEHCityFieldWithSpecPriority = (ehElement) => {
    return getEHCityFieldWithSpecPrioritySpec(xmlSpecifications, currentVersion, currentAgreement, ehElement);
  };

  const shouldShowThirdOperatorSection = () => {
    const allOperatorFields = [
      'ThirdOpCountry', 'ThirdOpBusinessName', 'ThirdOpAddress', 'ThirdOpCity', 'ThirdOpInvoiceNo', 'ThirdOpInvoiceDate', 'ThirdOpStatement',
      'Op3cCountry', 'Op3cBusinessName', 'Op3cAddress', 'Op3cInvoiceNo', 'Op3cInvoiceDate', 'Op3cStatement'
    ];
    
    return allOperatorFields.some(fieldName => {
      const requirement = getFieldRequirement(fieldName);
      return requirement !== 'NC';
    });
  };

  const shouldShowAnyAlternative = (elementNames) => {
    return elementNames.some(elementName => {
      const requirement = getFieldRequirement(elementName);
      return requirement !== 'NC';
    });
  };

  const getFieldValue = (rawValue, requirement) => {
    const isEmpty = !rawValue || rawValue.trim() === '';
    
    if (isEmpty && requirement === 'M') {
      return 'No informado';
    }
    
    return rawValue || null;
  };

  const renderThirdOperatorField = (xmlData, fieldName, label) => {
    const result = getOperatorContent(xmlData, fieldName);
    
    if (result.requirement === 'NC') {
      return null;
    }

    const fieldValue = getFieldValue(result.value, result.requirement);
    const hasError = isRequiredFieldEmpty(result.value, result.requirement);

    return (
      <Field 
        label={label}
        value={fieldValue}
        required={result.requirement === 'M'}
        optional={result.requirement === 'O'}
        hasError={hasError}
      />
    );
  };

  const processXML = (xmlContent) => {
    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlContent, 'text/xml');

      if (xmlDoc.getElementsByTagName('parsererror').length > 0) {
        throw new Error('El archivo XML no es válido');
      }

      const version = xmlDoc.querySelector('CODVer')?.textContent?.trim();
      const agreement = xmlDoc.querySelector('AgreementAcronym')?.textContent?.trim();

      if (version) {
        setCurrentVersion(version);
      }
      if (agreement) {
        setOriginalAgreement(agreement);
        setCurrentAgreement(agreement);
      }

      setXmlData(xmlDoc);
      setError(null);
    } catch (err) {
      setError('Error al procesar el XML: ' + err.message);
      setXmlData(null);
    }
  };

  const handleFileUpload = async (event) => {
    try {
      setError(null);
      const file = event.target.files[0];
      if (!file) return;

      if (!file.name.toLowerCase().endsWith('.xml')) {
        setError('Por favor seleccione un archivo XML válido');
        return;
      }

      const text = await file.text();
      processXML(text);
    } catch (err) {
      setError('Error al procesar el archivo: ' + err.message);
    }
  };

  const handleGeneratePDF = async () => {
    if (!xmlData) return;
    
    try {
      setPdfGenerating(true);
      const result = await generateCODPDF(xmlData);
      
      if (!result.success) {
        setError(`Error al generar PDF: ${result.error}`);
      }
    } catch (err) {
      setError(`Error al generar PDF: ${err.message}`);
    } finally {
      setPdfGenerating(false);
    }
  };

  useEffect(() => {
    setXmlSpecifications(XML_SPECIFICATIONS);
  }, []);

  useEffect(() => {
    const loadXMLFromURL = async () => {
        try {
            const params = new URLSearchParams(window.location.search);
            const xmlUri = params.get('xmlUri');

            if (xmlUri) {
                setLoading(true);
                const proxyUrl = `/api/proxy?url=${encodeURIComponent(xmlUri)}`;
                const response = await fetch(proxyUrl);
                
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                
                const xmlContent = await response.text();
                processXML(xmlContent);
            }
        } catch (err) {
            setError('Error al cargar el XML desde URL: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    loadXMLFromURL();
  }, []);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-6">
          <div className="text-center">
            <p className="text-gray-600">Cargando...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <div className="max-w-full mx-auto p-4 bg-red-50 rounded-lg text-red-900 border border-red-200">
        <div className="flex items-center">
          <XCircle className="h-5 w-5 text-red-500 mr-2 flex-shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!xmlData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Visualizador de Certificados de Origen Digital COD ALADI</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="upload-zone">
            <Upload className="w-12 h-12 sm:w-16 sm:h-16 text-gray-400 mb-4" />
            <label className="btn-primary mb-3 cursor-pointer">
              Seleccionar Archivo XML
              <input
                type="file"
                accept=".xml"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
            <p className="text-xs sm:text-sm text-gray-500">
              Seleccione un archivo XML de Certificado de Origen Digital o use el parámetro xmlUri en la URL
            </p>
            <div className="mt-4 text-center text-xs text-gray-500">
              Desarrollado por <a href="https://sauken.com.ar/" className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">Sauken</a> para{' '}
              <a href="https://certificadoorigen.com.ar/" className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">Certificados de Origen</a>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const certificationEH = xmlData.querySelector('CertificationEH');
  const eh = xmlData.querySelector('EH');
  const unexpectedElements = getUnexpectedElements(xmlSpecifications, currentVersion, currentAgreement, xmlData);

  return (
    <Card>
      <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <CardTitle>
          Certificado de Origen Digital
          {currentVersion && originalAgreement && (
            <span className="text-sm font-normal text-gray-600 ml-2">
              (Versión {currentVersion} - Acuerdo {originalAgreement}
              {AGREEMENT_MAPPING[originalAgreement] && AGREEMENT_MAPPING[originalAgreement] !== originalAgreement && 
                ` - Validado como ${AGREEMENT_MAPPING[originalAgreement]}`
              })
            </span>
          )}
        </CardTitle>
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            onClick={handleGeneratePDF}
            disabled={pdfGenerating}
            className="btn-primary cursor-pointer text-center flex items-center justify-center gap-2"
          >
            {pdfGenerating ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Generando PDF...
              </>
            ) : (
              <>
                <FileText className="h-4 w-4" />
                Ver en PDF
              </>
            )}
          </button>
          <label className="btn-primary cursor-pointer text-center flex items-center justify-center gap-2">
            <Upload className="h-4 w-4" />
            Cargar otro archivo
            <input
              type="file"
              accept=".xml"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          <UnexpectedElementsAlert
            elements={unexpectedElements}
            agreement={originalAgreement}
            version={currentVersion}
          />

          <DocumentSignatures xmlDoc={xmlData} />

          <Section title="Estructura del Certificado de Origen" level={0}>
            <Section title="Certificado de Origen Digital (CODEH)" level={1} className="col-span-full">
              <Section title="Certificado de Origen Digital (COD)" level={2} className="col-span-full">

                <Section title="Información General" level={3} className="col-span-full">
                  {shouldShowField('CODVer') && (
                    <Field 
                      label="Versión" 
                      value={getFieldValue(xmlData.querySelector('CODVer')?.textContent, getFieldRequirement('CODVer'))}
                      required={getFieldRequirement('CODVer') === 'M'}
                      optional={getFieldRequirement('CODVer') === 'O'}
                      hasError={isRequiredFieldEmpty(xmlData.querySelector('CODVer')?.textContent, getFieldRequirement('CODVer'))}
                    />
                  )}
                  {shouldShowField('CODSubmitterType') && (
                    <Field 
                      label="Tipo de Remitente" 
                      value={getFieldValue(xmlData.querySelector('CODSubmitterType')?.textContent, getFieldRequirement('CODSubmitterType'))}
                      required={getFieldRequirement('CODSubmitterType') === 'M'}
                      optional={getFieldRequirement('CODSubmitterType') === 'O'}
                      hasError={isRequiredFieldEmpty(xmlData.querySelector('CODSubmitterType')?.textContent, getFieldRequirement('CODSubmitterType'))}
                    />
                  )}
                </Section>

                <Section title="Acuerdo Comercial" level={3} className="col-span-full">
                  {shouldShowField('AgreementName') && (
                    <Field 
                      label="Nombre" 
                      value={getFieldValue(xmlData.querySelector('AgreementName')?.textContent, getFieldRequirement('AgreementName'))}
                      required={getFieldRequirement('AgreementName') === 'M'}
                      optional={getFieldRequirement('AgreementName') === 'O'}
                      hasError={isRequiredFieldEmpty(xmlData.querySelector('AgreementName')?.textContent, getFieldRequirement('AgreementName'))}
                    />
                  )}
                  {shouldShowField('AgreementAcronym') && (
                    <Field 
                      label="Acrónimo" 
                      value={getFieldValue(originalAgreement, getFieldRequirement('AgreementAcronym'))}
                      required={getFieldRequirement('AgreementAcronym') === 'M'}
                      optional={getFieldRequirement('AgreementAcronym') === 'O'}
                      hasError={isRequiredFieldEmpty(originalAgreement, getFieldRequirement('AgreementAcronym'))}
                    />
                  )}
                </Section>

                <Section title="Datos del Exportador" level={3} className="col-span-full">
                  {shouldShowField('ExporterCountry') && (
                    <Field 
                      label="País" 
                      value={getFieldValue(xmlData.querySelector('ExporterCountry')?.textContent, getFieldRequirement('ExporterCountry'))}
                      required={getFieldRequirement('ExporterCountry') === 'M'}
                      optional={getFieldRequirement('ExporterCountry') === 'O'}
                      hasError={isRequiredFieldEmpty(xmlData.querySelector('ExporterCountry')?.textContent, getFieldRequirement('ExporterCountry'))}
                    />
                  )}
                  {shouldShowField('ExporterBusinessName') && (
                    <Field 
                      label="Razón Social" 
                      value={getFieldValue(xmlData.querySelector('ExporterBusinessName')?.textContent, getFieldRequirement('ExporterBusinessName'))}
                      required={getFieldRequirement('ExporterBusinessName') === 'M'}
                      optional={getFieldRequirement('ExporterBusinessName') === 'O'}
                      hasError={isRequiredFieldEmpty(xmlData.querySelector('ExporterBusinessName')?.textContent, getFieldRequirement('ExporterBusinessName'))}
                    />
                  )}
                  {shouldShowField('ExporterAddress') && (
                    <Field 
                      label="Domicilio" 
                      value={getFieldValue(xmlData.querySelector('ExporterAddress')?.textContent, getFieldRequirement('ExporterAddress'))}
                      required={getFieldRequirement('ExporterAddress') === 'M'}
                      optional={getFieldRequirement('ExporterAddress') === 'O'}
                      hasError={isRequiredFieldEmpty(xmlData.querySelector('ExporterAddress')?.textContent, getFieldRequirement('ExporterAddress'))}
                    />
                  )}
                  {shouldShowField('ExporterCity') && (
                    <Field 
                      label="Ciudad" 
                      value={getFieldValue(xmlData.querySelector('ExporterCity')?.textContent, getFieldRequirement('ExporterCity'))}
                      required={getFieldRequirement('ExporterCity') === 'M'}
                      optional={getFieldRequirement('ExporterCity') === 'O'}
                      hasError={isRequiredFieldEmpty(xmlData.querySelector('ExporterCity')?.textContent, getFieldRequirement('ExporterCity'))}
                    />
                  )}
                  {shouldShowField('ExporterTelephone') && (
                    <Field 
                      label="Teléfono" 
                      value={getFieldValue(xmlData.querySelector('ExporterTelephone')?.textContent, getFieldRequirement('ExporterTelephone'))}
                      required={getFieldRequirement('ExporterTelephone') === 'M'}
                      optional={getFieldRequirement('ExporterTelephone') === 'O'}
                      hasError={isRequiredFieldEmpty(xmlData.querySelector('ExporterTelephone')?.textContent, getFieldRequirement('ExporterTelephone'))}
                    />
                  )}
                  {shouldShowField('ExporterFax') && (
                    <Field 
                      label="Fax" 
                      value={getFieldValue(xmlData.querySelector('ExporterFax')?.textContent, getFieldRequirement('ExporterFax'))}
                      required={getFieldRequirement('ExporterFax') === 'M'}
                      optional={getFieldRequirement('ExporterFax') === 'O'}
                      hasError={isRequiredFieldEmpty(xmlData.querySelector('ExporterFax')?.textContent, getFieldRequirement('ExporterFax'))}
                    />
                  )}
                  {shouldShowField('ExporterEmail') && (
                    <Field 
                      label="Email" 
                      value={getFieldValue(xmlData.querySelector('ExporterEmail')?.textContent, getFieldRequirement('ExporterEmail'))}
                      required={getFieldRequirement('ExporterEmail') === 'M'}
                      optional={getFieldRequirement('ExporterEmail') === 'O'}
                      hasError={isRequiredFieldEmpty(xmlData.querySelector('ExporterEmail')?.textContent, getFieldRequirement('ExporterEmail'))}
                    />
                  )}
                  {shouldShowField('ExporterURL') && (
                    <Field 
                      label="Website" 
                      value={getFieldValue(xmlData.querySelector('ExporterURL')?.textContent, getFieldRequirement('ExporterURL'))}
                      required={getFieldRequirement('ExporterURL') === 'M'}
                      optional={getFieldRequirement('ExporterURL') === 'O'}
                      hasError={isRequiredFieldEmpty(xmlData.querySelector('ExporterURL')?.textContent, getFieldRequirement('ExporterURL'))}
                    />
                  )}
                </Section>

                {shouldShowField('SubscriberSubmitterName') && (
                  <Section title="Datos del Suscriptor" level={3} className="col-span-full">
                    <Field 
                      label="Nombre del Suscriptor" 
                      value={getFieldValue(xmlData.querySelector('SubscriberSubmitterName')?.textContent, getFieldRequirement('SubscriberSubmitterName'))}
                      required={getFieldRequirement('SubscriberSubmitterName') === 'M'}
                      optional={getFieldRequirement('SubscriberSubmitterName') === 'O'}
                      hasError={isRequiredFieldEmpty(xmlData.querySelector('SubscriberSubmitterName')?.textContent, getFieldRequirement('SubscriberSubmitterName'))}
                    />
                  </Section>
                )}

                {shouldShowInvoiceSection() && (
                  <Section 
                    title="Facturas Comerciales" 
                    className="col-span-full"
                    level={3} 
                    count={xmlData.querySelectorAll('Invoice').length}
                  >
                    {Array.from(xmlData.querySelectorAll('Invoice') || []).map((invoice, index) => (
                      <div key={index} className="item-card invoice">
                        <div className="flex-row-container">
                          {shouldShowField('InvoiceOrderNo') && (
                            <Field 
                              label="Orden"
                              value={getFieldValue(invoice.querySelector('InvoiceOrderNo')?.textContent, getFieldRequirement('InvoiceOrderNo'))}
                              required={getFieldRequirement('InvoiceOrderNo') === 'M'}
                              optional={getFieldRequirement('InvoiceOrderNo') === 'O'}
                              hasError={isRequiredFieldEmpty(invoice.querySelector('InvoiceOrderNo')?.textContent, getFieldRequirement('InvoiceOrderNo'))}
                            />
                          )}
                          {shouldShowField('InvoiceNo') && (
                            <Field 
                              label="Número"
                              value={getFieldValue(invoice.querySelector('InvoiceNo')?.textContent, getFieldRequirement('InvoiceNo'))}
                              required={getFieldRequirement('InvoiceNo') === 'M'}
                              optional={getFieldRequirement('InvoiceNo') === 'O'}
                              hasError={isRequiredFieldEmpty(invoice.querySelector('InvoiceNo')?.textContent, getFieldRequirement('InvoiceNo'))}
                            />
                          )}
                          {shouldShowField('InvoiceDate') && (
                            <Field 
                              label="Fecha"
                              value={(() => {
                                const dateValue = invoice.querySelector('InvoiceDate')?.textContent;
                                const requirement = getFieldRequirement('InvoiceDate');
                                if (dateValue) {
                                  return new Date(dateValue).toLocaleDateString();
                                }
                                return getFieldValue(dateValue, requirement);
                              })()}
                              required={getFieldRequirement('InvoiceDate') === 'M'}
                              optional={getFieldRequirement('InvoiceDate') === 'O'}
                              hasError={isRequiredFieldEmpty(invoice.querySelector('InvoiceDate')?.textContent, getFieldRequirement('InvoiceDate'))}
                            />
                          )}
                        </div>
                      </div>
                    ))}
                  </Section>
                )}

                {shouldShowGoodsSection() && (
                  <Section 
                    title="Lista de Mercaderías" 
                    className="col-span-full"
                    level={3} 
                    count={xmlData.querySelectorAll('Goods').length}
                  >
                    {Array.from(xmlData.querySelectorAll('Goods') || []).map((good, index) => (
                      <div key={index} className="item-card goods">
                        <div className="flex-row-container">
                          {shouldShowField('GoodsOrderNo') && (
                            <Field 
                              label="Orden"
                              value={getFieldValue(good.querySelector('GoodsOrderNo')?.textContent, getFieldRequirement('GoodsOrderNo'))}
                              required={getFieldRequirement('GoodsOrderNo') === 'M'}
                              optional={getFieldRequirement('GoodsOrderNo') === 'O'}
                              hasError={isRequiredFieldEmpty(good.querySelector('GoodsOrderNo')?.textContent, getFieldRequirement('GoodsOrderNo'))}
                            />
                          )}
                          {shouldShowField('GoodsItemCode') && (
                            <Field 
                              label="Posición Arancelaria"
                              value={getFieldValue(good.querySelector('GoodsItemCode')?.textContent, getFieldRequirement('GoodsItemCode'))}
                              required={getFieldRequirement('GoodsItemCode') === 'M'}
                              optional={getFieldRequirement('GoodsItemCode') === 'O'}
                              hasError={isRequiredFieldEmpty(good.querySelector('GoodsItemCode')?.textContent, getFieldRequirement('GoodsItemCode'))}
                            />
                          )}
                        </div>

                        {(() => {
                          const nameResult = getGoodsItemNameFieldSpec(xmlSpecifications, currentVersion, currentAgreement, good);
                          if (nameResult.requirement === 'NC') return null;

                          return (
                            <Field
                              label="Descripción"
                              value={getFieldValue(nameResult.value, nameResult.requirement)}
                              required={nameResult.requirement === 'M'}
                              optional={nameResult.requirement === 'O'}
                              hasError={isRequiredFieldEmpty(nameResult.value, nameResult.requirement)}
                            />
                          );
                        })()}

                        <div className="flex-row-container">
                          {shouldShowField('GoodsItemWeightAmount') && (
                            <Field 
                              label="Cantidad o Peso"
                              value={getFieldValue(good.querySelector('GoodsItemWeightAmount')?.textContent, getFieldRequirement('GoodsItemWeightAmount'))}
                              required={getFieldRequirement('GoodsItemWeightAmount') === 'M'}
                              optional={getFieldRequirement('GoodsItemWeightAmount') === 'O'}
                              hasError={isRequiredFieldEmpty(good.querySelector('GoodsItemWeightAmount')?.textContent, getFieldRequirement('GoodsItemWeightAmount'))}
                            />
                          )}
                          {shouldShowField('GoodsItemMeasureUnit') && (
                            <Field 
                              label="Unidad de Medida"
                              value={getFieldValue(good.querySelector('GoodsItemMeasureUnit')?.textContent, getFieldRequirement('GoodsItemMeasureUnit'))}
                              required={getFieldRequirement('GoodsItemMeasureUnit') === 'M'}
                              optional={getFieldRequirement('GoodsItemMeasureUnit') === 'O'}
                              hasError={isRequiredFieldEmpty(good.querySelector('GoodsItemMeasureUnit')?.textContent, getFieldRequirement('GoodsItemMeasureUnit'))}
                            />
                          )}
                          
                          {(() => {
                            const valueField = getValueFieldWithSpecPriority(good);
                            if (valueField.requirement === 'NC') return null;
                            
                            return (
                              <Field 
                                label="Importe" 
                                value={getFieldValue(valueField.value, valueField.requirement)}
                                required={valueField.requirement === 'M'}
                                optional={valueField.requirement === 'O'}
                                hasError={isRequiredFieldEmpty(valueField.value, valueField.requirement)}
                              />
                            );
                          })()}
                        </div>

                       {shouldShowField('GoodsItemOriginRules') && (
                          <Field 
                            label="Norma de Origen"
                            value={getFieldValue(good.querySelector('GoodsItemOriginRules')?.textContent, getFieldRequirement('GoodsItemOriginRules'))}
                            required={getFieldRequirement('GoodsItemOriginRules') === 'M'}
                            optional={getFieldRequirement('GoodsItemOriginRules') === 'O'}
                            hasError={isRequiredFieldEmpty(good.querySelector('GoodsItemOriginRules')?.textContent, getFieldRequirement('GoodsItemOriginRules'))}
                          />
                        )}

                        <div className="flex-row-container">
                          {shouldShowField('GoodsDeclarationDate') && (
                            <Field 
                              label="Fecha de DJO"
                              value={(() => {
                                const dateValue = good.querySelector('GoodsDeclarationDate')?.textContent;
                                const requirement = getFieldRequirement('GoodsDeclarationDate');
                                if (dateValue) {
                                  return new Date(dateValue).toLocaleDateString();
                                }
                                return getFieldValue(dateValue, requirement);
                              })()}
                              required={getFieldRequirement('GoodsDeclarationDate') === 'M'}
                              optional={getFieldRequirement('GoodsDeclarationDate') === 'O'}
                              hasError={isRequiredFieldEmpty(good.querySelector('GoodsDeclarationDate')?.textContent, getFieldRequirement('GoodsDeclarationDate'))}
                            />
                          )}
                          {shouldShowField('GoodsDeclarationNumber') && (
                            <Field 
                              label="Número de DJO"
                              value={getFieldValue(good.querySelector('GoodsDeclarationNumber')?.textContent, getFieldRequirement('GoodsDeclarationNumber'))}
                              required={getFieldRequirement('GoodsDeclarationNumber') === 'M'}
                              optional={getFieldRequirement('GoodsDeclarationNumber') === 'O'}
                              hasError={isRequiredFieldEmpty(good.querySelector('GoodsDeclarationNumber')?.textContent, getFieldRequirement('GoodsDeclarationNumber'))}
                            />
                          )}
                        </div>
                      </div>
                    ))}
                  </Section>
                )}

                <Section title="Datos del Importador" level={3} className="col-span-full">
                  {shouldShowField('ImporterCountry') && (
                    <Field 
                      label="País" 
                      value={getFieldValue(xmlData.querySelector('ImporterCountry')?.textContent, getFieldRequirement('ImporterCountry'))}
                      required={getFieldRequirement('ImporterCountry') === 'M'}
                      optional={getFieldRequirement('ImporterCountry') === 'O'}
                      hasError={isRequiredFieldEmpty(xmlData.querySelector('ImporterCountry')?.textContent, getFieldRequirement('ImporterCountry'))}
                    />
                  )}
                  {shouldShowField('ImporterBusinessName') && (
                    <Field 
                      label="Razón Social" 
                      value={getFieldValue(xmlData.querySelector('ImporterBusinessName')?.textContent, getFieldRequirement('ImporterBusinessName'))}
                      required={getFieldRequirement('ImporterBusinessName') === 'M'}
                      optional={getFieldRequirement('ImporterBusinessName') === 'O'}
                      hasError={isRequiredFieldEmpty(xmlData.querySelector('ImporterBusinessName')?.textContent, getFieldRequirement('ImporterBusinessName'))}
                    />
                  )}
                  {shouldShowField('ImporterAddress') && (
                    <Field 
                      label="Domicilio" 
                      value={getFieldValue(xmlData.querySelector('ImporterAddress')?.textContent, getFieldRequirement('ImporterAddress'))}
                      required={getFieldRequirement('ImporterAddress') === 'M'}
                      optional={getFieldRequirement('ImporterAddress') === 'O'}
                      hasError={isRequiredFieldEmpty(xmlData.querySelector('ImporterAddress')?.textContent, getFieldRequirement('ImporterAddress'))}
                    />
                  )}
                  {shouldShowField('ImporterCity') && (
                    <Field 
                      label="Ciudad" 
                      value={getFieldValue(xmlData.querySelector('ImporterCity')?.textContent, getFieldRequirement('ImporterCity'))}
                      required={getFieldRequirement('ImporterCity') === 'M'}
                      optional={getFieldRequirement('ImporterCity') === 'O'}
                      hasError={isRequiredFieldEmpty(xmlData.querySelector('ImporterCity')?.textContent, getFieldRequirement('ImporterCity'))}
                    />
                  )}
                  {shouldShowField('ImporterTelephone') && (
                    <Field 
                      label="Teléfono" 
                      value={getFieldValue(xmlData.querySelector('ImporterTelephone')?.textContent, getFieldRequirement('ImporterTelephone'))}
                      required={getFieldRequirement('ImporterTelephone') === 'M'}
                      optional={getFieldRequirement('ImporterTelephone') === 'O'}
                      hasError={isRequiredFieldEmpty(xmlData.querySelector('ImporterTelephone')?.textContent, getFieldRequirement('ImporterTelephone'))}
                    />
                  )}
                  {shouldShowField('ImporterFax') && (
                    <Field 
                      label="Fax" 
                      value={getFieldValue(xmlData.querySelector('ImporterFax')?.textContent, getFieldRequirement('ImporterFax'))}
                      required={getFieldRequirement('ImporterFax') === 'M'}
                      optional={getFieldRequirement('ImporterFax') === 'O'}
                      hasError={isRequiredFieldEmpty(xmlData.querySelector('ImporterFax')?.textContent, getFieldRequirement('ImporterFax'))}
                    />
                  )}
                  {shouldShowField('ImporterEmail') && (
                    <Field 
                      label="Email" 
                      value={getFieldValue(xmlData.querySelector('ImporterEmail')?.textContent, getFieldRequirement('ImporterEmail'))}
                      required={getFieldRequirement('ImporterEmail') === 'M'}
                      optional={getFieldRequirement('ImporterEmail') === 'O'}
                      hasError={isRequiredFieldEmpty(xmlData.querySelector('ImporterEmail')?.textContent, getFieldRequirement('ImporterEmail'))}
                    />
                  )}
                  {shouldShowField('ImporterURL') && (
                    <Field 
                      label="Website" 
                      value={getFieldValue(xmlData.querySelector('ImporterURL')?.textContent, getFieldRequirement('ImporterURL'))}
                      required={getFieldRequirement('ImporterURL') === 'M'}
                      optional={getFieldRequirement('ImporterURL') === 'O'}
                      hasError={isRequiredFieldEmpty(xmlData.querySelector('ImporterURL')?.textContent, getFieldRequirement('ImporterURL'))}
                    />
                  )}
                </Section>

                {shouldShowAnyAlternative(['ConsigneeCountry', 'ConsigneeBusinessName', 'ConsigneeAddress', 'ConsigneeCity']) && (
                  <Section title="Datos del Consignatario" level={3} className="col-span-full">
                    {shouldShowField('ConsigneeCountry') && (
                      <Field 
                        label="País" 
                        value={getFieldValue(xmlData.querySelector('ConsigneeCountry')?.textContent, getFieldRequirement('ConsigneeCountry'))}
                        required={getFieldRequirement('ConsigneeCountry') === 'M'}
                        optional={getFieldRequirement('ConsigneeCountry') === 'O'}
                        hasError={isRequiredFieldEmpty(xmlData.querySelector('ConsigneeCountry')?.textContent, getFieldRequirement('ConsigneeCountry'))}
                      />
                    )}
                    {shouldShowField('ConsigneeBusinessName') && (
                      <Field 
                        label="Razón Social" 
                        value={getFieldValue(xmlData.querySelector('ConsigneeBusinessName')?.textContent, getFieldRequirement('ConsigneeBusinessName'))}
                        required={getFieldRequirement('ConsigneeBusinessName') === 'M'}
                        optional={getFieldRequirement('ConsigneeBusinessName') === 'O'}
                        hasError={isRequiredFieldEmpty(xmlData.querySelector('ConsigneeBusinessName')?.textContent, getFieldRequirement('ConsigneeBusinessName'))}
                      />
                    )}
                    {shouldShowField('ConsigneeAddress') && (
                      <Field 
                        label="Domicilio" 
                        value={getFieldValue(xmlData.querySelector('ConsigneeAddress')?.textContent, getFieldRequirement('ConsigneeAddress'))}
                        required={getFieldRequirement('ConsigneeAddress') === 'M'}
                        optional={getFieldRequirement('ConsigneeAddress') === 'O'}
                        hasError={isRequiredFieldEmpty(xmlData.querySelector('ConsigneeAddress')?.textContent, getFieldRequirement('ConsigneeAddress'))}
                      />
                    )}
                    {shouldShowField('ConsigneeCity') && (
                      <Field 
                        label="Ciudad" 
                        value={getFieldValue(xmlData.querySelector('ConsigneeCity')?.textContent, getFieldRequirement('ConsigneeCity'))}
                        required={getFieldRequirement('ConsigneeCity') === 'M'}
                        optional={getFieldRequirement('ConsigneeCity') === 'O'}
                        hasError={isRequiredFieldEmpty(xmlData.querySelector('ConsigneeCity')?.textContent, getFieldRequirement('ConsigneeCity'))}
                      />
                    )}
                  </Section>
                )}

                <Section title="Datos del Transporte" level={3} className="col-span-full">
                  {(() => {
                    const portResult = getElementWithSpecPriority(xmlData, 'TransportPortOfLoading', ['LoadingPortName']);
                    if (portResult.requirement === 'NC') return null;
                    
                    return (
                      <Field 
                        label="Puerto de Carga" 
                        value={getFieldValue(portResult.value, portResult.requirement)}
                        required={portResult.requirement === 'M'}
                        optional={portResult.requirement === 'O'}
                        hasError={isRequiredFieldEmpty(portResult.value, portResult.requirement)}
                      />
                    );
                  })()}

                  {shouldShowField('TransportMeans') && (
                    <Field 
                      label="Medio" 
                      value={getFieldValue(xmlData.querySelector('TransportMeans')?.textContent, getFieldRequirement('TransportMeans'))}
                      required={getFieldRequirement('TransportMeans') === 'M'}
                      optional={getFieldRequirement('TransportMeans') === 'O'}
                      hasError={isRequiredFieldEmpty(xmlData.querySelector('TransportMeans')?.textContent, getFieldRequirement('TransportMeans'))}
                    />
                  )}

                  {shouldShowField('TransportCountryDestination') && (
                    <Field 
                      label="País Destino" 
                      value={getFieldValue(xmlData.querySelector('TransportCountryDestination')?.textContent, getFieldRequirement('TransportCountryDestination'))}
                      required={getFieldRequirement('TransportCountryDestination') === 'M'}
                      optional={getFieldRequirement('TransportCountryDestination') === 'O'}
                      hasError={isRequiredFieldEmpty(xmlData.querySelector('TransportCountryDestination')?.textContent, getFieldRequirement('TransportCountryDestination'))}
                    />
                  )}
                </Section>

                <Section title="Comentarios" level={3} className="col-span-full">
                  {shouldShowField('GeneralComments') && (
                    <Field 
                      label="Comentarios Generales" 
                      value={getFieldValue(xmlData.querySelector('GeneralComments')?.textContent, getFieldRequirement('GeneralComments'))}
                      required={getFieldRequirement('GeneralComments') === 'M'}
                      optional={getFieldRequirement('GeneralComments') === 'O'}
                      hasError={isRequiredFieldEmpty(xmlData.querySelector('GeneralComments')?.textContent, getFieldRequirement('GeneralComments'))}
                    />
                  )}
                  
                  {shouldShowThirdOperatorSection() && (
                    <Section title="Tercer Operador" className="col-span-full">
                      {renderThirdOperatorField(xmlData, 'Country', 'País')}
                      {renderThirdOperatorField(xmlData, 'BusinessName', 'Razón Social')}
                      {renderThirdOperatorField(xmlData, 'Address', 'Domicilio')}
                      {shouldShowField('ThirdOpCity') && (
                        <Field
                          label="Ciudad"
                          value={getFieldValue(xmlData.querySelector('ThirdOpCity')?.textContent, getFieldRequirement('ThirdOpCity'))}
                          required={getFieldRequirement('ThirdOpCity') === 'M'}
                          optional={getFieldRequirement('ThirdOpCity') === 'O'}
                          hasError={isRequiredFieldEmpty(xmlData.querySelector('ThirdOpCity')?.textContent, getFieldRequirement('ThirdOpCity'))}
                        />
                      )}
                      {renderThirdOperatorField(xmlData, 'InvoiceNo', 'Número de Factura')}
                      {(() => {
                        const result = getOperatorContent(xmlData, 'InvoiceDate');
                        
                        if (result.requirement === 'NC') {
                          return null;
                        }

                        const dateValue = result.value ? new Date(result.value).toLocaleDateString() : null;
                        const fieldValue = getFieldValue(dateValue, result.requirement);
                        const hasError = isRequiredFieldEmpty(result.value, result.requirement);

                        return (
                          <Field
                            label="Fecha de Factura"
                            value={fieldValue}
                            required={result.requirement === 'M'}
                            optional={result.requirement === 'O'}
                            hasError={hasError}
                          />
                        );
                      })()}
                      {renderThirdOperatorField(xmlData, 'Statement', 'Declaración')}
                    </Section>
                  )}
                </Section>

                <Section title="Declaración de Origen" level={3} className="col-span-full">
                  {shouldShowField('DeclarationDate') && (
                    <Field 
                      label="Fecha de Solicitud" 
                      value={(() => {
                        const dateValue = xmlData.querySelector('DeclarationDate')?.textContent;
                        const requirement = getFieldRequirement('DeclarationDate');
                        if (dateValue) {
                          return new Date(dateValue).toLocaleDateString();
                        }
                        return getFieldValue(dateValue, requirement);
                      })()}
                      required={getFieldRequirement('DeclarationDate') === 'M'}
                      optional={getFieldRequirement('DeclarationDate') === 'O'}
                      hasError={isRequiredFieldEmpty(xmlData.querySelector('DeclarationDate')?.textContent, getFieldRequirement('DeclarationDate'))}
                    />
                  )}
                  {shouldShowField('DeclarationRequestNo') && (
                    <Field 
                      label="Número de Solicitud" 
                      value={getFieldValue(xmlData.querySelector('DeclarationRequestNo')?.textContent, getFieldRequirement('DeclarationRequestNo'))}
                      required={getFieldRequirement('DeclarationRequestNo') === 'M'}
                      optional={getFieldRequirement('DeclarationRequestNo') === 'O'}
                      hasError={isRequiredFieldEmpty(xmlData.querySelector('DeclarationRequestNo')?.textContent, getFieldRequirement('DeclarationRequestNo'))}
                    />
                  )}
                  {shouldShowField('Affidavit') && (
                    <Field 
                      label="Declaración Jurada" 
                      value={getFieldValue(xmlData.querySelector('Affidavit')?.textContent, getFieldRequirement('Affidavit'))}
                      required={getFieldRequirement('Affidavit') === 'M'}
                      optional={getFieldRequirement('Affidavit') === 'O'}
                      hasError={isRequiredFieldEmpty(xmlData.querySelector('Affidavit')?.textContent, getFieldRequirement('Affidavit'))}
                    />
                  )}
                </Section>

              </Section>
            </Section>

            <Section title="Entidad de Certificación Emisora" level={1} className="col-span-full">
              {shouldShowField('EHId') && (
                <Field 
                  label="Código de EH" 
                  value={getFieldValue(eh?.querySelector('EHId')?.textContent, getFieldRequirement('EHId'))}
                  required={getFieldRequirement('EHId') === 'M'}
                  optional={getFieldRequirement('EHId') === 'O'}
                  hasError={isRequiredFieldEmpty(eh?.querySelector('EHId')?.textContent, getFieldRequirement('EHId'))}
                />
              )}
              {shouldShowField('EHCountry') && (
                <Field 
                  label="País" 
                  value={getFieldValue(eh?.querySelector('EHCountry')?.textContent, getFieldRequirement('EHCountry'))}
                  required={getFieldRequirement('EHCountry') === 'M'}
                  optional={getFieldRequirement('EHCountry') === 'O'}
                  hasError={isRequiredFieldEmpty(eh?.querySelector('EHCountry')?.textContent, getFieldRequirement('EHCountry'))}
                />
              )}
              {shouldShowField('EHName') && (
                <Field 
                  label="Nombre" 
                  value={getFieldValue(eh?.querySelector('EHName')?.textContent, getFieldRequirement('EHName'))}
                  required={getFieldRequirement('EHName') === 'M'}
                  optional={getFieldRequirement('EHName') === 'O'}
                  hasError={isRequiredFieldEmpty(eh?.querySelector('EHName')?.textContent, getFieldRequirement('EHName'))}
                />
              )}
              {shouldShowField('EHAddress') && (
                <Field 
                  label="Domicilio" 
                  value={getFieldValue(eh?.querySelector('EHAddress')?.textContent, getFieldRequirement('EHAddress'))}
                  required={getFieldRequirement('EHAddress') === 'M'}
                  optional={getFieldRequirement('EHAddress') === 'O'}
                  hasError={isRequiredFieldEmpty(eh?.querySelector('EHAddress')?.textContent, getFieldRequirement('EHAddress'))}
                />
              )}
              
              {(() => {
                const ehCityResult = getEHCityFieldWithSpecPriority(eh);
                if (ehCityResult.requirement === 'NC') return null;
                
                return (
                  <Field
                    label="Ciudad" 
                    value={getFieldValue(ehCityResult.value, ehCityResult.requirement)}
                    required={ehCityResult.requirement === 'M'}
                    optional={ehCityResult.requirement === 'O'}
                    hasError={isRequiredFieldEmpty(ehCityResult.value, ehCityResult.requirement)}
                  />
                );
              })()}
              
              {shouldShowField('EHTelephone') && (
                <Field 
                  label="Teléfono" 
                  value={getFieldValue(eh?.querySelector('EHTelephone')?.textContent, getFieldRequirement('EHTelephone'))}
                  required={getFieldRequirement('EHTelephone') === 'M'}
                  optional={getFieldRequirement('EHTelephone') === 'O'}
                  hasError={isRequiredFieldEmpty(eh?.querySelector('EHTelephone')?.textContent, getFieldRequirement('EHTelephone'))}
                />
              )}
              {shouldShowField('EHFax') && (
                <Field 
                  label="Fax" 
                  value={getFieldValue(eh?.querySelector('EHFax')?.textContent, getFieldRequirement('EHFax'))}
                  required={getFieldRequirement('EHFax') === 'M'}
                  optional={getFieldRequirement('EHFax') === 'O'}
                  hasError={isRequiredFieldEmpty(eh?.querySelector('EHFax')?.textContent, getFieldRequirement('EHFax'))}
                />
              )}
              {shouldShowField('EHEmail') && (
                <Field 
                  label="Email" 
                  value={getFieldValue(eh?.querySelector('EHEmail')?.textContent, getFieldRequirement('EHEmail'))}
                  required={getFieldRequirement('EHEmail') === 'M'}
                  optional={getFieldRequirement('EHEmail') === 'O'}
                  hasError={isRequiredFieldEmpty(eh?.querySelector('EHEmail')?.textContent, getFieldRequirement('EHEmail'))}
                />
              )}
              {shouldShowField('EHURL') && (
                <Field 
                  label="Website" 
                  value={getFieldValue(eh?.querySelector('EHURL')?.textContent, getFieldRequirement('EHURL'))}
                  required={getFieldRequirement('EHURL') === 'M'}
                  optional={getFieldRequirement('EHURL') === 'O'}
                  hasError={isRequiredFieldEmpty(eh?.querySelector('EHURL')?.textContent, getFieldRequirement('EHURL'))}
                />
              )}
            </Section>

            <Section title="Certificación de Origen" level={1} className="col-span-full">
              {shouldShowField('CertificateControlCode') && (
                <Field 
                  label="Código de Control" 
                  value={getFieldValue(certificationEH?.querySelector('CertificateControlCode')?.textContent, getFieldRequirement('CertificateControlCode'))}
                  required={getFieldRequirement('CertificateControlCode') === 'M'}
                  optional={getFieldRequirement('CertificateControlCode') === 'O'}
                  hasError={isRequiredFieldEmpty(certificationEH?.querySelector('CertificateControlCode')?.textContent, getFieldRequirement('CertificateControlCode'))}
                />
              )}
              {shouldShowField('CertificateDate') && (
                <Field 
                  label="Fecha de Certificación" 
                  value={(() => {
                    const dateValue = certificationEH?.querySelector('CertificateDate')?.textContent;
                    const requirement = getFieldRequirement('CertificateDate');
                    if (dateValue) {
                      return new Date(dateValue).toLocaleDateString();
                    }
                    return getFieldValue(dateValue, requirement);
                  })()}
                  required={getFieldRequirement('CertificateDate') === 'M'}
                  optional={getFieldRequirement('CertificateDate') === 'O'}
                  hasError={isRequiredFieldEmpty(certificationEH?.querySelector('CertificateDate')?.textContent, getFieldRequirement('CertificateDate'))}
                />
              )}
              {shouldShowField('CertificateID') && (
                <Field 
                  label="Número de Certificado" 
                  value={getFieldValue(certificationEH?.querySelector('CertificateID')?.textContent, getFieldRequirement('CertificateID'))}
                  required={getFieldRequirement('CertificateID') === 'M'}
                  optional={getFieldRequirement('CertificateID') === 'O'}
                  hasError={isRequiredFieldEmpty(certificationEH?.querySelector('CertificateID')?.textContent, getFieldRequirement('CertificateID'))}
                />
              )}
            </Section>

          </Section>
        </div>
      </CardContent>
    </Card>
  );
};

export default CODViewer;