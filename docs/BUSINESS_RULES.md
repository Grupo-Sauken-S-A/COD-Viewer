# Reglas de negocio y validaciones de cod-viewer

Este documento es la referencia exhaustiva de **todas** las reglas de negocio, validaciones y decisiones de diseño de esta aplicación: de dónde salen, por qué son así, y dónde están implementadas. Está pensado tanto para desarrolladores humanos como para asistentes de IA que trabajen sobre este código — léelo antes de tocar cualquier lógica relacionada con especificaciones, firmas o validación de XML.

Fuentes usadas para armar este documento: el código fuente actual, el documento oficial de ALADI `ALADI_SEC_di2327_Rev13.pdf` (Revisión 13 del estándar COD/MERCOSUR), el documento interno de Sauken `Como_Se_Crea_Un_COD.pdf`, y 6+ certificados XML reales de producción usados para verificar cada regla empíricamente.

## Índice

1. [Qué es un COD y cómo se construye](#1-qué-es-un-cod-y-cómo-se-construye)
2. [Versiones de COD](#2-versiones-de-cod)
3. [Acuerdos comerciales y el mapeo a formularios](#3-acuerdos-comerciales-y-el-mapeo-a-formularios)
4. [La tabla de requerimientos M/O/NC](#4-la-tabla-de-requerimientos-moNC)
5. [Reglas de alternancia entre campos](#5-reglas-de-alternancia-entre-campos)
6. [Validaciones sobre el archivo XML de entrada](#6-validaciones-sobre-el-archivo-xml-de-entrada)
7. [Detección de elementos con datos inesperados](#7-detección-de-elementos-con-datos-inesperados)
8. [Firmas digitales](#8-firmas-digitales)
9. [Etapa de emisión del COD](#9-etapa-de-emisión-del-cod)
10. [Estructura del XML real vs. jerarquía visual](#10-estructura-del-xml-real-vs-jerarquía-visual)
11. [El PDF exportado](#11-el-pdf-exportado)
12. [Decisiones de seguridad deliberadas](#12-decisiones-de-seguridad-deliberadas)
13. [Deuda conocida / pendiente explícito](#13-deuda-conocida--pendiente-explícito)

---

## 1. Qué es un COD y cómo se construye

Un **Certificado de Origen Digital (COD)** es un XML UTF-8 cuya estructura y contenido define ALADI, equivalente digital de los formularios de Certificado de Origen en papel. Hay dos actores:

- **EXP (Exportador)**: carga los datos del certificado y firma digitalmente el elemento con `id="COD"`.
- **FH (Funcionario Habilitado)** de una Entidad Habilitada (EH) autorizada por ALADI: agrega los datos de certificación/emisión y firma digitalmente el elemento con `id="CODEH"`.

### Las 4 etapas de construcción de un COD

(Fuente: `Como_Se_Crea_Un_COD.pdf`, verificado literalmente contra 6 XML reales de producción)

1. **Sin firmas**: `<CODEH id="CODEH"><CODExporter><COD id="COD">` con `CODVer`, `CODSubmitterType=EXP`, `Agreement`, `FormA18/FormA35/FormA72` — solo datos del exportador y del formulario.
2. **Firma del EXP**: se agrega `<ds:Signature>` con `Reference URI="#COD"` como **hermano** de `<COD>`, dentro de `<CODExporter>` (no dentro de `<COD>`).
3. **Datos de certificación del FH**: se agregan `<EH>` (datos de la entidad) y `<CertificationEH>` (`CertificateControlCode`, `CertificateDate`, `CertificateID`) como **hermanos de `<CODExporter>`**, dentro de `<CODEH>` — fuera del subárbol `<COD>` ya firmado.
4. **Firma del FH**: segundo `<ds:Signature>`, con `Reference URI="#CODEH"`, como hermano de `<CODEH>` después de que cierra `</CODEH>` — cubre todo el documento, incluida la firma del EXP.

**Por qué no rompe la firma del EXP**: el digest de la firma del EXP se calcula solo sobre `#COD` (el contenido de `<COD id="COD">`). El FH agrega `<EH>`/`<CertificationEH>` como hermanos posteriores, **fuera** de ese subárbol, así que ni un byte de lo que el EXP firmó cambia. La firma del FH sí cubre todo (`#CODEH`), notariando el documento completo incluida la firma del EXP como dato dentro de lo firmado.

### Estructura real completa del XML (confirmada en 6+ certificados de producción)

```
<ns1:Envelope xmlns:ns1="...soap-envelope" xsi:schemaLocation="...cod_ver_X.X.X.xsd">
  <ns1:CertOrigin>
    <CODEH id="CODEH">
      <CODExporter>
        <COD id="COD">
          <CODVer>4.1.1</CODVer>
          <CODSubmitterType>EXP</CODSubmitterType>
          <Agreement><AgreementName>.../AgreementAcronym>...</Agreement>
          <FormA18> <!-- o FormA35 / FormA72 según el acuerdo -->
            <Exporter>...</Exporter>
            <Subscriber>...</Subscriber>              <!-- opcional según spec -->
            <Invoices><Invoice>...</Invoice></Invoices>
            <GoodsList><Goods>...</Goods></GoodsList>
            <Importer>...</Importer>
            <Consignee>...</Consignee>                 <!-- opcional -->
            <Transport>...</Transport>
            <Comments>
              <GeneralComments>...</GeneralComments>
              <ThirdOpComments>...</ThirdOpComments>    <!-- A18/A35 -->
              <!-- o -->
              <Op3cComments>...</Op3cComments>          <!-- A72 -->
            </Comments>
            <Declaration>...</Declaration>
          </FormA18>
        </COD>
        <ds:Signature>...<ds:Reference URI="#COD">...</ds:Signature>   <!-- Firma EXP -->
      </CODExporter>
      <EH>...</EH>
      <CertificationEH>...</CertificationEH>
    </CODEH>
    <ds:Signature>...<ds:Reference URI="#CODEH">...</ds:Signature>     <!-- Firma FH -->
  </ns1:CertOrigin>
</ns1:Envelope>
```

**Importante para quien lea/extraiga datos de este XML**: la app usa `document.querySelector('NombreDeTag')` para leer casi todos los campos, lo cual es **agnóstico a la profundidad de anidamiento** — no importa si `ExporterCountry` está 3 o 7 niveles adentro, se encuentra igual. Ver sección 10.

### Convención de nombre de archivo

Un COD se nombra como `<CertificateID>.xml`. Descomposición confirmada contra ejemplos reales (`AR004A13260000000200.xml`):

| Segmento | Significado | Ejemplo |
|---|---|---|
| `AR` | País (Argentina) | `AR` |
| `004` | Código de EH en ALADI (`EHId`) | `004` |
| `A13` | Acrónimo del acuerdo **original** (no el mapeado a A18) | `A13` |
| `26` | Año (2 dígitos) | `26` = 2026 |
| `00000002` | Número de Certificado de Origen | `00000002` |
| `00` | Sin uso, reservado | `00` |

## 2. Versiones de COD

Versiones conocidas y soportadas por `xml-specifications.js`: **1.8.0, 1.8.2, 1.8.3, 4.1.1**.

- **La versión 1.8.1 nunca existió** (confirmado por el dueño del proyecto).
- **1.8.0, 1.8.2 y 1.8.3 tienen exactamente las mismas reglas de validación entre sí** para un mismo acuerdo — verificado programáticamente: 0 diferencias en las 76 filas de la tabla para A18. La diferencia entre esas 3 versiones es de qué **acrónimos de acuerdo** acepta cada una (ej. A72 no existía como acuerdo válido en 1.8.2), no de qué campos exige.
- **4.1.1 es la versión "post-ROM"**: adoptada por el MERCOSUR junto con las nuevas **Reglas de Origen del MERCOSUR (ROM)**. Tiene patrones M/O/NC notablemente distintos a las versiones 1.8.x en varios campos (ej. `Affidavit`, `SubscriberSubmitterName`, `EHCityLocality` pasan a M solo en 4.1.1).
- La app lee `<CODVer>` del XML tal cual y hace un lookup directo por ese string exacto contra la tabla — no hay ninguna lógica de "familia de versiones" ni normalización.
- **No existe hoy ninguna versión más allá de estas 4.** Si apareciera un `CODVer` desconocido, actualmente **todos los campos resuelven a NC** (certificado casi vacío, sin ningún aviso claro de "versión no soportada") — mitigado parcialmente por la validación de entrada (sección 6), que si detecta una versión no reconocida, muestra una advertencia explícita en vez de fallar en silencio.

## 3. Acuerdos comerciales y el mapeo a formularios

### El mapeo vigente

```js
// src/lib/cod-spec.js
export const AGREEMENT_MAPPING = {
  'A13': 'A18',
  'A14': 'A18',
  'A57': 'A18',
  'A18': 'A18',
  'A35': 'A35',
  'A72': 'A72'
};
```

A13 (Argentina-Paraguay), A14 (Argentina-Brasil) y A57 (Argentina-Uruguay) **validan siempre como A18** — usan el mismo formulario (`FormA18` en el XML) y las mismas reglas M/O/NC que A18, sin excepción de rubro.

### Por qué (historia regulatoria — importante para no "corregir" esto por error)

A13 (Argentina-Paraguay), A14 (Argentina-Brasil) y A57 (Argentina-Uruguay) **siguen siendo acuerdos del sector automotriz** — eso no cambió, y así los describe el documento oficial de ALADI (`ALADI_SEC_di2327_Rev13.pdf`, Anexo 3): ahí, A14 tenía formulario propio para producto no automotor, y usaba el Formulario del A18 solo para producto del sector automotor (38º Protocolo Adicional). A13 tenía la misma dualidad, en paralelo a A14. A57 seguía una lógica equivalente. Esa distinción por rubro (automotor / no automotor) describe una regla **más vieja y ya superada**, documentada en ese PDF.

**Por una normativa posterior, no incluida en ese PDF**, MERCOSUR adoptó las nuevas Reglas de Origen (ROM), que usan la versión de COD **4.1.1** — la misma versión en la que se basa el A18. Como A13/A14/A57 son acuerdos entre países miembros de MERCOSUR, todos pasan a validar siempre por el Formulario del A18 y sus mismas reglas M/O/NC, **sin condición de rubro automotor/no-automotor**: ya no hace falta que el producto sea automotor para usar ese formulario. Esto es lo que implementa `AGREEMENT_MAPPING` hoy, y es la regla **vigente y correcta**.

**Importante — lo que NO se unificó:** que A13, A14 y A57 compartan formulario y validaciones no significa que sean el mismo acuerdo. Al ser acuerdos comerciales distintos (entre pares de países distintos), cada uno tiene sus propias **Normas de Origen** — el criterio sustantivo que determina si una mercadería realmente califica como originaria. Lo que se unificó es la *forma* del certificado (estructura del XML, campos M/O/NC); las Normas de Origen que se aplican para calificar la mercadería siguen siendo las de cada acuerdo específico. Esta app no valida Normas de Origen (eso lo declara el exportador/la Entidad Habilitada al emitir el COD, fuera del alcance de este visualizador) — esta aclaración es solo para no confundir "mismo formulario" con "mismo acuerdo".

### `<FormA18>` / `<FormA35>` / `<FormA72>`

Son elementos que **existen en el XML real** (wrapper del contenido del COD, ver sección 1) pero **no están en el XSD** documentado en `ALADI_SEC_di2327_Rev13.pdf` — no se validan contra ese XSD, aunque están presentes en todos los certificados reales analizados. El código de esta app no lee este wrapper para mapear el acuerdo — mapea leyendo `<AgreementAcronym>` directamente.

### Terminología de ALADI

Los formularios en papel se nombran "F. ACE 18", "F. ACE 14", "F. ACE 35", "F. ACE 72" (ACE = Acuerdo de Complementación Económica; el número de ACE equivale al acrónimo: ACE 14 = A14, ACE 18 = A18, etc.).

## 4. La tabla de requerimientos M/O/NC

Vive en `src/components/xml-specifications.js`, objeto `XML_SPECIFICATIONS.especificaciones`. Es una tabla de **76 elementos** × 4 versiones × 3 acuerdos (A18/A35/A72 — los acuerdos "hijos" A13/A14/A57 usan la columna A18 vía el mapeo de la sección 3).

> **Nota de datos**: `XML_SPECIFICATIONS.metadata.total_elementos` dice `72`, pero hay **76** elementos reales en la tabla — el contador quedó desactualizado. No lo lee ningún código en runtime, pero conviene saberlo si se lo va a mantener a mano.

### Los tres valores posibles y cómo se muestran

| Valor | Significado | Regla de visualización |
|---|---|---|
| `M` | Mandatorio/Obligatorio | Se muestra **siempre**, resaltado (ícono ámbar). Si falta el dato, pasa a **rojo** ("No informado") — nunca se oculta. |
| `O` | Opcional | Se muestra si hay dato o no, con un ícono gris neutro — sin resaltar como obligatorio. |
| `NC` | No corresponde | Se **oculta siempre** — el campo ni se renderiza. |

Implementado en `getFieldRequirement()` (`src/lib/cod-spec.js`) + `shouldShowField()`, consumido igual por la vista web (`CODViewer.jsx`) y por el generador de PDF (`pdf-generator.js`) — ambos comparten el mismo módulo, sin lógica duplicada.

### Verificación contra la documentación oficial

Se comparó programáticamente la columna **4.1.1** de esta tabla contra las Tablas 4 (ACE18/A18), 7 (ACE35/A35) y 15 (ACE72/A72) de `ALADI_SEC_di2327_Rev13.pdf`: **coincidencia perfecta, cero diferencias de valor** (el PDF usa "F"/Facultativo donde el código usa "O"/Opcional — mismo significado).

### Elementos de la tabla nunca usados en el código

- **`GoodsInvoiceOrderNo`**: confirmado por el dueño del proyecto que no hace falta mostrarlo.
- **`PACComments`** y **`HSVer`**: existen en el estándar ALADI (específicos de A18, ninguno es M) pero confirmados como no usados en los acuerdos vigentes actuales — decisión consciente de no agregarlos a la UI.
- **`UnloadingPortName`** ("Puerto de Descarga", contraparte de `TransportPortOfLoading`/"Puerto de Carga", que sí se muestra): confirmado por el dueño del proyecto (2026-09-03) que **nunca se usó** en ningún COD real de los acuerdos/versiones que maneja esta app — se cargó en la tabla como M en casi todas las combinaciones (venía así del estándar ALADI/Rev13), pero en la práctica no aporta nada y no debe mostrarse nunca. Se bajó a `O` en las 12 combinaciones para que, si alguna vez aparece con contenido en un XML real, no se marque como "dato inesperado" (`getUnexpectedElements` solo reporta elementos que deberían ser `NC`) — y sigue sin tener ningún código que lo lea o lo muestre, a propósito.
- **`InvoiceQty`** y **`GoodsQty`**: sí se leen, pero **solo** para decidir si se muestra la sección "Facturas Comerciales"/"Lista de Mercaderías" — su valor nunca se pinta como campo visible.

## 5. Reglas de alternancia entre campos

Algunos datos tienen dos nombres de tag posibles según versión/acuerdo/dato real. Hay **dos mecanismos distintos** para resolver cuál usar — no confundirlos:

### 5.1. Alternancia por especificación (versión/acuerdo determina cuál corresponde)

La tabla M/O/NC ya distingue, para la combinación versión+acuerdo actual, cuál de los dos nombres tiene una regla distinta de NC. Implementado en `getElementWithSpecPriority()`, `getOperatorContent()`, `getEHCityFieldWithSpecPriority()` (`src/lib/cod-spec.js`):

| Campo principal | Alternativa | Regla |
|---|---|---|
| `GoodsItemValue` | `GoodsItemFOB` | A18 usa Value (M); A35/A72 usan FOB. |
| `ThirdOp*` (Country/BusinessName/Address/InvoiceNo/InvoiceDate/Statement) | `Op3c*` | A18/A35 usan ThirdOp; A72 usa Op3c. |
| `EHCity` | `EHCityLocality` | Versiones 1.8.x usan EHCity; 4.1.1 usa EHCityLocality. |

### 5.2. Alternancia por presencia real en el XML (la spec NO distingue)

`GoodsItemName`/`GoodsDescription` tienen **la misma fila M/O/NC** en las 12 combinaciones de versión/acuerdo — la tabla no da ninguna pista de cuál tag esperar. Por eso `getGoodsItemNameField()` (`src/lib/cod-spec.js`) elige por **presencia real** en el XML (si existe `GoodsItemName`, usa ese; si no, prueba `GoodsDescription`), no por prioridad de especificación. Este es el único campo con este mecanismo — todos los demás pares de la tabla anterior sí distinguen por versión/acuerdo.

**Importante**: si se agrega un campo nuevo con dos nombres posibles, primero verificar empíricamente (como se hizo acá) si la tabla M/O/NC los distingue por versión/acuerdo o no, antes de elegir el mecanismo 5.1 o 5.2 — usar el mecanismo equivocado reproduce el bug que tenía originalmente `GoodsItemName`/`GoodsDescription` (mirar spec-priority cuando debía mirarse presencia real).

### 5.3. Reglas de alternancia definidas pero inertes hoy

Estas están implementadas (mecanismo 5.1) pero **el campo principal nunca da NC** en los datos actuales de `xml-specifications.js`, así que la alternativa nunca se llega a usar en la práctica:

- `ExporterCity` / `ExporterLocality` (`ExporterLocality` ni siquiera tiene fila en la tabla).
- `ImporterCity` / `ImporterLocality` (ídem).
- `TransportPortOfLoading` / `LoadingPortName` (`TransportPortOfLoading` es M en las 12 combinaciones).

No es un bug — es una regla ya preparada por si algún día el campo principal pasa a ser NC en alguna combinación futura.

### 5.4. `ThirdOpCity`: el único campo de su familia sin equivalente `Op3c`

Confirmado contra el Anexo 4 de `ALADI_SEC_di2327_Rev13.pdf` (numeración de campos): la familia `ThirdOp` tiene 7 campos (10.3.1 a 10.3.7: Statement, Country, BusinessName, Address, InvoiceNo, InvoiceDate, **City**); la familia `Op3c` tiene solo 6 (10.4.1 a 10.4.6: Statement, BusinessName, Address, Country, InvoiceDate, InvoiceNo) — **sin City**. Por lo tanto `ThirdOpCity` se muestra como campo simple (sin alternancia), y solo aplica a A18 (confirmado: es F/opcional únicamente en la Tabla 4/ACE18 y en la matriz de 16 columnas del Anexo 5 del mismo PDF; para A35/A72 no aparece).

## 6. Validaciones sobre el archivo XML de entrada

Implementadas en `src/lib/input-validation.js` (`validateEncoding`, `validateStructure`) + `validateSubmitterType` (`src/components/signature-utils.js`), corridas desde `processXML()` en `CODViewer.jsx` y mostradas vía `InputValidationAlert`.

| Validación | Qué chequea | Por qué |
|---|---|---|
| `CODVer`/`AgreementAcronym` presentes | Que existan esos dos elementos | Sin ellos no se puede aplicar ninguna regla de la tabla M/O/NC |
| `CODVer` reconocido | Que sea una de las 4 versiones de la sección 2 | Una versión desconocida hace que todo el certificado se vea vacío sin explicación |
| `AgreementAcronym` reconocido | Que esté en `AGREEMENT_MAPPING` | Ídem para acuerdo desconocido |
| `<COD id="COD">` / `<CODEH id="CODEH">` presentes | Estructura básica mínima de un COD | Sin estos IDs no funciona ni la verificación de firmas ni la detección de etapa de emisión |
| Codificación del prólogo XML | Que el `encoding="..."` declarado sea UTF-8 | ALADI exige UTF-8; el navegador decodifica siempre como UTF-8 sin mirar esta declaración, así que un XML mal declarado no se detecta solo |
| Caracteres de reemplazo (`�`, U+FFFD) | Que no aparezcan en el contenido decodificado | Señal de que la codificación real no era UTF-8 aunque el prólogo no lo declare mal — nombres/direcciones con tildes pueden corromperse en silencio si no se avisa esto |
| `CODSubmitterType` | Que sea `"EXP"` | Es el único valor esperado según el mecanismo de emisión (sección 1) |

**Camino por URL (`?xmlUri=`)**: el proxy (`src/app/api/proxy/route.js`) además valida el `Content-Type` de la respuesta remota — rechaza explícitamente `html`, `json`, `image/*`, `video/*`, `audio/*`, `pdf` antes de intentar parsear el cuerpo como XML (evita que una página de error HTML con status 200 pase como si fuera el certificado).

**Todas estas validaciones son advertencias, no bloqueos** — el resto del contenido se sigue mostrando siempre (criterio consistente en toda la app: avisar, no ocultar).

### Explícitamente fuera de alcance (por ahora)

**Validación contra el XSD** que el propio XML declara en `xsi:schemaLocation` (ej. `cod_ver_4.1.1.xsd`) — decisión consciente de dejarlo pendiente, no implementado.

## 7. Detección de elementos con datos inesperados

`getUnexpectedElements()` (`src/lib/cod-spec.js`) recorre las ~77 claves conocidas de `xml-specifications.js`; para cada una, calcula el requerimiento según versión/acuerdo actual, y si da `NC` pero el XML tiene contenido no vacío para ese tag en cualquier parte del documento, lo reporta. Se muestra vía `UnexpectedElementsAlert`, sin ocultar el resto del certificado.

**Acotado a los elementos de la tabla, no a un escaneo libre de todo el XML** — evita falsos positivos de elementos estructurales (`<Goods>`, `<Signature>`, wrappers de firma) que no tienen semántica M/O/NC.

**Casos reales encontrados durante el desarrollo** (con XML de producción reales): `CertificateControlCode` y `EHFax` aparecen con datos en certificados A18/4.1.1 aunque la tabla dice NC para esa combinación — la Entidad Habilitada parece incluir esos dos datos administrativos siempre, sin importar si el formulario específico los exige. No es necesariamente un error del certificado, pero sí una diferencia sistemática y sostenida contra la tabla.

## 8. Firmas digitales

Implementado en `src/components/signature-utils.js` (`verifySignatureForElement`, `getSignatureStatusDisplay`, `checkSignatureIntegrity`) + `src/app/api/verify-signature-integrity/route.js`, reutilizado igual por la vista web (`SignatureStatus`) y el PDF (`addSignatureStatus`) — sin lógica duplicada entre los dos.

### Qué verifica (y qué NO verifica)

**Sí verifica:**
- Presencia de un `<ds:Signature>` cuyo `<ds:Reference URI="#COD">` o `="#CODEH"` matchee el elemento buscado.
- Algoritmo de **firma** real (`SignatureMethod`, ej. `rsa-sha1`) — no solo el de **digest** (`DigestMethod`). Marca como "débil/obsoleto" cualquier algoritmo con `sha1` o `md5` en el nombre.
- **Vigencia del certificado X.509** (`NotBefore`/`NotAfter`), extraída con un parser ASN.1/DER mínimo escrito a mano (sin librería nueva) — ver `getCertificateValidity()`.
- **Firmas duplicadas**: más de un `<ds:Signature>` con la misma `Reference URI`.
- Que `CODSubmitterType` sea `"EXP"` (sección 6).
- **Integridad criptográfica de la firma** (desde v1.1.0): que el contenido firmado no haya sido modificado después de firmarlo. Recalcula el digest del contenido referenciado (aplicando la canonicalización XML — C14N/exclusive-C14N — y el transform `enveloped-signature` que declara la propia firma) y lo compara contra `<DigestValue>`, y verifica `<SignatureValue>` contra `<SignedInfo>` usando la clave pública del certificado embebido en la propia firma (`<X509Certificate>`). Ver subsección siguiente para el detalle técnico.

**No verifica (y lo dice explícitamente en el texto que muestra):**
- La cadena de confianza del certificado (no valida contra una Autoridad Certificante raíz).
- **Si el certificado estaba revocado** en el momento de la firma — la app no consulta ninguna CRL/OCSP. Solo determina si la fecha de la firma caía dentro del período de vigencia (`NotBefore`–`NotAfter`) del certificado, que es una cosa distinta de "no revocado".

### Integridad de la firma (verificación criptográfica real)

**Por qué se agregó**: hasta v1.1.0 (versión original), la app solo comprobaba que existiera un `<ds:Signature>` y mostraba metadatos (algoritmo, vigencia del certificado) — pero nunca recalculaba el digest ni verificaba `SignatureValue`. Esto significaba que si alguien editaba un campo dentro de `<COD>`/`<CODEH>` **después** de que se firmara, la app seguía mostrando "Firma digital presente" con el certificado vigente, sin detectar la alteración — una app que aparentaba validar algo que en realidad nunca validó. Juan Carlos lo señaló como un tema de seguridad importante y pidió cerrarlo.

**Por qué corre server-side y no en el navegador**: la verificación real de XMLDSig requiere **canonicalización XML** (C14N inclusivo y exclusivo, con y sin comentarios — ver algoritmos exactos abajo), que no tiene equivalente nativo en el navegador (Web Crypto solo cubre el paso de verificar la firma sobre un buffer ya canonicalizado, no la canonicalización en sí). Implementar C14N a mano había fallado repetidamente en intentos previos (fuera de este proyecto). La solución fue usar `xml-crypto` (que sí implementa C14N correctamente, apoyado en Node `crypto`) desde una API route nueva: `POST /api/verify-signature-integrity`, que recibe el XML crudo (`xmlContent`) y devuelve `{ COD: {integrityValid}, CODEH: {integrityValid} }`. Se llama **una sola vez por documento cargado** (no por cada firma) desde `CODViewer.jsx` justo después de parsear el XML, y el resultado se reutiliza tanto en la vista web como al generar el PDF (pasado como opción `signatureIntegrity`).

**Algoritmos reales observados en COD de producción** (confirmado contra 6 XML reales + un XML de `viewcod.certificadoorigen.com.ar`):
- `CanonicalizationMethod` de `SignedInfo`: `http://www.w3.org/TR/2001/REC-xml-c14n-20010315#WithComments` (C14N inclusivo, con comentarios).
- `Transform` de cada `Reference`: `enveloped-signature` (saca la propia firma del contenido a hashear) + `http://www.w3.org/2001/10/xml-exc-c14n#` (C14N exclusivo, sin comentarios) sobre el elemento referenciado (`#COD`/`#CODEH`).
- `SignatureMethod`/`DigestMethod`: `rsa-sha1`/`sha1` (EXP, certificados más viejos) o `rsa-sha256`/`sha256` (FH, certificados más nuevos) — ambos ya soportados de fábrica por `xml-crypto`, sin necesidad de registrar algoritmos custom.

**Selección de la firma a verificar**: igual que `verifySignatureForElement`, si hay más de un `<ds:Signature>` con la misma `Reference URI`, se verifica la **primera** — consistente con qué firma se muestra en pantalla.

**Valores posibles de `integrityValid`**: `true` (verificado, coincide), `false` (el documento fue modificado después de firmarlo — máxima severidad, rojo), `null`/ausente (no se pudo determinar — error de red, algoritmo no soportado, etc.; nunca se asume válido por defecto). Si no hay firma para ese elemento, el endpoint devuelve `null` para esa clave (no es un error, `verifySignatureForElement` ya lo reporta por separado).

**Nota sobre el mecanismo de firmas** (ver sección 1): como `#CODEH` cubre todo el documento (incluida la firma de `#COD`), editar un campo dentro de `<COD>` invalida **ambas** referencias. Editar un dato que solo está en `<EH>`/`<CertificationEH>` (fuera de `<COD>`) invalida solo `#CODEH`, dejando `#COD` íntegra — confirmado con tests automatizados (`route.test.js`).

### Vigencia comparada contra la fecha real de la firma, NUNCA contra "hoy"

Cada una de las dos firmas de un COD corresponde a un momento real distinto:

| Firma | Elemento | Fecha de referencia para chequear vigencia |
|---|---|---|
| Exportador (EXP) | `#COD` | `<DeclarationDate>` |
| Funcionario Habilitado (FH) | `#CODEH` | `<CertificateDate>` |

**Por qué esto es crítico**: los certificados de firma digital en Argentina suelen tener una vigencia máxima de ~2 años. Si se comparara la vigencia contra la fecha de **hoy** (momento de visualización), cualquier COD de más de 2 años **siempre** aparecería con "certificado vencido", aunque haya sido perfectamente válido cuando se firmó — dato inútil y engañoso. Por eso se compara contra la fecha real de cada firma (`DeclarationDate`/`CertificateDate`), nunca contra la fecha actual. Si esa fecha de referencia no está presente en el XML, la app dice explícitamente que no puede determinar la vigencia — no asume nada.

### Fechas en UTC explícito, no en hora local

`DeclarationDate`/`CertificateDate` llegan en formato `YYYY-MM-DDTHH:mm:ss` **sin offset de zona horaria** (ej. `"2022-09-21T00:00:00"`). El motor JS interpreta un datetime así como **hora local** del entorno donde corre el código — lo que podría desalinearlo contra las fechas del certificado X.509 (que sí son UTC/Zulu). Por eso se parsean explícitamente como UTC (`parseCodDateTimeAsUTC`), y se **muestran** también en UTC (`timeZone: 'UTC'` en el formateo), para que lo que ve el usuario coincida siempre con el valor literal del XML y del certificado, sin importar la zona horaria del navegador o del servidor.

### Severidad visual (3 niveles, no 2)

| Color | Cuándo |
|---|---|
| Azul | Firma presente, sin ninguna advertencia. |
| Ámbar | Algoritmo de firma débil (SHA-1/MD5), o firmas duplicadas para el mismo elemento. |
| **Rojo** | El certificado **no estaba vigente** en la fecha de esa firma (vencido o todavía no válido en ese momento), **o** la verificación de integridad (`integrityValid === false`) detectó que el documento fue modificado después de firmarlo — esto último es la condición más grave que puede reportar la app: el documento debe considerarse inválido. Ambas son categorías más graves que las ámbar. |

Falta de firma (`hasSignature: false`) se muestra en ámbar — es el estado normal de un COD en proceso (ver sección 9), no una anomalía en sí misma.

## 9. Etapa de emisión del COD

`getEmissionStage(xmlDoc)` (`src/components/signature-utils.js`) interpreta la combinación de firmas/datos presentes según el mecanismo de la sección 1:

| Etapa | Condición | Significado |
|---|---|---|
| 1 | Sin firma `#COD` y sin `<EH>`/`<CertificationEH>` | Borrador — sin firmar |
| 2 | Firma `#COD` presente, sin `<EH>`/`<CertificationEH>` | Firmado por el Exportador, pendiente de certificación |
| 3 | Firma `#COD` + `<EH>`/`<CertificationEH>` presentes, sin firma `#CODEH` | Certificado por la EH, pendiente de firma del FH |
| 4 | Ambas firmas presentes | COD completo |
| "anómalo" | Cualquier combinación que no encaje (ej. `#CODEH` firmado sin `#COD` firmado) | No debería poder pasar según el mecanismo — se marca como inconsistencia |

Se muestra vía `EmissionStageAlert` (roja, arriba de todo) cuando la etapa no es la 4, tanto en pantalla como en PDF, **sin ocultar el resto del contenido** — alguien revisando un COD en proceso necesita ver los datos ya cargados. En el PDF además se agrega una **marca de agua diagonal** ("EN PROCESO — NO VÁLIDO") en todas las páginas cuando el documento no está completo.

## 10. Estructura del XML real vs. jerarquía visual

El prop `level` del componente `Section` (`src/components/signature-components.js`) solo controla el `margin-left` visual (indentación en pantalla) — **no tiene relación con la profundidad real de anidamiento del XML**. La jerarquía visual fija es:

```
level 0: Estructura del Certificado de Origen
  level 1: Certificado de Origen Digital (CODEH)
    level 2: Certificado de Origen Digital (COD)
      level 3: Información General, Acuerdo, Exportador, Suscriptor, Facturas,
               Mercaderías, Importador, Consignatario, Transporte, Comentarios,
               Declaración
  level 1: Entidad de Certificación Emisora
  level 1: Certificación de Origen
```

Esto puede ser mucho más superficial que el XML real (que tiene `ns1:Envelope > ns1:CertOrigin > CODEH > CODExporter > COD > FormA18 > Exporter/Invoices/GoodsList/...`, ver sección 1) — **no es un problema** porque toda la extracción de datos usa `xmlData.querySelector('NombreDeTag')`, que busca por nombre de tag en **todo el subárbol sin importar la profundidad**. Verificado cargando los 6 XML reales de producción (con su anidamiento completo) sin ningún error.

## 11. El PDF exportado

Generado con `jspdf` + `jspdf-autotable`, misma lógica de negocio que la vista web (comparten `src/lib/cod-spec.js` y `src/components/signature-utils.js` — cero duplicación).

| Característica | Valor |
|---|---|
| Tamaño de página | A4 (210×297mm / 595.28×841.89pt), orientación vertical |
| Compresión | Activada (`compress: true`) |
| Autor (metadata) | `Grupo Sauken S.A. - ARGENTINA` |
| Creador (metadata) | `Visualizador COD` |
| Productor (metadata) | `jsPDF` (versión de la librería) |
| Keywords (metadata) | `cod-viewer vX.X.X` (versión de la aplicación) |
| Versión de la app visible | Pie de página de cada hoja, junto a "Desarrollado por Sauken..." — discreta, en letra chica, para no confundirse con la versión del COD |

## 12. Decisiones de seguridad deliberadas

- **El proxy (`/api/proxy`) no tiene allowlist de host ni de esquema, a propósito**: los certificados XML pueden estar alojados en cualquier red, interna o externa, según el emisor. Esto está documentado con un comentario en el propio código para que no se "corrija" por error en el futuro.
- El proxy sí valida `Content-Type` de la respuesta remota (sección 6) y el código HTTP (`response.ok`) — pero no restringe a qué *host* se puede apuntar.

## 13. Deuda conocida / pendiente explícito

- **Sin validar contra XSD** (sección 6) — pausado a pedido explícito del dueño del proyecto.
- **Firmas**: se verifica integridad criptográfica real desde v1.2.0 (sección 8), pero sigue sin validarse la cadena de confianza del certificado ni su estado de revocación (OCSP/CRL) — deliberado, no hay plan de agregarlo.
- Actualizaciones mayores de dependencias (React 18→19, Tailwind 3→4, etc.) diferidas a propósito — no hay apuro, se evalúan cuando haga falta una funcionalidad que las requiera.

**Resuelto desde la redacción original de esta sección** (dejado como referencia histórica): la falta de tests automatizados (v1.1.0, sección de tests en el `README`), el `Access-Control-Allow-Origin: *` global en `next.config.js` (removido, ver CHANGELOG v1.2.0), y `UnloadingPortName` (sección 4 — confirmado que nunca se usa, bajado a O en toda la tabla).
