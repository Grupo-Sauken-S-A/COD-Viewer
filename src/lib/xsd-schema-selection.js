// Selección del XSD de ALADI (vendorizado en src/lib/xsd/) que corresponde a un COD,
// según su versión y su etapa de emisión. Ver src/lib/xsd/README.md para el detalle de
// cada regla y por qué la etapa 3 / "anomalo" no tienen XSD.

// 1.8.0 nunca tuvo XSD propio — confirmado por el dueño del proyecto — usa el de 1.8.2.
const VERSION_TO_XSD_FAMILY = {
  '1.8.0': '1.8.2',
  '1.8.2': '1.8.2',
  '1.8.3': '1.8.3',
  '4.1.1': '4.1.1'
};

const STAGE_TO_SUFFIX = {
  1: '_exporter_unsigned',
  2: '_exporter_signed',
  4: ''
  // Deliberadamente sin entradas para 3 y 'anomalo': ningún XSD describe esa forma.
};

// Motivos por los que una combinación versión/etapa no tiene XSD — para que la UI pueda
// explicar por qué no se validó, en vez de simplemente no decir nada (mismo criterio que
// el resto de la app: siempre aclarar qué se chequeó y qué no).
export const XSD_NOT_APPLICABLE_REASON = {
  UNKNOWN_VERSION: 'version-desconocida',
  STAGE_3: 'etapa-3',
  STAGE_ANOMALO: 'etapa-anomalo',
  UNKNOWN_STAGE: 'etapa-desconocida',
  // No es que no corresponda validar — es que /api/validate-xsd no respondió (red/servidor).
  ERROR: 'error'
};

// Devuelve {applicable: true, fileName} con el XSD a usar (relativo a src/lib/xsd/), o
// {applicable: false, reason} si esta combinación de versión/etapa no tiene un XSD que le
// corresponda. `stage` es el campo numérico/"anomalo" que devuelve getEmissionStage()
// (src/components/signature-utils.js), no el objeto completo.
export const resolveXsdSchema = (codVersion, stage) => {
  const family = VERSION_TO_XSD_FAMILY[codVersion];
  if (!family) {
    return { applicable: false, reason: XSD_NOT_APPLICABLE_REASON.UNKNOWN_VERSION };
  }

  const suffix = STAGE_TO_SUFFIX[stage];
  if (suffix === undefined) {
    let reason = XSD_NOT_APPLICABLE_REASON.UNKNOWN_STAGE;
    if (stage === 3) reason = XSD_NOT_APPLICABLE_REASON.STAGE_3;
    else if (stage === 'anomalo') reason = XSD_NOT_APPLICABLE_REASON.STAGE_ANOMALO;
    return { applicable: false, reason };
  }

  return { applicable: true, fileName: `cod_ver_${family}${suffix}.xsd` };
};

// Texto explicativo por qué no se validó, consumido igual por la vista web
// (XsdValidationAlert) y el PDF (addXsdValidationAlert) — nunca duplicado entre los dos.
export const getXsdNotApplicableMessage = (reason) => {
  switch (reason) {
    case XSD_NOT_APPLICABLE_REASON.STAGE_3:
      return 'No se validó contra el XSD de ALADI: el documento está certificado por la Entidad Habilitada pero aún no tiene la firma del Funcionario Habilitado. Ningún esquema oficial describe exactamente ese estado intermedio.';
    case XSD_NOT_APPLICABLE_REASON.STAGE_ANOMALO:
      return 'No se validó contra el XSD de ALADI: el orden de las firmas del documento es inconsistente (ver alerta de etapa de emisión).';
    case XSD_NOT_APPLICABLE_REASON.UNKNOWN_VERSION:
      return 'No se validó contra el XSD de ALADI: la versión de COD no es una de las reconocidas por esta aplicación.';
    case XSD_NOT_APPLICABLE_REASON.ERROR:
      return 'No se pudo validar contra el XSD de ALADI (error de red o del servidor) — no se determinó si el documento lo cumple o no.';
    default:
      return 'No se validó contra el XSD de ALADI: no se pudo determinar qué esquema le corresponde.';
  }
};
