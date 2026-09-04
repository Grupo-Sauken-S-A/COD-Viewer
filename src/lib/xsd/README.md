# XSD vendorizados para validación de COD (Etapa 2)

Estos son los XSD oficiales de ALADI/COD provistos directamente por el dueño del proyecto
(2026-09-04), vendorizados en el repo para que la validación corra sin depender de red ni
de que `codaladi.org`/`certificadoorigen.com.ar` estén disponibles — ver
[`BUSINESS_RULES.md` §6](../../../docs/BUSINESS_RULES.md).

## Selección de esquema

`CODVer` del XML → familia de XSD:

| `CODVer` | XSD que aplica |
|---|---|
| `1.8.0` | `cod_ver_1.8.2*.xsd` (1.8.0 nunca tuvo XSD propio) |
| `1.8.2` | `cod_ver_1.8.2*.xsd` |
| `1.8.3` | `cod_ver_1.8.3*.xsd` |
| `4.1.1` | `cod_ver_4.1.1*.xsd` |

Dentro de cada versión, el sufijo depende de la etapa de emisión (`getEmissionStage()`,
`src/components/signature-utils.js`):

| Sufijo | Etapa de emisión |
|---|---|
| _(sin sufijo)_ | 4 — completo (ambas firmas) |
| `_exporter_signed` | 2 — firmado por el EXP, sin certificar |
| `_exporter_unsigned` | 1 — borrador, sin firmar |

La etapa 3 (certificado por la EH, sin firma del FH) y la etapa "anómalo" **no tienen
XSD correspondiente** — ningún archivo de esta carpeta describe esa forma exacta
(tiene `<EH>`/`<CertificationEH>`, que `_exporter_signed` prohíbe, pero le falta la firma
del FH, que el esquema completo exige) — así que para esas dos etapas la app no corre
validación XSD (decisión explícita del dueño del proyecto, 2026-09-04).

## Modificaciones respecto de los archivos originales

Solo dos, ambas mecánicas, ningún cambio de contenido/semántica:

1. **BOM UTF-8 quitado** de los 3 archivos `cod_ver_4.1.1*.xsd` (los originales lo traían;
   los de `1.8.2`/`1.8.3` no) — un COD real no debe tener BOM (ver más abajo), y por
   consistencia tampoco lo llevan los esquemas que lo validan.
2. **`schemaLocation` del `<xs:import>` de xmldsig corregido** en los 9 archivos: el
   original de ALADI trae `.../xmldsig-core-schema.xsd ` con un espacio de más al final
   (bug del propio XSD de ALADI), y además apunta a una URL remota. Se cambió a
   `schemaLocation="xmldsig-core-schema.xsd"`, resuelto contra el archivo local de esta
   misma carpeta (bajado tal cual de
   `https://www.w3.org/TR/2002/REC-xmldsig-core-20020212/xmldsig-core-schema.xsd`, sin
   modificar).

## Por qué esto es distinto de la regla de BOM en el COD que se valida

Esta carpeta corrige el BOM en los XSD porque son archivos internos de la app, no
certificados. Un COD real que **sí** trae BOM no se "corrige" — se procesa igual pero se
alerta al usuario, porque ALADI no admite BOM y es probable que la autoridad aduanera
rechace ese certificado por esa causa (`validateBOM`, `src/lib/input-validation.js`).
