# Guía técnica para desarrolladores — cod-viewer

Esta guía explica de qué se trata la aplicación, qué es un COD, cómo se construye y firma, y cómo cod-viewer lo interpreta y valida. Es el punto de entrada conceptual del proyecto — para el detalle exhaustivo de cada regla, con su fuente y su porqué, ver [`BUSINESS_RULES.md`](BUSINESS_RULES.md). Para instalación, scripts y estructura de carpetas, ver el [`README`](../README.md).

## 1. Qué es esta aplicación

**cod-viewer** es un visualizador de **Certificados de Origen Digital (COD)** — el equivalente electrónico de los certificados de origen en papel que exige ALADI (Asociación Latinoamericana de Integración) para el comercio exterior entre sus países miembros bajo distintos acuerdos comerciales (ACE 18, ACE 35, ACE 72, etc.).

La aplicación toma un archivo XML de COD (subido a mano o vía URL), lo interpreta según reglas que dependen de su **versión** y **acuerdo comercial**, muestra sus datos marcando qué es obligatorio/opcional/no aplica, informa el estado de sus firmas digitales y en qué etapa del proceso de emisión se encuentra, y permite exportar todo eso a PDF.

**No es** una herramienta de validación criptográfica de firmas ni de validación contra el XSD oficial de ALADI — ambas cosas están fuera de alcance a propósito (ver §4 y [`BUSINESS_RULES.md` §13](BUSINESS_RULES.md#13-deuda-conocida--pendiente-explícito)).

## 2. Qué es un COD, en concepto

Un COD es un archivo XML UTF-8 con una estructura definida por ALADI, que contiene esencialmente lo mismo que un formulario de certificado de origen en papel: quién exporta, qué mercadería, a quién se le exporta, bajo qué acuerdo comercial y con qué norma de origen. A diferencia del papel, un COD se **firma digitalmente dos veces**, por dos actores distintos, en dos momentos distintos:

- **El Exportador (EXP)** carga los datos y firma el elemento `<COD id="COD">` del XML.
- **Un Funcionario Habilitado (FH)**, de una Entidad Habilitada (EH) autorizada por ALADI, agrega los datos de certificación (fecha de emisión, código de control, número de certificado) y firma el elemento `<CODEH id="CODEH">`, que abarca todo el documento — incluida la firma del Exportador.

Este mecanismo de dos firmas en dos momentos es la clave para entender casi todo lo demás: por qué el XML tiene la forma que tiene, por qué las validaciones de firma comparan contra fechas distintas para cada una, y por qué existe el concepto de "COD en proceso" (un archivo que todavía no pasó por las 4 etapas). El detalle completo, con el XML real de ejemplo en cada etapa, está en [`BUSINESS_RULES.md` §1](BUSINESS_RULES.md#1-qué-es-un-cod-y-cómo-se-construye).

## 3. Versión y acuerdo: los dos ejes de todas las reglas

Casi toda la lógica de esta app gira en torno a dos datos que trae el propio XML:

- **`<CODVer>`**: la versión del estándar COD (hoy: `1.8.0`, `1.8.2`, `1.8.3`, `4.1.1`).
- **`<AgreementAcronym>`**: el acuerdo comercial bajo el que se emite (`A18`, `A35`, `A72`, y los "hijos" `A13`/`A14`/`A57` que se validan como `A18`).

Cruzando estos dos valores, una tabla de 76 elementos (`src/components/xml-specifications.js`) dice, para cada campo del certificado, si es **M**andatorio, **O**pcional o **N**o **C**orresponde — y de eso depende si el campo se muestra, si se resalta como obligatorio, o si se oculta directamente. Ver [`BUSINESS_RULES.md` §2-4](BUSINESS_RULES.md#2-versiones-de-cod) para el detalle de versiones, el mapeo de acuerdos (y por qué A13/A14/A57 validan como A18) y la tabla completa.

## 4. Firmas digitales: qué se verifica y qué no

cod-viewer verifica la **presencia** de las dos firmas (por `Reference URI="#COD"` / `="#CODEH"`), el algoritmo usado, y si el certificado del firmante estaba dentro de su período de vigencia **en el momento real de esa firma** (no en el momento en que alguien abre el certificado para mirarlo — un detalle importante, explicado en detalle en [`BUSINESS_RULES.md` §8](BUSINESS_RULES.md#8-firmas-digitales)).

Lo que **no** hace, y lo aclara explícitamente en la propia interfaz: no recalcula el hash del contenido firmado, no valida la cadena de confianza del certificado contra una Autoridad Certificante, y no consulta si el certificado fue revocado. Es decir: informa si la firma existe y si el certificado era temporalmente válido, no si la firma es criptográficamente correcta ni si el certificado seguía siendo confiable en ese momento.

## 5. La etapa de emisión

Como el COD se construye en 4 pasos (§2), un archivo puede llegar a esta app en cualquier punto intermedio del proceso — no necesariamente terminado. La app detecta en cuál de las 4 etapas está (o si el orden de firmas es inconsistente) y lo avisa de forma bien visible, sin ocultar el resto de los datos ya cargados. En el PDF exportado, además, un documento incompleto lleva una marca de agua diagonal. Detalle en [`BUSINESS_RULES.md` §9`](BUSINESS_RULES.md#9-etapa-de-emisión-del-cod).

## 6. Cómo está organizado el código

```
src/
  app/
    api/proxy/route.js       # trae un XML por URL server-side (evita CORS); valida
                              # el Content-Type de la respuesta antes de aceptarla
    layout.js, page.js        # shell de Next.js (App Router)
  components/
    CODViewer.jsx              # componente principal: carga el XML, corre las
                                # validaciones y arma la vista
    pdf-generator.js           # genera el PDF con la misma lógica de negocio
    signature-components.js    # UI: campos, alertas (validación de entrada,
                                # elementos inesperados, etapa de emisión)
    signature-utils.js         # firmas digitales + etapa de emisión (sin UI)
    xml-specifications.js      # la tabla M/O/NC (76 elementos × versión × acuerdo)
    country-codes.js           # códigos de país → nombre
  lib/
    cod-spec.js                 # reglas de requerimiento de campo + alternancia,
                                 # compartido entre CODViewer y pdf-generator
    input-validation.js         # validaciones de codificación/estructura del XML
    app-version.js              # versión de la app (de package.json), para mostrarla
                                 # en pantalla y en el PDF sin confundirla con CODVer
```

**Principio de diseño a mantener**: toda regla de negocio (qué campo mostrar, cómo interpretar una firma, en qué etapa está el COD) vive en `src/lib/` o en `signature-utils.js`, y se consume **igual** desde la vista web y desde el generador de PDF — nunca duplicada entre los dos. Si al agregar algo se termina escribiendo la misma lógica dos veces, es señal de que debería vivir en uno de esos módulos compartidos en cambio.

## 7. Extracción de datos del XML: por nombre de tag, no por ruta

El XML real de un COD tiene bastante más anidamiento del que sugiere la interfaz (ver la estructura completa en [`BUSINESS_RULES.md` §1](BUSINESS_RULES.md#1-qué-es-un-cod-y-cómo-se-construye) y la nota sobre jerarquía visual en [§10](BUSINESS_RULES.md#10-estructura-del-xml-real-vs-jerarquía-visual)). La app no navega esa estructura por rutas fijas — usa `xmlData.querySelector('NombreDeTag')`, que encuentra el elemento sin importar cuántos padres tenga en el medio. Esto simplifica mucho el código, pero también significa que si ALADI reutiliza algún día el mismo nombre de tag en dos contextos distintos dentro del mismo documento, `querySelector` tomaría el primero que encuentre — algo a tener presente si se agrega soporte para una estructura nueva.

## 8. Por dónde seguir

- Para tocar reglas de qué campo se muestra/oculta: `src/lib/cod-spec.js` + `src/components/xml-specifications.js`, y leer [`BUSINESS_RULES.md` §4-5](BUSINESS_RULES.md#4-la-tabla-de-requerimientos-moNC) antes de cambiar nada — varias reglas tienen una razón regulatoria no obvia detrás.
- Para tocar validaciones de entrada o de firmas: `src/lib/input-validation.js` / `src/components/signature-utils.js`, y [`BUSINESS_RULES.md` §6-9](BUSINESS_RULES.md#6-validaciones-sobre-el-archivo-xml-de-entrada).
- Para instalar, correr o entender la estructura de carpetas: [`README.md`](../README.md).
