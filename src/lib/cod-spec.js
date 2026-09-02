// Reglas de negocio compartidas entre CODViewer y el generador de PDF:
// qué campos son obligatorios/opcionales/no-corresponde según versión y acuerdo del COD.

export const AGREEMENT_MAPPING = {
  'A13': 'A18',
  'A14': 'A18',
  'A57': 'A18',
  'A18': 'A18',
  'A35': 'A35',
  'A72': 'A72'
};

export const getMappedAgreement = (originalAgreement) => {
  return AGREEMENT_MAPPING[originalAgreement] || originalAgreement;
};

export const getFieldRequirement = (xmlSpecifications, currentVersion, currentAgreement, elementName) => {
  if (!xmlSpecifications || !currentVersion || !currentAgreement) {
    return 'O';
  }

  const elementSpec = xmlSpecifications.especificaciones[`<${elementName}>`];
  if (!elementSpec) {
    return 'NC';
  }

  const versionSpec = elementSpec[currentVersion];
  if (!versionSpec) {
    return 'NC';
  }

  const mappedAgreement = getMappedAgreement(currentAgreement);
  const requirement = versionSpec[mappedAgreement];

  return requirement || 'NC';
};

export const getElementWithSpecPriority = (xmlSpecifications, currentVersion, currentAgreement, xmlData, primaryElement, alternativeElements = []) => {
  const allElements = [primaryElement, ...alternativeElements];

  let selectedElement = null;
  let selectedRequirement = 'NC';

  for (const element of allElements) {
    const requirement = getFieldRequirement(xmlSpecifications, currentVersion, currentAgreement, element);
    if (requirement !== 'NC') {
      selectedElement = element;
      selectedRequirement = requirement;
      break;
    }
  }

  if (!selectedElement) {
    return { value: null, foundElement: null, requirement: 'NC' };
  }

  const xmlValue = xmlData.querySelector(selectedElement)?.textContent?.trim();

  return {
    value: xmlValue,
    foundElement: selectedElement,
    requirement: selectedRequirement
  };
};

export const getValueFieldWithSpecPriority = (xmlSpecifications, currentVersion, currentAgreement, good) => {
  const valueReq = getFieldRequirement(xmlSpecifications, currentVersion, currentAgreement, 'GoodsItemValue');
  const fobReq = getFieldRequirement(xmlSpecifications, currentVersion, currentAgreement, 'GoodsItemFOB');

  if (valueReq !== 'NC') {
    const xmlValue = good.querySelector('GoodsItemValue')?.textContent?.trim();
    return {
      value: xmlValue,
      foundElement: 'GoodsItemValue',
      requirement: valueReq,
      type: 'Value'
    };
  } else if (fobReq !== 'NC') {
    const xmlValue = good.querySelector('GoodsItemFOB')?.textContent?.trim();
    return {
      value: xmlValue,
      foundElement: 'GoodsItemFOB',
      requirement: fobReq,
      type: 'FOB'
    };
  }

  return { value: null, foundElement: null, requirement: 'NC', type: null };
};

export const getOperatorContent = (xmlSpecifications, currentVersion, currentAgreement, xmlData, fieldName) => {
  const thirdOpReq = getFieldRequirement(xmlSpecifications, currentVersion, currentAgreement, `ThirdOp${fieldName}`);
  const op3cReq = getFieldRequirement(xmlSpecifications, currentVersion, currentAgreement, `Op3c${fieldName}`);

  if (thirdOpReq !== 'NC') {
    const xmlValue = xmlData.querySelector(`ThirdOp${fieldName}`)?.textContent?.trim();
    return {
      value: xmlValue,
      foundElement: `ThirdOp${fieldName}`,
      requirement: thirdOpReq,
      family: 'ThirdOp'
    };
  } else if (op3cReq !== 'NC') {
    const xmlValue = xmlData.querySelector(`Op3c${fieldName}`)?.textContent?.trim();
    return {
      value: xmlValue,
      foundElement: `Op3c${fieldName}`,
      requirement: op3cReq,
      family: 'Op3c'
    };
  }

  return { value: null, foundElement: null, requirement: 'NC', family: null };
};

export const getEHCityFieldWithSpecPriority = (xmlSpecifications, currentVersion, currentAgreement, ehElement) => {
  const cityReq = getFieldRequirement(xmlSpecifications, currentVersion, currentAgreement, 'EHCity');
  const localityReq = getFieldRequirement(xmlSpecifications, currentVersion, currentAgreement, 'EHCityLocality');

  if (cityReq !== 'NC') {
    const xmlValue = ehElement?.querySelector('EHCity')?.textContent?.trim();
    return {
      value: xmlValue,
      foundElement: 'EHCity',
      requirement: cityReq,
      version: 'legacy'
    };
  } else if (localityReq !== 'NC') {
    const xmlValue = ehElement?.querySelector('EHCityLocality')?.textContent?.trim();
    return {
      value: xmlValue,
      foundElement: 'EHCityLocality',
      requirement: localityReq,
      version: 'current'
    };
  }

  return { value: null, foundElement: null, requirement: 'NC', version: null };
};

export const isRequiredFieldEmpty = (value, requirement) => {
  return requirement === 'M' && (!value || value.trim() === '');
};
