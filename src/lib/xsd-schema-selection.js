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

// Devuelve el nombre de archivo XSD a usar (relativo a src/lib/xsd/), o null si esta
// combinación de versión/etapa no tiene un XSD que le corresponda. `stage` es el campo
// numérico/"anomalo" que devuelve getEmissionStage() (src/components/signature-utils.js),
// no el objeto completo.
export const resolveXsdFileName = (codVersion, stage) => {
  const family = VERSION_TO_XSD_FAMILY[codVersion];
  if (!family) return null;

  const suffix = STAGE_TO_SUFFIX[stage];
  if (suffix === undefined) return null;

  return `cod_ver_${family}${suffix}.xsd`;
};
