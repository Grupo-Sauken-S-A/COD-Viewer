# Changelog

Todos los cambios notables de este proyecto se documentan en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/),
y este proyecto sigue [Versionado Semántico](https://semver.org/lang/es/).

## [Unreleased]

### Added
- Suite de tests automatizados (Vitest + jsdom): `src/lib/cod-spec.js`, `src/lib/input-validation.js` y `src/components/signature-utils.js` con casos sintéticos y contra COD reales de producción; test de humo de `pdf-generator.js`; test de pipeline de carga (`test/pipeline.test.js`) que replica `CODViewer.processXML()`. Los COD reales usados como fixtures no se publican en el repo (van en `test/fixtures/real/`, gitignorado) por contener datos reales de exportadores y firmantes — los tests que los necesitan se saltan solos si el directorio no existe.

### Removed
- El bloque `headers()` de `next.config.js` que agregaba `Access-Control-Allow-Origin: "*"` (y otros headers CORS) a todas las rutas. No tenía ningún efecto sobre la carga de `?xmlUri=` de cualquier dominio (eso ya funciona vía `/api/proxy`, un fetch server-to-server que nunca estuvo sujeto a CORS) — solo habilitaba que sitios de terceros llamaran a los endpoints de cod-viewer desde el navegador de sus propios visitantes. Combinado con que el proxy no tiene allowlist de host a propósito, ampliaba la superficie de abuso tipo SSRF sin aportar nada al caso de uso real. Verificado contra un COD real en producción (`viewcod.certificadoorigen.com.ar`) antes y después del cambio: comportamiento idéntico.

## [1.1.0] - 2026-09-03

### Added
- Detección de la etapa de emisión del COD (borrador, firmado por el Exportador, certificado por la Entidad Habilitada, completo) con alerta visible en pantalla y en el PDF, y marca de agua diagonal en el PDF cuando el documento no está completo.
- Validaciones previas al procesamiento del XML: versión o acuerdo no reconocidos, estructura básica faltante (`<COD id="COD">`/`<CODEH id="CODEH">`), codificación distinta a UTF-8, caracteres de reemplazo (`�`), y validación del `Content-Type` de la respuesta remota en el proxy (`?xmlUri=`).
- Estado de firmas digitales enriquecido: algoritmo de firma real además del de digest (marca RSA-SHA1 como débil/obsoleto), vigencia del certificado X.509 comparada contra la fecha real de cada firma (`DeclarationDate` para el Exportador, `CertificateDate` para la Entidad Habilitada — nunca contra la fecha de hoy), detección de firmas duplicadas para el mismo elemento, y cruce de `CODSubmitterType` contra "EXP".
- Alerta en rojo cuando un certificado no estaba vigente al momento de la firma, distinta de las advertencias menores (algoritmo débil, firmas duplicadas).
- Campo `<ThirdOpCity>` ("Ciudad") en la sección Tercer Operador — el único campo de esa familia sin equivalente `Op3c`, confirmado contra la documentación oficial de ALADI.
- Alerta de "elementos con datos inesperados": detecta campos con contenido en el XML que, según la especificación, no corresponden al acuerdo/versión del certificado.
- Etiquetas "Exportador (EXP)" / "Funcionario Habilitado (FH)" en el estado de firmas, reflejando los roles reales del mecanismo de emisión.
- Versión de la aplicación (`package.json`, distinta de `CODVer`) visible de forma discreta en pantalla y en el PDF (pie de página + metadata), desde un único punto de verdad en `src/lib/app-version.js`.
- `docs/BUSINESS_RULES.md` (referencia exhaustiva de reglas de negocio y validaciones) y `docs/DEVELOPER_GUIDE.md` (guía narrativa de onboarding), pensados también para que otros agentes de IA los lean antes de tocar esta lógica.
- La nota de "no se realizan validaciones criptográficas" ahora sugiere S-FiDE como aplicación alternativa para validar la firma.

### Changed
- El PDF ahora se genera comprimido (`compress: true`) — mismo contenido, archivos notablemente más livianos.

### Fixed
- `Op3cStatement` para A72 en versiones 1.8.x estaba marcado como no correspondiente (`NC`) cuando en la práctica es opcional — corregido contra un XML real.
- Bug en el parser ASN.1 del certificado X.509 que hacía que la vigencia nunca se calculara correctamente (leía un campo equivocado de la estructura DER).
- Las fechas de referencia de las firmas se interpretaban en hora local en vez de UTC, pudiendo desalinearlas contra las fechas del certificado.
- El proxy aceptaba respuestas `text/html` como si fueran XML por un error en la validación de `Content-Type`.
- Falta de `flex-1`/`min-w-0` en las alertas de firma hacía que el texto de la nota se cortara en un punto distinto según la longitud de la etiqueta de cada firma.
- El texto "(Versión X - Acuerdo Y - Validado como Z)" ahora dice "Usa formulario FormZ", más preciso respecto a lo que realmente indica.
- El texto de vigencia del certificado se armaba como oraciones cortas separadas por salto de línea forzado, dando renglones de largo muy dispar; ahora es un párrafo continuo que aprovecha todo el ancho disponible, igual que la nota final. "a. m."/"p. m." usan espacio de no separación para no cortarse a mitad de la abreviatura.
- En el PDF, el ancho de línea de cada firma se medía con la fuente activa en ese momento (heredada de la sección anterior) en vez de la fuente con la que luego se dibujaba el texto, causando cortes de línea desparejos entre la firma del Exportador y la del Funcionario Habilitado.
- Nombre de la aplicación normalizado a "COD-Viewer" (antes "cod-viewer") en pantalla y PDF.

## [1.0.1] - 2026-09-02

### Changed
- Se unificó en `src/lib/cod-spec.js` la lógica de reglas de negocio (requerimiento de campo M/O/NC por versión y acuerdo, prioridad Value/FOB, prioridad EHCity/EHCityLocality) que estaba duplicada casi de forma idéntica entre `CODViewer.jsx` y `pdf-generator.js`.
- Se actualizaron a sus últimas versiones menores/patch (sin cambios de major): `@radix-ui/react-alert-dialog`, `@radix-ui/react-slot`, `tailwind-merge`, `@tailwindcss/forms`, `tailwindcss`, `autoprefixer`, `postcss`.

### Removed
- Se eliminaron los `console.log`/`console.warn` de depuración que habían quedado activos en producción (exponían versión, acuerdo y requerimiento de cada campo del certificado en la consola del navegador).

### Docs
- Se agregaron `README.md`, `LICENSE` (GPL v2) y este `CHANGELOG.md`.

## [1.0.0] - 2026-09-01

### Added
- Importación inicial del proyecto (copia de la versión en producción) para desarrollo local en Windows.

### Fixed
- Se corrigieron 15 vulnerabilidades reportadas por `npm audit` (2 críticas), incluyendo el bump coordinado de `jspdf` 3→4 y `jspdf-autotable` a 5.0.8 por incompatibilidad de peer dependency.
