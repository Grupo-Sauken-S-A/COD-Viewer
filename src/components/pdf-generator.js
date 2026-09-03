import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getCountryName } from './country-codes';
import { XML_SPECIFICATIONS } from './xml-specifications.js';
import {
  AGREEMENT_MAPPING,
  getFieldRequirement as getFieldRequirementSpec,
  getElementWithSpecPriority,
  getGoodsItemNameField,
  getUnexpectedElements,
  getValueFieldWithSpecPriority as getValueFieldWithSpecPrioritySpec,
  getOperatorContent as getOperatorContentSpec
} from '@/lib/cod-spec';
import { verifySignatureForElement, getSignatureStatusDisplay } from './signature-utils';
import { APP_NAME, APP_VERSION } from '@/lib/app-version';

// Configuración de colores y estilos
const COLORS = {
  primary: '#1f2937',      // gray-800
  secondary: '#374151',    // gray-700
  accent: '#3b82f6',       // blue-500
  success: '#10b981',      // emerald-500
  warning: '#f59e0b',      // amber-500
  error: '#ef4444',        // red-500
  muted: '#6b7280',        // gray-500
  light: '#f9fafb',        // gray-50
  border: '#e5e7eb',       // gray-200
  white: '#ffffff',
  required: '#fef3c7',     // amber-100 - para campos requeridos
  optional: '#f3f4f6',     // gray-100 - para campos opcionales
  missing: '#fee2e2'       // red-100 - para campos requeridos faltantes
};

const FONTS = {
  mainTitle: { size: 16, weight: 'bold' },      
  sectionTitle: { size: 12, weight: 'bold' },   
  subsectionTitle: { size: 11, weight: 'bold' }, 
  heading: { size: 10, weight: 'bold' },        
  body: { size: 8, weight: 'normal' },          
  small: { size: 7, weight: 'normal' },         
  caption: { size: 6, weight: 'normal' },       
  signatureText: { size: 9, weight: 'normal' }  
};

// Función auxiliar para obtener contenido de operadores (actualizada)
const getOperatorContent = (xmlData, fieldName, xmlSpecifications, currentVersion, currentAgreement) => {
  return getOperatorContentSpec(xmlSpecifications, currentVersion, currentAgreement, xmlData, fieldName);
};

// Función auxiliar para obtener elementos con alternativas (actualizada)
const getElementWithAlternatives = (xmlData, primaryElement, alternativeElements = [], xmlSpecifications, currentVersion, currentAgreement) => {
  return getElementWithSpecPriority(xmlSpecifications, currentVersion, currentAgreement, xmlData, primaryElement, alternativeElements);
};

// Nueva función para obtener el campo de valor con prioridad de especificación
const getValueFieldWithSpecPriority = (good, xmlSpecifications, currentVersion, currentAgreement) => {
  return getValueFieldWithSpecPrioritySpec(xmlSpecifications, currentVersion, currentAgreement, good);
};

// Función para formatear fechas
const formatDate = (dateString) => {
  if (!dateString) return 'No especificada';
  try {
    return new Date(dateString).toLocaleDateString('es-ES');
  } catch {
    return dateString;
  }
};

// Función para procesar valores de campo (actualizada)
const processFieldValue = (value, label, requirement) => {
  const isEmpty = !value || value.trim() === '';
  
  if (isEmpty && requirement === 'M') {
    return 'No informado';
  }
  
  if (!value) return 'No especificado';
  
  // Conversión de códigos de país
  if (label?.toLowerCase().includes('country') || 
      label?.toLowerCase().includes('país') ||
      label?.toLowerCase().includes('pais')) {
    return getCountryName(value);
  }
  
  return value;
};

// Función para verificar si un campo requerido está vacío
const isRequiredFieldEmpty = (value, requirement) => {
  return requirement === 'M' && (!value || value.trim() === '');
};

// Función para convertir color hex a RGB
const hexToRgb = (hex) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 0, g: 0, b: 0 };
};

class PDFGenerator {
  constructor(xmlData, options = {}) {
    this.doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
    this.pageWidth = 210;
    this.pageHeight = 297;
    this.margin = 10;
    this.contentWidth = this.pageWidth - (this.margin * 2);
    this.currentY = this.margin;
    this.lineHeight = 4;

    // Inicializar especificaciones y estado
    this.xmlSpecifications = XML_SPECIFICATIONS;
    this.currentVersion = xmlData.querySelector('CODVer')?.textContent?.trim();
    this.originalAgreement = xmlData.querySelector('AgreementAcronym')?.textContent?.trim();
    this.currentAgreement = this.originalAgreement;
    this.inputWarnings = options.inputWarnings || [];
    this.emissionStage = options.emissionStage || null;

    // Configurar propiedades del documento
    this.doc.setProperties({
      title: 'Certificado de Origen Digital - COD - ALADI',
      subject: 'Certificado de Origen Digital',
      author: 'Grupo Sauken S.A. - ARGENTINA',
      creator: 'Visualizador COD',
      producer: 'jsPDF',
      keywords: `${APP_NAME} v${APP_VERSION}`
    });
  }

  // Función para obtener requerimiento de campo
  getFieldRequirement(elementName) {
    return getFieldRequirementSpec(this.xmlSpecifications, this.currentVersion, this.currentAgreement, elementName);
  }

  // Función para verificar si debe mostrar un campo
  shouldShowField(elementName) {
    const requirement = this.getFieldRequirement(elementName);
    return requirement !== 'NC';
  }

  // Verificar si necesitamos nueva página
  checkPageBreak(neededHeight = 20) {
    const maxContentY = this.pageHeight - 20;
    
    if (this.currentY + neededHeight > maxContentY) {
      this.addPage();
      return true;
    }
    return false;
  }

  // Agregar nueva página
  addPage() {
    this.doc.addPage();
    this.currentY = this.margin;
  }

  // Agregar encabezado del documento
  addHeader() {
    const accentRgb = hexToRgb(COLORS.accent);
    this.doc.setFillColor(accentRgb.r, accentRgb.g, accentRgb.b);
    this.doc.rect(this.margin, this.margin, this.contentWidth, 15, 'F');
    
    this.doc.setTextColor(255, 255, 255);
    this.doc.setFontSize(FONTS.mainTitle.size);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text('CERTIFICADO DE ORIGEN DIGITAL - COD - ALADI', this.pageWidth / 2, this.margin + 10, { align: 'center' });
    
    // Agregar información de versión y acuerdo
    if (this.currentVersion && this.originalAgreement) {
      this.doc.setFontSize(FONTS.small.size);
      this.doc.setFont('helvetica', 'normal');
      let versionText = `Versión ${this.currentVersion} - Acuerdo ${this.originalAgreement}`;
      if (AGREEMENT_MAPPING[this.originalAgreement] && AGREEMENT_MAPPING[this.originalAgreement] !== this.originalAgreement) {
        versionText += ` - Usa formulario Form${AGREEMENT_MAPPING[this.originalAgreement]}`;
      }
      this.doc.text(versionText, this.pageWidth / 2, this.margin + 13, { align: 'center' });
    }
    
    this.currentY = this.margin + 20;
    const primaryRgb = hexToRgb(COLORS.primary);
    this.doc.setTextColor(primaryRgb.r, primaryRgb.g, primaryRgb.b);
  }

  // Agregar pie de página
  addFooter() {
    const footerY = this.pageHeight - 15;
    
    const borderRgb = hexToRgb(COLORS.border);
    this.doc.setDrawColor(borderRgb.r, borderRgb.g, borderRgb.b);
    this.doc.line(this.margin, footerY, this.pageWidth - this.margin, footerY);
    
    const mutedRgb = hexToRgb(COLORS.muted);
    this.doc.setTextColor(mutedRgb.r, mutedRgb.g, mutedRgb.b);
    this.doc.setFontSize(FONTS.caption.size);
    this.doc.setFont('helvetica', 'normal');
    
    const currentDate = new Date().toLocaleDateString('es-ES');
    const time = new Date().toLocaleTimeString('es-ES');
    
    this.doc.text(`Generado el ${currentDate} a las ${time}`, this.margin, footerY + 5);
    this.doc.text(`Página ${this.doc.internal.getCurrentPageInfo().pageNumber}`, this.pageWidth - this.margin, footerY + 5, { align: 'right' });
    this.doc.text(`Desarrollado por Sauken para Certificados de Origen · ${APP_NAME} v${APP_VERSION}`, this.pageWidth / 2, footerY + 8, { align: 'center' });
  }

  // Agregar sección con título mejorado
  addSection(title, level = 0, count = null) {
    let spacing = 0;
    
    if (level === 0) spacing = 6;      
    else if (level === 1) spacing = 4; 
    else if (level === 2) spacing = 3; 
    else spacing = 2;                  
    
    const fontSize = level === 0 ? FONTS.sectionTitle.size : 
                    level === 1 ? FONTS.subsectionTitle.size : 
                    level === 2 ? FONTS.heading.size :
                    FONTS.body.size;
    
    const totalHeight = spacing + fontSize + 6;
    
    this.checkPageBreak(totalHeight + 10);
    
    this.currentY += spacing;
    
    const indent = level * 5;
    
    // Fondo de la sección
    if (level === 0) {
      this.doc.setFillColor(229, 231, 235);
      this.doc.rect(this.margin + indent, this.currentY - 2, this.contentWidth - indent, fontSize + 4, 'F');
    } else if (level === 1) {
      this.doc.setFillColor(219, 234, 254);
      this.doc.rect(this.margin + indent, this.currentY - 2, this.contentWidth - indent, fontSize + 4, 'F');
      this.doc.setFillColor(147, 197, 253);
      this.doc.rect(this.margin + indent, this.currentY - 2, this.contentWidth - indent, 1, 'F');
    } else if (level === 2) {
      this.doc.setFillColor(220, 252, 231);
      this.doc.rect(this.margin + indent, this.currentY - 2, this.contentWidth - indent, fontSize + 4, 'F');
      this.doc.setFillColor(134, 239, 172);
      this.doc.rect(this.margin + indent, this.currentY - 2, this.contentWidth - indent, 1, 'F');
    } else {
      this.doc.setFillColor(243, 244, 246);
      this.doc.rect(this.margin + indent, this.currentY - 2, this.contentWidth - indent, fontSize + 4, 'F');
      this.doc.setFillColor(209, 213, 219);
      this.doc.rect(this.margin + indent, this.currentY - 2, this.contentWidth - indent, 1, 'F');
    }
    
    // Título de la sección
    if (level === 0) {
      const accentRgb = hexToRgb(COLORS.accent);
      this.doc.setTextColor(accentRgb.r, accentRgb.g, accentRgb.b);
    } else {
      const primaryRgb = hexToRgb(COLORS.primary);
      this.doc.setTextColor(primaryRgb.r, primaryRgb.g, primaryRgb.b);
    }
    
    this.doc.setFontSize(fontSize);
    this.doc.setFont('helvetica', 'bold');
    
    let titleText = title;
    if (count !== null && count > 0) {
      titleText += ` (${count} item${count !== 1 ? 's' : ''})`;
    }
    
    this.doc.text(titleText, this.margin + indent + 2, this.currentY + fontSize / 2 + 1);
    this.currentY += fontSize + 4;
    
    return this.currentY;
  }

  // Agregar campo individual (actualizado con validaciones)
  addField(label, rawValue, elementName, indent = 0) {
    const requirement = this.getFieldRequirement(elementName);
    
    // Si el campo no debe mostrarse, salir
    if (requirement === 'NC') {
      return;
    }

    const processedValue = processFieldValue(rawValue, label, requirement);
    const fieldIndent = this.margin + indent;
    const hasError = isRequiredFieldEmpty(rawValue, requirement);
    
    // Verificar espacio necesario
    const textLines = this.doc.splitTextToSize(processedValue, this.contentWidth - indent - 50);
    const neededHeight = Math.max(6, textLines.length * 4 + 2);
    
    this.checkPageBreak(neededHeight + 5);
    
    // Fondo del campo según el tipo y estado
    if (hasError) {
      // Campo requerido faltante - rojo claro
      const missingRgb = hexToRgb(COLORS.missing);
      this.doc.setFillColor(missingRgb.r, missingRgb.g, missingRgb.b);
    } else if (requirement === 'M') {
      // Campo requerido - amarillo claro
      const requiredRgb = hexToRgb(COLORS.required);
      this.doc.setFillColor(requiredRgb.r, requiredRgb.g, requiredRgb.b);
    } else {
      // Campo opcional - gris claro
      const optionalRgb = hexToRgb(COLORS.optional);
      this.doc.setFillColor(optionalRgb.r, optionalRgb.g, optionalRgb.b);
    }
    
    this.doc.rect(fieldIndent, this.currentY, this.contentWidth - indent, neededHeight, 'F');
    
    // Borde izquierdo según el estado
    if (hasError) {
      const errorRgb = hexToRgb(COLORS.error);
      this.doc.setDrawColor(errorRgb.r, errorRgb.g, errorRgb.b);
    } else if (requirement === 'M') {
      const warningRgb = hexToRgb(COLORS.warning);
      this.doc.setDrawColor(warningRgb.r, warningRgb.g, warningRgb.b);
    } else {
      const borderRgb = hexToRgb(COLORS.border);
      this.doc.setDrawColor(borderRgb.r, borderRgb.g, borderRgb.b);
    }
    this.doc.setLineWidth(1);
    this.doc.line(fieldIndent, this.currentY, fieldIndent, this.currentY + neededHeight);
    
    // Etiqueta del campo con indicador de tipo
    const secondaryRgb = hexToRgb(COLORS.secondary);
    this.doc.setTextColor(secondaryRgb.r, secondaryRgb.g, secondaryRgb.b);
    this.doc.setFontSize(FONTS.small.size);
    this.doc.setFont('helvetica', 'bold');
    
    let labelWithIndicator = label;
    if (requirement === 'M') {
      labelWithIndicator += ' *';
    }
    
    this.doc.text(labelWithIndicator, fieldIndent + 2, this.currentY + 3);
    
    // Valor del campo
    if (hasError) {
      const errorRgb = hexToRgb(COLORS.error);
      this.doc.setTextColor(errorRgb.r, errorRgb.g, errorRgb.b);
    } else {
      const primaryRgb = hexToRgb(COLORS.primary);
      this.doc.setTextColor(primaryRgb.r, primaryRgb.g, primaryRgb.b);
    }
    
    this.doc.setFontSize(FONTS.body.size);
    this.doc.setFont('helvetica', 'normal');
    this.doc.text(textLines, fieldIndent + 2, this.currentY + 6);
    
    this.currentY += neededHeight + 2;
  }

  // Agregar múltiples campos en una sola línea (actualizado)
  addMultiField(fields, indent = 0) {
    // Filtrar campos que deben mostrarse
    const visibleFields = fields.filter(field => {
      if (!field.elementName) return true; // Si no tiene elementName, mostrar por defecto
      return this.shouldShowField(field.elementName);
    });

    if (visibleFields.length === 0) return;

    const fieldIndent = this.margin + indent;
    const columnWidth = (this.contentWidth - indent) / visibleFields.length;
    
    // Calcular altura necesaria para todos los campos
    let maxHeight = 6;
    visibleFields.forEach(field => {
      const requirement = field.elementName ? this.getFieldRequirement(field.elementName) : 'O';
      const processedValue = processFieldValue(field.value, field.label, requirement);
      const textLines = this.doc.splitTextToSize(processedValue, columnWidth - 10);
      const fieldHeight = Math.max(6, textLines.length * 4 + 2);
      if (fieldHeight > maxHeight) maxHeight = fieldHeight;
    });
    
    this.checkPageBreak(maxHeight + 5);
    
    // Dibujar fondo y campos
    visibleFields.forEach((field, index) => {
      const xPos = fieldIndent + (index * columnWidth);
      const requirement = field.elementName ? this.getFieldRequirement(field.elementName) : 'O';
      const processedValue = processFieldValue(field.value, field.label, requirement);
      const hasError = field.elementName ? isRequiredFieldEmpty(field.value, requirement) : false;
      
      // Fondo del campo
      if (hasError) {
        const missingRgb = hexToRgb(COLORS.missing);
        this.doc.setFillColor(missingRgb.r, missingRgb.g, missingRgb.b);
      } else if (requirement === 'M') {
        const requiredRgb = hexToRgb(COLORS.required);
        this.doc.setFillColor(requiredRgb.r, requiredRgb.g, requiredRgb.b);
      } else {
        const optionalRgb = hexToRgb(COLORS.optional);
        this.doc.setFillColor(optionalRgb.r, optionalRgb.g, optionalRgb.b);
      }
      
      this.doc.rect(xPos, this.currentY, columnWidth - 1, maxHeight, 'F');
      
      // Borde izquierdo
      if (hasError) {
        const errorRgb = hexToRgb(COLORS.error);
        this.doc.setDrawColor(errorRgb.r, errorRgb.g, errorRgb.b);
      } else if (requirement === 'M') {
        const warningRgb = hexToRgb(COLORS.warning);
        this.doc.setDrawColor(warningRgb.r, warningRgb.g, warningRgb.b);
      } else {
        const borderRgb = hexToRgb(COLORS.border);
        this.doc.setDrawColor(borderRgb.r, borderRgb.g, borderRgb.b);
      }
      this.doc.setLineWidth(1);
      this.doc.line(xPos, this.currentY, xPos, this.currentY + maxHeight);
      
      // Etiqueta
      const secondaryRgb = hexToRgb(COLORS.secondary);
      this.doc.setTextColor(secondaryRgb.r, secondaryRgb.g, secondaryRgb.b);
      this.doc.setFontSize(FONTS.small.size);
      this.doc.setFont('helvetica', 'bold');
      
      let labelWithIndicator = field.label;
      if (requirement === 'M') {
        labelWithIndicator += ' *';
      }
      
      this.doc.text(labelWithIndicator, xPos + 2, this.currentY + 3);
      
      // Valor
      if (hasError) {
        const errorRgb = hexToRgb(COLORS.error);
        this.doc.setTextColor(errorRgb.r, errorRgb.g, errorRgb.b);
      } else {
        const primaryRgb = hexToRgb(COLORS.primary);
        this.doc.setTextColor(primaryRgb.r, primaryRgb.g, primaryRgb.b);
      }
      
      this.doc.setFontSize(FONTS.body.size);
      this.doc.setFont('helvetica', 'normal');
      const textLines = this.doc.splitTextToSize(processedValue, columnWidth - 10);
      this.doc.text(textLines, xPos + 2, this.currentY + 6);
    });
    
    this.currentY += maxHeight + 2;
  }

  // Agregar sección de lista con encabezado especial (actualizado)
  addListSection(title, items, itemRenderer, level = 3) {
    if (items.length === 0) return;
    
    this.addSection(title, level, items.length);
    
    items.forEach((item, index) => {
      this.checkPageBreak(30);
      
      // Encabezado del item
      this.doc.setFillColor(219, 234, 254);
      this.doc.rect(this.margin + 15, this.currentY, this.contentWidth - 15, 6, 'F');
      const accentRgb = hexToRgb(COLORS.accent);
      this.doc.setDrawColor(accentRgb.r, accentRgb.g, accentRgb.b);
      this.doc.setLineWidth(1);
      this.doc.line(this.margin + 15, this.currentY, this.margin + 15, this.currentY + 6);
      
      this.doc.setTextColor(accentRgb.r, accentRgb.g, accentRgb.b);
      this.doc.setFontSize(FONTS.body.size);
      this.doc.setFont('helvetica', 'bold');
      
      const prefix = title.includes('Factura') ? 'Factura' : 'Mercadería';
      this.doc.text(`${prefix} ${index + 1}`, this.margin + 17, this.currentY + 4);
      this.currentY += 8;
      
      itemRenderer(item, index);
    });
  }

  // Renderizador para facturas (actualizado)
  renderInvoice(invoice, index) {
    const fields = [];
    
    if (this.shouldShowField('InvoiceOrderNo')) {
      fields.push({
        label: 'Orden',
        value: invoice.querySelector('InvoiceOrderNo')?.textContent,
        elementName: 'InvoiceOrderNo'
      });
    }
    
    if (this.shouldShowField('InvoiceNo')) {
      fields.push({
        label: 'Número',
        value: invoice.querySelector('InvoiceNo')?.textContent,
        elementName: 'InvoiceNo'
      });
    }
    
    if (this.shouldShowField('InvoiceDate')) {
      fields.push({
        label: 'Fecha',
        value: formatDate(invoice.querySelector('InvoiceDate')?.textContent),
        elementName: 'InvoiceDate'
      });
    }
    
    if (fields.length > 0) {
      this.addMultiField(fields, 20);
    }
  }

  // Renderizador para mercaderías (actualizado)
  renderGoods(good, index) {
    // Orden y Posición Arancelaria en una línea
    const orderAndCodeFields = [];
    
    if (this.shouldShowField('GoodsOrderNo')) {
      orderAndCodeFields.push({
        label: 'Orden',
        value: good.querySelector('GoodsOrderNo')?.textContent,
        elementName: 'GoodsOrderNo'
      });
    }
    
    if (this.shouldShowField('GoodsItemCode')) {
      orderAndCodeFields.push({
        label: 'Posición Arancelaria',
        value: good.querySelector('GoodsItemCode')?.textContent,
        elementName: 'GoodsItemCode'
      });
    }
    
    if (orderAndCodeFields.length > 0) {
      this.addMultiField(orderAndCodeFields, 20);
    }
    
    // Descripción
    const nameResult = getGoodsItemNameField(this.xmlSpecifications, this.currentVersion, this.currentAgreement, good);
    if (nameResult.requirement !== 'NC') {
      this.addField('Descripción', nameResult.value, nameResult.foundElement, 20);
    }
    
    // Cantidad, Unidad y Valor en una línea
    const quantityFields = [];
    
    if (this.shouldShowField('GoodsItemWeightAmount')) {
      quantityFields.push({
        label: 'Cantidad o Peso',
        value: good.querySelector('GoodsItemWeightAmount')?.textContent,
        elementName: 'GoodsItemWeightAmount'
      });
    }
    
    if (this.shouldShowField('GoodsItemMeasureUnit')) {
      quantityFields.push({
        label: 'Unidad de Medida',
        value: good.querySelector('GoodsItemMeasureUnit')?.textContent,
        elementName: 'GoodsItemMeasureUnit'
      });
    }
    
    // Manejar el campo de valor con prioridad de especificación
    const valueField = getValueFieldWithSpecPriority(good, this.xmlSpecifications, this.currentVersion, this.currentAgreement);
    if (valueField.requirement !== 'NC') {
      quantityFields.push({
        label: 'Importe',
        value: valueField.value,
        elementName: valueField.foundElement
      });
    }
    
    if (quantityFields.length > 0) {
      this.addMultiField(quantityFields, 20);
    }
    
    // Norma de Origen
    if (this.shouldShowField('GoodsItemOriginRules')) {
      this.addField('Norma de Origen', good.querySelector('GoodsItemOriginRules')?.textContent, 'GoodsItemOriginRules', 20);
    }
    
    // Fecha y Número de DJO en una línea
    const djoFields = [];
    
    if (this.shouldShowField('GoodsDeclarationDate')) {
      djoFields.push({
        label: 'Fecha de DJO',
        value: formatDate(good.querySelector('GoodsDeclarationDate')?.textContent),
        elementName: 'GoodsDeclarationDate'
      });
    }
    
    if (this.shouldShowField('GoodsDeclarationNumber')) {
      djoFields.push({
        label: 'Número de DJO',
        value: good.querySelector('GoodsDeclarationNumber')?.textContent,
        elementName: 'GoodsDeclarationNumber'
      });
    }
    
    if (djoFields.length > 0) {
      this.addMultiField(djoFields, 20);
    }
  }

  // Función para verificar si debe mostrar la sección de facturas
  shouldShowInvoiceSection(xmlData) {
    const hasInvoiceElements = xmlData && xmlData.querySelectorAll('Invoice').length > 0;
    const invoiceFields = ['InvoiceQty', 'InvoiceOrderNo', 'InvoiceNo', 'InvoiceDate'];
    const hasRelevantInvoiceFields = invoiceFields.some(field => this.shouldShowField(field));
    
    return hasInvoiceElements || hasRelevantInvoiceFields;
  }

  // Función para verificar si debe mostrar la sección de mercaderías
  shouldShowGoodsSection(xmlData) {
    const hasGoodsElements = xmlData && xmlData.querySelectorAll('Goods').length > 0;
    const goodsFields = ['GoodsQty', 'GoodsOrderNo', 'GoodsItemCode', 'GoodsItemName', 'GoodsDescription',
                         'GoodsItemWeightAmount', 'GoodsItemMeasureUnit', 'GoodsItemValue',
                         'GoodsItemFOB', 'GoodsItemOriginRules', 'GoodsDeclarationDate',
                         'GoodsDeclarationNumber'];
    const hasRelevantGoodsFields = goodsFields.some(field => this.shouldShowField(field));
    
    return hasGoodsElements || hasRelevantGoodsFields;
  }

  // Función para verificar si debe mostrar la sección de tercer operador
  shouldShowThirdOperatorSection(xmlData) {
    const allOperatorFields = [
      'ThirdOpCountry', 'ThirdOpBusinessName', 'ThirdOpAddress', 'ThirdOpCity', 'ThirdOpInvoiceNo', 'ThirdOpInvoiceDate', 'ThirdOpStatement',
      'Op3cCountry', 'Op3cBusinessName', 'Op3cAddress', 'Op3cInvoiceNo', 'Op3cInvoiceDate', 'Op3cStatement'
    ];
    
    return allOperatorFields.some(fieldName => {
      const requirement = this.getFieldRequirement(fieldName);
      return requirement !== 'NC';
    });
  }

  // Función para verificar alternativas
  shouldShowAnyAlternative(elementNames) {
    return elementNames.some(elementName => {
      const requirement = this.getFieldRequirement(elementName);
      return requirement !== 'NC';
    });
  }

  // Renderizar campo de tercer operador
  renderThirdOperatorField(xmlData, fieldName, label) {
    const result = getOperatorContent(xmlData, fieldName, this.xmlSpecifications, this.currentVersion, this.currentAgreement);
    
    if (result.requirement === 'NC') {
      return;
    }

    this.addField(label, result.value, result.foundElement, 20);
  }

  // Agregar estado de firmas mejorado — reutiliza la misma lógica que la vista web
  async addSignatureStatus(xmlDoc) {
    this.addSection('Estado de Firmas Digitales', 0);

    const signatures = [
      { element: 'COD', name: 'Exportador (EXP)' },
      { element: 'CODEH', name: 'Funcionario Habilitado (FH)' }
    ];

    for (const sig of signatures) {
      const signatureStatus = await verifySignatureForElement(xmlDoc, sig.element);
      const displayInfo = getSignatureStatusDisplay(signatureStatus);

      const availableWidth = this.contentWidth - 10;
      // El ancho de línea que calcula splitTextToSize depende de la fuente/tamaño activos
      // en el momento de la llamada: hay que fijarlos ANTES de medir, no solo antes de dibujar,
      // o la primera firma del bucle hereda el tamaño de la sección anterior y ajusta mal.
      this.doc.setFont('helvetica', 'normal');
      this.doc.setFontSize(FONTS.small.size);
      const textLines = this.doc.splitTextToSize(displayInfo.text, availableWidth);
      const neededHeight = Math.max(12, (textLines.length + 1) * 3 + 6);

      this.checkPageBreak(neededHeight + 2);

      const fillBySeverity = { ok: [219, 234, 254], warning: [254, 243, 199], error: [254, 226, 226] };
      const [r, g, b] = fillBySeverity[displayInfo.severity] || fillBySeverity.ok;
      this.doc.setFillColor(r, g, b);
      this.doc.rect(this.margin + 5, this.currentY, this.contentWidth - 5, neededHeight, 'F');

      if (displayInfo.severity === 'error') {
        const errorRgb = hexToRgb(COLORS.error);
        this.doc.setTextColor(errorRgb.r, errorRgb.g, errorRgb.b);
      } else if (displayInfo.severity === 'warning') {
        const warningRgb = hexToRgb(COLORS.warning);
        this.doc.setTextColor(warningRgb.r, warningRgb.g, warningRgb.b);
      } else {
        const accentRgb = hexToRgb(COLORS.accent);
        this.doc.setTextColor(accentRgb.r, accentRgb.g, accentRgb.b);
      }

      this.doc.setFontSize(FONTS.signatureText.size);
      this.doc.setFont('helvetica', 'bold');
      this.doc.text(sig.name, this.margin + 7, this.currentY + 4);

      const primaryRgb = hexToRgb(COLORS.primary);
      this.doc.setTextColor(primaryRgb.r, primaryRgb.g, primaryRgb.b);
      this.doc.setFont('helvetica', 'normal');
      this.doc.setFontSize(FONTS.small.size);

      let currentLineY = this.currentY + 7;
      textLines.forEach(line => {
        const boldIndex = line.indexOf('S-FiDE');
        if (boldIndex === -1) {
          this.doc.text(line, this.margin + 7, currentLineY);
        } else {
          const before = line.slice(0, boldIndex);
          const after = line.slice(boldIndex + 'S-FiDE'.length);
          let x = this.margin + 7;
          this.doc.setFont('helvetica', 'normal');
          if (before) {
            this.doc.text(before, x, currentLineY);
            x += this.doc.getTextWidth(before);
          }
          this.doc.setFont('helvetica', 'bold');
          this.doc.text('S-FiDE', x, currentLineY);
          x += this.doc.getTextWidth('S-FiDE');
          this.doc.setFont('helvetica', 'normal');
          if (after) {
            this.doc.text(after, x, currentLineY);
          }
        }
        currentLineY += 3;
      });
      this.doc.setFont('helvetica', 'normal');

      this.currentY += neededHeight + 2;
    }
  }

  // Elementos que no corresponden a este acuerdo/versión pero traen datos en el XML
  // Advertencias sobre el archivo XML (codificación, versión/acuerdo no reconocidos, estructura faltante)
  addInputValidationAlert() {
    if (!this.inputWarnings || this.inputWarnings.length === 0) {
      return;
    }

    this.addSection('Advertencias sobre el Archivo XML', 0);

    const availableWidth = this.contentWidth - 10;
    const itemLines = this.inputWarnings.flatMap((warning) => this.doc.splitTextToSize(`• ${warning}`, availableWidth));

    const neededHeight = Math.max(12, itemLines.length * 3 + 6);
    this.checkPageBreak(neededHeight + 2);

    this.doc.setFillColor(254, 243, 199);
    this.doc.rect(this.margin + 5, this.currentY, this.contentWidth - 5, neededHeight, 'F');

    const warningRgb = hexToRgb(COLORS.warning);
    this.doc.setTextColor(warningRgb.r, warningRgb.g, warningRgb.b);
    this.doc.setFontSize(FONTS.signatureText.size);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text('Advertencias sobre el archivo XML', this.margin + 7, this.currentY + 4);

    const primaryRgb = hexToRgb(COLORS.primary);
    this.doc.setTextColor(primaryRgb.r, primaryRgb.g, primaryRgb.b);
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(FONTS.small.size);

    let currentLineY = this.currentY + 7;
    itemLines.forEach(line => {
      this.doc.text(line, this.margin + 7, currentLineY);
      currentLineY += 3;
    });

    this.currentY += neededHeight + 2;
  }

  // Etapa de emisión del COD: alerta si no está completo (etapa 4) o si el orden de firmas es anómalo
  addEmissionStageAlert() {
    if (!this.emissionStage || this.emissionStage.stage === 4) {
      return;
    }

    const isAnomaly = this.emissionStage.stage === 'anomalo';
    this.addSection('Estado del COD', 0);

    const availableWidth = this.contentWidth - 10;
    const titleText = isAnomaly ? 'Orden de firmas inconsistente' : 'Este XML es un COD en proceso — no está completo';
    const bodyText = isAnomaly
      ? this.emissionStage.label
      : `Etapa detectada: ${this.emissionStage.label}. Este documento no constituye un Certificado de Origen Digital válido hasta que complete todas las etapas de su emisión.`;
    const bodyLines = this.doc.splitTextToSize(bodyText, availableWidth);

    const neededHeight = Math.max(14, (bodyLines.length + 1) * 3 + 8);
    this.checkPageBreak(neededHeight + 2);

    this.doc.setFillColor(254, 226, 226); // red-100
    this.doc.rect(this.margin + 5, this.currentY, this.contentWidth - 5, neededHeight, 'F');

    const errorRgb = hexToRgb(COLORS.error);
    this.doc.setTextColor(errorRgb.r, errorRgb.g, errorRgb.b);
    this.doc.setFontSize(FONTS.signatureText.size);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text(titleText, this.margin + 7, this.currentY + 4);

    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(FONTS.small.size);
    let currentLineY = this.currentY + 8;
    bodyLines.forEach(line => {
      this.doc.text(line, this.margin + 7, currentLineY);
      currentLineY += 3;
    });

    this.currentY += neededHeight + 2;
  }

  // Watermark diagonal en todas las páginas cuando el COD no está completo
  addIncompleteWatermark() {
    if (!this.emissionStage || this.emissionStage.stage === 4) {
      return;
    }

    const pageCount = this.doc.internal.getNumberOfPages();
    const errorRgb = hexToRgb(COLORS.error);

    for (let i = 1; i <= pageCount; i++) {
      this.doc.setPage(i);
      this.doc.saveGraphicsState();
      this.doc.setTextColor(errorRgb.r, errorRgb.g, errorRgb.b);
      this.doc.setFontSize(40);
      this.doc.setFont('helvetica', 'bold');
      if (this.doc.setGState && this.doc.GState) {
        this.doc.setGState(new this.doc.GState({ opacity: 0.18 }));
      }
      this.doc.text('EN PROCESO — NO VÁLIDO', this.pageWidth / 2, this.pageHeight / 2, {
        angle: 45,
        align: 'center'
      });
      this.doc.restoreGraphicsState();
    }
  }

  addUnexpectedElementsAlert(xmlData) {
    const unexpected = getUnexpectedElements(this.xmlSpecifications, this.currentVersion, this.currentAgreement, xmlData);
    if (unexpected.length === 0) {
      return;
    }

    this.addSection('Elementos con Datos Inesperados', 0);

    const availableWidth = this.contentWidth - 10;
    const introText = `Los siguientes campos tienen contenido en el XML pero, según las especificaciones ALADI, no corresponden para el Acuerdo ${this.originalAgreement} / versión ${this.currentVersion}. Puede tratarse de datos de otro formulario o de un error en la emisión del certificado.`;
    const introLines = this.doc.splitTextToSize(introText, availableWidth);
    const itemLines = unexpected.flatMap(({ tag, value }) => {
      const shortValue = value.length > 80 ? `${value.slice(0, 80)}…` : value;
      return this.doc.splitTextToSize(`<${tag}>  ${shortValue}`, availableWidth);
    });

    const totalLines = introLines.length + itemLines.length;
    const neededHeight = Math.max(12, totalLines * 3 + 6);

    this.checkPageBreak(neededHeight + 2);

    this.doc.setFillColor(254, 243, 199);
    this.doc.rect(this.margin + 5, this.currentY, this.contentWidth - 5, neededHeight, 'F');

    const warningRgb = hexToRgb(COLORS.warning);
    this.doc.setTextColor(warningRgb.r, warningRgb.g, warningRgb.b);
    this.doc.setFontSize(FONTS.signatureText.size);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text('Elementos con datos que no corresponden a este acuerdo/versión', this.margin + 7, this.currentY + 4);

    const primaryRgb = hexToRgb(COLORS.primary);
    this.doc.setTextColor(primaryRgb.r, primaryRgb.g, primaryRgb.b);
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(FONTS.small.size);

    let currentLineY = this.currentY + 7;
    introLines.forEach(line => {
      this.doc.text(line, this.margin + 7, currentLineY);
      currentLineY += 3;
    });
    itemLines.forEach(line => {
      this.doc.text(line, this.margin + 7, currentLineY);
      currentLineY += 3;
    });

    this.currentY += neededHeight + 2;
  }

  // Generar PDF completo (actualizado con todas las validaciones)
  async generatePDF(xmlData) {
    try {
      // Configuración inicial
      this.addHeader();

      // Advertencias sobre el archivo y estado del proceso de emisión
      this.addInputValidationAlert();
      this.addEmissionStageAlert();

      // Elementos con datos que no corresponden al acuerdo/versión
      this.addUnexpectedElementsAlert(xmlData);

      // Estado de firmas
      await this.addSignatureStatus(xmlData);
      
      // Estructura del certificado
      this.addSection('Estructura del Certificado de Origen', 0);
      this.addSection('Certificado de Origen Digital (CODEH)', 1);
      this.addSection('Certificado de Origen Digital (COD)', 2);
      
      // Información General
      if (this.shouldShowField('CODVer') || this.shouldShowField('CODSubmitterType')) {
        this.addSection('Información General', 3);
        
        const generalFields = [];
        
        if (this.shouldShowField('CODVer')) {
          generalFields.push({
            label: 'Versión',
            value: xmlData.querySelector('CODVer')?.textContent,
            elementName: 'CODVer'
          });
        }
        
        if (this.shouldShowField('CODSubmitterType')) {
          generalFields.push({
            label: 'Tipo de Remitente',
            value: xmlData.querySelector('CODSubmitterType')?.textContent,
            elementName: 'CODSubmitterType'
          });
        }
        
        this.addMultiField(generalFields, 15);
      }
      
      // Acuerdo Comercial
      if (this.shouldShowField('AgreementName') || this.shouldShowField('AgreementAcronym')) {
        this.addSection('Acuerdo Comercial', 3);
        
        const agreementFields = [];
        
        if (this.shouldShowField('AgreementName')) {
          agreementFields.push({
            label: 'Nombre',
            value: xmlData.querySelector('AgreementName')?.textContent,
            elementName: 'AgreementName'
          });
        }
        
        if (this.shouldShowField('AgreementAcronym')) {
          agreementFields.push({
            label: 'Acrónimo',
            value: xmlData.querySelector('AgreementAcronym')?.textContent,
            elementName: 'AgreementAcronym'
          });
        }
        
        this.addMultiField(agreementFields, 15);
      }
      
      // Exportador
      const exporterFields = ['ExporterCountry', 'ExporterBusinessName', 'ExporterAddress', 
                             'ExporterCity', 'ExporterTelephone', 'ExporterFax', 'ExporterEmail', 'ExporterURL'];
      
      if (exporterFields.some(field => this.shouldShowField(field))) {
        this.addSection('Datos del Exportador', 3);
        
        if (this.shouldShowField('ExporterCountry')) {
          this.addField('País', xmlData.querySelector('ExporterCountry')?.textContent, 'ExporterCountry', 15);
        }
        
        if (this.shouldShowField('ExporterBusinessName')) {
          this.addField('Razón Social', xmlData.querySelector('ExporterBusinessName')?.textContent, 'ExporterBusinessName', 15);
        }
        
        if (this.shouldShowField('ExporterAddress')) {
          this.addField('Domicilio', xmlData.querySelector('ExporterAddress')?.textContent, 'ExporterAddress', 15);
        }
        
        if (this.shouldShowField('ExporterCity')) {
          const cityResult = getElementWithAlternatives(xmlData, 'ExporterCity', ['ExporterLocality'], 
                                                       this.xmlSpecifications, this.currentVersion, this.currentAgreement);
          this.addField('Ciudad', cityResult.value, cityResult.foundElement || 'ExporterCity', 15);
        }
        
        // Teléfono, Email y Website en una línea
        const contactFields = [];
        
        if (this.shouldShowField('ExporterTelephone')) {
          contactFields.push({
            label: 'Teléfono',
            value: xmlData.querySelector('ExporterTelephone')?.textContent,
            elementName: 'ExporterTelephone'
          });
        }
        
        if (this.shouldShowField('ExporterEmail')) {
          contactFields.push({
            label: 'Email',
            value: xmlData.querySelector('ExporterEmail')?.textContent,
            elementName: 'ExporterEmail'
          });
        }
        
        if (this.shouldShowField('ExporterURL')) {
          contactFields.push({
            label: 'Website',
            value: xmlData.querySelector('ExporterURL')?.textContent,
            elementName: 'ExporterURL'
          });
        }
        
        if (contactFields.length > 0) {
          this.addMultiField(contactFields, 15);
        }
        
        // Fax del Exportador si existe
        if (this.shouldShowField('ExporterFax')) {
          this.addField('Fax', xmlData.querySelector('ExporterFax')?.textContent, 'ExporterFax', 15);
        }
      }
      
      // Suscriptor
      if (this.shouldShowField('SubscriberSubmitterName')) {
        this.addSection('Datos del Suscriptor', 3);
        this.addField('Nombre del Suscriptor', xmlData.querySelector('SubscriberSubmitterName')?.textContent, 'SubscriberSubmitterName', 15);
      }
      
      // Facturas usando validaciones
      if (this.shouldShowInvoiceSection(xmlData)) {
        const invoices = Array.from(xmlData.querySelectorAll('Invoice') || []);
        if (invoices.length > 0) {
          this.addListSection('Facturas Comerciales', invoices, (invoice, index) => {
            this.renderInvoice(invoice, index);
          });
        }
      }
      
      // Mercaderías usando validaciones
      if (this.shouldShowGoodsSection(xmlData)) {
        const goods = Array.from(xmlData.querySelectorAll('Goods') || []);
        if (goods.length > 0) {
          this.addListSection('Lista de Mercaderías', goods, (good, index) => {
            this.renderGoods(good, index);
          });
        }
      }
      
      // Importador
      const importerFields = ['ImporterCountry', 'ImporterBusinessName', 'ImporterAddress', 
                             'ImporterCity', 'ImporterTelephone', 'ImporterFax', 'ImporterEmail', 'ImporterURL'];
      
      if (importerFields.some(field => this.shouldShowField(field))) {
        this.addSection('Datos del Importador', 3);
        
        if (this.shouldShowField('ImporterCountry')) {
          this.addField('País', xmlData.querySelector('ImporterCountry')?.textContent, 'ImporterCountry', 15);
        }
        
        if (this.shouldShowField('ImporterBusinessName')) {
          this.addField('Razón Social', xmlData.querySelector('ImporterBusinessName')?.textContent, 'ImporterBusinessName', 15);
        }
        
        if (this.shouldShowField('ImporterAddress')) {
          this.addField('Domicilio', xmlData.querySelector('ImporterAddress')?.textContent, 'ImporterAddress', 15);
        }
        
        if (this.shouldShowField('ImporterCity')) {
          const cityResult = getElementWithAlternatives(xmlData, 'ImporterCity', ['ImporterLocality'], 
                                                       this.xmlSpecifications, this.currentVersion, this.currentAgreement);
          this.addField('Ciudad', cityResult.value, cityResult.foundElement || 'ImporterCity', 15);
        }
        
        // Campos adicionales del Importador
        if (this.shouldShowField('ImporterTelephone')) {
          this.addField('Teléfono', xmlData.querySelector('ImporterTelephone')?.textContent, 'ImporterTelephone', 15);
        }
        
        if (this.shouldShowField('ImporterFax')) {
          this.addField('Fax', xmlData.querySelector('ImporterFax')?.textContent, 'ImporterFax', 15);
        }
        
        if (this.shouldShowField('ImporterEmail')) {
          this.addField('Email', xmlData.querySelector('ImporterEmail')?.textContent, 'ImporterEmail', 15);
        }
        
        if (this.shouldShowField('ImporterURL')) {
          this.addField('Website', xmlData.querySelector('ImporterURL')?.textContent, 'ImporterURL', 15);
        }
      }
      
      // Consignatario
      const consigneeFields = ['ConsigneeCountry', 'ConsigneeBusinessName', 'ConsigneeAddress', 'ConsigneeCity'];
      
      if (this.shouldShowAnyAlternative(consigneeFields)) {
        this.addSection('Datos del Consignatario', 3);
        
        if (this.shouldShowField('ConsigneeCountry')) {
          this.addField('País', xmlData.querySelector('ConsigneeCountry')?.textContent, 'ConsigneeCountry', 15);
        }
        
        if (this.shouldShowField('ConsigneeBusinessName')) {
          this.addField('Razón Social', xmlData.querySelector('ConsigneeBusinessName')?.textContent, 'ConsigneeBusinessName', 15);
        }
        
        if (this.shouldShowField('ConsigneeAddress')) {
          this.addField('Domicilio', xmlData.querySelector('ConsigneeAddress')?.textContent, 'ConsigneeAddress', 15);
        }
        
        if (this.shouldShowField('ConsigneeCity')) {
          this.addField('Ciudad', xmlData.querySelector('ConsigneeCity')?.textContent, 'ConsigneeCity', 15);
        }
      }
      
      // Transporte
      const transportFields = ['TransportPortOfLoading', 'LoadingPortName', 'TransportMeans', 'TransportCountryDestination'];
      
      if (transportFields.some(field => this.shouldShowField(field))) {
        this.addSection('Datos del Transporte', 3);
        
        const transportFieldsArray = [];
        
        // Puerto de carga con alternativas
        const portResult = getElementWithAlternatives(xmlData, 'TransportPortOfLoading', ['LoadingPortName'], 
                                                     this.xmlSpecifications, this.currentVersion, this.currentAgreement);
        if (portResult.requirement !== 'NC') {
          transportFieldsArray.push({
            label: 'Puerto de Carga',
            value: portResult.value,
            elementName: portResult.foundElement
          });
        }
        
        if (this.shouldShowField('TransportMeans')) {
          transportFieldsArray.push({
            label: 'Medio',
            value: xmlData.querySelector('TransportMeans')?.textContent,
            elementName: 'TransportMeans'
          });
        }
        
        if (this.shouldShowField('TransportCountryDestination')) {
          transportFieldsArray.push({
            label: 'País Destino',
            value: xmlData.querySelector('TransportCountryDestination')?.textContent,
            elementName: 'TransportCountryDestination'
          });
        }
        
        if (transportFieldsArray.length > 0) {
          this.addMultiField(transportFieldsArray, 15);
        }
      }
      
      // Comentarios y Tercer Operador
      if (this.shouldShowField('GeneralComments') || this.shouldShowThirdOperatorSection(xmlData)) {
        this.addSection('Comentarios', 3);
        
        if (this.shouldShowField('GeneralComments')) {
          this.addField('Comentarios Generales', xmlData.querySelector('GeneralComments')?.textContent, 'GeneralComments', 15);
        }
        
        // Tercer Operador
        if (this.shouldShowThirdOperatorSection(xmlData)) {
          this.addSection('Tercer Operador', 4);
          
          this.renderThirdOperatorField(xmlData, 'Country', 'País');
          this.renderThirdOperatorField(xmlData, 'BusinessName', 'Razón Social');
          this.renderThirdOperatorField(xmlData, 'Address', 'Domicilio');
          if (this.shouldShowField('ThirdOpCity')) {
            this.addField('Ciudad', xmlData.querySelector('ThirdOpCity')?.textContent, 'ThirdOpCity', 20);
          }
          this.renderThirdOperatorField(xmlData, 'InvoiceNo', 'Número de Factura');
          
          // Fecha de factura del tercer operador
          const invoiceDateResult = getOperatorContent(xmlData, 'InvoiceDate', this.xmlSpecifications, this.currentVersion, this.currentAgreement);
          if (invoiceDateResult.requirement !== 'NC') {
            this.addField('Fecha de Factura', formatDate(invoiceDateResult.value), invoiceDateResult.foundElement, 20);
          }

          this.renderThirdOperatorField(xmlData, 'Statement', 'Declaración');
        }
      }
      
      // Declaración
      const declarationFields = ['DeclarationDate', 'DeclarationRequestNo', 'Affidavit'];
      
      if (declarationFields.some(field => this.shouldShowField(field))) {
        this.addSection('Declaración de Origen', 3);
        
        const declarationFieldsArray = [];
        
        if (this.shouldShowField('DeclarationDate')) {
          declarationFieldsArray.push({
            label: 'Fecha de Solicitud',
            value: formatDate(xmlData.querySelector('DeclarationDate')?.textContent),
            elementName: 'DeclarationDate'
          });
        }
        
        if (this.shouldShowField('DeclarationRequestNo')) {
          declarationFieldsArray.push({
            label: 'Número de Solicitud',
            value: xmlData.querySelector('DeclarationRequestNo')?.textContent,
            elementName: 'DeclarationRequestNo'
          });
        }
        
        if (declarationFieldsArray.length > 0) {
          this.addMultiField(declarationFieldsArray, 15);
        }
        
        if (this.shouldShowField('Affidavit')) {
          this.addField('Declaración Jurada', xmlData.querySelector('Affidavit')?.textContent, 'Affidavit', 15);
        }
      }
      
      // Entidad Habilitada
      const eh = xmlData.querySelector('EH');
      const ehFields = ['EHId', 'EHCountry', 'EHName', 'EHAddress', 'EHCity', 'EHCityLocality', 
                        'EHTelephone', 'EHFax', 'EHEmail', 'EHURL'];
      
      if (eh && ehFields.some(field => this.shouldShowField(field))) {
        this.addSection('Entidad de Certificación Emisora', 1);
        
        const ehHeaderFields = [];
        
        if (this.shouldShowField('EHId')) {
          ehHeaderFields.push({
            label: 'Código de EH',
            value: eh.querySelector('EHId')?.textContent,
            elementName: 'EHId'
          });
        }
        
        if (this.shouldShowField('EHCountry')) {
          ehHeaderFields.push({
            label: 'País',
            value: eh.querySelector('EHCountry')?.textContent,
            elementName: 'EHCountry'
          });
        }
        
        if (ehHeaderFields.length > 0) {
          this.addMultiField(ehHeaderFields, 10);
        }
        
        if (this.shouldShowField('EHName')) {
          this.addField('Nombre', eh.querySelector('EHName')?.textContent, 'EHName', 10);
        }
        
        if (this.shouldShowField('EHAddress')) {
          this.addField('Domicilio', eh.querySelector('EHAddress')?.textContent, 'EHAddress', 10);
        }
        
        // Ciudad de EH con alternativas
        const ehCityReq = this.getFieldRequirement('EHCity');
        const ehLocalityReq = this.getFieldRequirement('EHCityLocality');
        
        if (ehCityReq !== 'NC') {
          this.addField('Ciudad', eh.querySelector('EHCity')?.textContent, 'EHCity', 10);
        } else if (ehLocalityReq !== 'NC') {
          this.addField('Ciudad', eh.querySelector('EHCityLocality')?.textContent, 'EHCityLocality', 10);
        }
        
        // Contacto de EH
        const ehContactFields = [];
        
        if (this.shouldShowField('EHTelephone')) {
          ehContactFields.push({
            label: 'Teléfono',
            value: eh.querySelector('EHTelephone')?.textContent,
            elementName: 'EHTelephone'
          });
        }
        
        if (this.shouldShowField('EHEmail')) {
          ehContactFields.push({
            label: 'Email',
            value: eh.querySelector('EHEmail')?.textContent,
            elementName: 'EHEmail'
          });
        }
        
        if (this.shouldShowField('EHURL')) {
          ehContactFields.push({
            label: 'Website',
            value: eh.querySelector('EHURL')?.textContent,
            elementName: 'EHURL'
          });
        }
        
        if (ehContactFields.length > 0) {
          this.addMultiField(ehContactFields, 10);
        }
        
        if (this.shouldShowField('EHFax')) {
          this.addField('Fax', eh.querySelector('EHFax')?.textContent, 'EHFax', 10);
        }
      }
      
      // Certificación
      const certificationEH = xmlData.querySelector('CertificationEH');
      const certFields = ['CertificateControlCode', 'CertificateDate', 'CertificateID'];
      
      if (certificationEH && certFields.some(field => this.shouldShowField(field))) {
        this.addSection('Certificación de Origen', 1);
        
        const certificationFields = [];
        
        if (this.shouldShowField('CertificateControlCode')) {
          certificationFields.push({
            label: 'Código de Control',
            value: certificationEH.querySelector('CertificateControlCode')?.textContent,
            elementName: 'CertificateControlCode'
          });
        }
        
        if (this.shouldShowField('CertificateDate')) {
          certificationFields.push({
            label: 'Fecha de Certificación',
            value: formatDate(certificationEH.querySelector('CertificateDate')?.textContent),
            elementName: 'CertificateDate'
          });
        }
        
        if (this.shouldShowField('CertificateID')) {
          certificationFields.push({
            label: 'Número de Certificado',
            value: certificationEH.querySelector('CertificateID')?.textContent,
            elementName: 'CertificateID'
          });
        }
        
        if (certificationFields.length > 0) {
          this.addMultiField(certificationFields, 10);
        }
      }
      
      // Agregar pie de página a todas las páginas
      const pageCount = this.doc.internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        this.doc.setPage(i);
        this.addFooter();
      }

      // Marca de agua si el COD no está completo
      this.addIncompleteWatermark();

      return this.doc;
    } catch (error) {
      console.error('Error generando PDF:', error);
      throw new Error('Error al generar el PDF: ' + error.message);
    }
  }
}

// Arma el documento jsPDF sin descargarlo — separado de generateCODPDF para poder
// probar la generación en tests sin disparar una descarga/escritura a disco real.
export const buildCODPDFDocument = async (xmlData, options = {}) => {
  const generator = new PDFGenerator(xmlData, options);
  const doc = await generator.generatePDF(xmlData);

  const certificateId = xmlData.querySelector('CertificateID')?.textContent || 'COD';
  const timestamp = new Date().toISOString().slice(0, 10);
  const filename = `COD_${certificateId}_${timestamp}.pdf`;

  return { doc, filename };
};

// Función principal para generar y descargar PDF (actualizada)
export const generateCODPDF = async (xmlData, options = {}) => {
  try {
    const { doc, filename } = await buildCODPDFDocument(xmlData, options);

    // Descargar el PDF
    doc.save(filename);

    return { success: true, filename };
  } catch (error) {
    console.error('Error al generar PDF:', error);
    return { success: false, error: error.message };
  }
};