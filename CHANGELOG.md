# Changelog

Todos los cambios notables de este proyecto se documentan en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/),
y este proyecto sigue [Versionado Semántico](https://semver.org/lang/es/).

## [1.3.0] - 2026-09-04

### Added
- **Validación contra el XSD oficial de ALADI** (`POST /api/validate-xsd`, vía `xmllint-wasm`): valida el certificado contra el esquema que le corresponde según su versión (`1.8.0`→XSD de `1.8.2`, `1.8.2`, `1.8.3`, `4.1.1`) y su etapa de emisión real (borrador/firmado por el EXP/completo — la etapa "certificado por la EH sin firma del FH" y la "anómala" no tienen XSD que las describa, así que deliberadamente no se validan). Los 9 XSD (3 versiones × 3 variantes de firma) están vendorizados en `src/lib/xsd/` — la app ignora a propósito el `xsi:schemaLocation` que trae el propio XML y siempre usa su copia local, para no depender de red ni exponerse a un SSRF resolviendo una URL que viene de un documento no confiable. No bloquea: se muestra como advertencia (`XsdValidationAlert`), igual que el resto de las validaciones de entrada — pero, a diferencia de esas, **siempre muestra un resultado explícito** (cumple / no cumple / por qué no se validó, en pantalla y en el PDF), nunca queda en silencio ni siquiera cuando el documento sí cumple el esquema. Cada error de "no cumple" indica la línea del XML donde `xmllint` lo detectó, no solo el mensaje.
- **Límite de tamaño de archivo (4 MB)**, único caso entre las validaciones de entrada que **bloquea** en vez de solo advertir (protección de recursos, no una regla de negocio de ALADI) — aplicado tanto en la carga por archivo como en `/api/proxy` (cortando la lectura del cuerpo remoto en vez de confiar en `Content-Length`).
- **Detección de BOM (Byte Order Mark)** al inicio del archivo: se advierte al usuario (sin bloquear) que un COD con BOM probablemente sea rechazado por la autoridad aduanera. El proxy pasa el cuerpo remoto en bytes crudos, sin decodificar/reencodear, para que esta detección funcione también en el camino `?xmlUri=`.

### Fixed
- `<UnloadingPortName>` pasa de M (en casi todas las combinaciones) a O en las 12 combinaciones de versión/acuerdo: confirmado por el dueño del proyecto que nunca se usa en ningún COD real de los acuerdos/versiones que maneja esta app. Sigue sin código que lo lea o lo muestre (a propósito); el cambio evita que se marque como "dato inesperado" si alguna vez aparece con contenido.
- `<EHFax>` pasa de NC a O en las 12 combinaciones de versión/acuerdo para 4.1.1 (corrige el fix de v1.2.0, que lo había dejado en NC). El sistema de gestión de certificados de Sauken tenía un bug (en proceso de corrección) que lo incluía en COD 4.1.1 aunque ALADI lo marca NC para esa versión — el XSD real lo acepta sin error, y ya existen muchos COD 4.1.1 emitidos con este dato que no van a dejar de existir. Mismo tratamiento que `CertificateControlCode`. `ExporterFax`/`ImporterFax` siguen NC en 4.1.1 — no les aplica este caso.

## [1.2.0] - 2026-09-03

### Added
- Suite de tests automatizados (Vitest + jsdom): `src/lib/cod-spec.js`, `src/lib/input-validation.js` y `src/components/signature-utils.js` con casos sintéticos y contra COD reales de producción; test de humo de `pdf-generator.js`; test de pipeline de carga (`test/pipeline.test.js`) que replica `CODViewer.processXML()`. Los COD reales usados como fixtures no se publican en el repo (van en `test/fixtures/real/`, gitignorado) por contener datos reales de exportadores y firmantes — los tests que los necesitan se saltan solos si el directorio no existe.
- **Verificación criptográfica real de integridad de firma** (`POST /api/verify-signature-integrity`, vía `xml-crypto`): recalcula el digest del contenido firmado (aplicando la canonicalización XML declarada — C14N/exclusive-C14N — y el transform `enveloped-signature`) y verifica `SignatureValue` contra la clave pública del certificado embebido. Antes, la app solo comprobaba presencia y vigencia del certificado — si alguien editaba un campo firmado después de firmarlo, seguía mostrando "Firma digital presente" sin detectarlo. Ahora, si el contenido fue modificado después de firmado, la firma se marca en rojo con una alerta explícita ("el documento fue modificado después de haber sido firmado... debe considerarse INVÁLIDA"), tanto en pantalla como en el PDF. Corre server-side porque requiere canonicalización XML, sin equivalente nativo en el navegador. Verificado con tests automatizados que editan un COD real después de "firmado" y confirman que la app lo detecta — incluyendo que alterar datos de la EH invalida solo la firma del Funcionario Habilitado, no la del Exportador, consistente con el mecanismo de emisión real.

### Fixed
- `<CertificateControlCode>` pasa de NC a O para A18/4.1.1: el Rev13 de ALADI lo marca como no correspondiente, pero el XSD real de 4.1.1 sí lo acepta (generaba una falsa alerta de "dato inesperado" contra un COD real en producción).
- `<EHFax>`, `<ExporterFax>` e `<ImporterFax>` pasan a NC en los 3 acuerdos para 4.1.1: esos campos ya no existen en el XSD de esa versión — la tabla tenía A35/A72 en O por arrastre de las versiones 1.8.x.

### Removed
- El bloque `headers()` de `next.config.js` que agregaba `Access-Control-Allow-Origin: "*"` (y otros headers CORS) a todas las rutas. No tenía ningún efecto sobre la carga de `?xmlUri=` de cualquier dominio (eso ya funciona vía `/api/proxy`, un fetch server-to-server que nunca estuvo sujeto a CORS) — solo habilitaba que sitios de terceros llamaran a los endpoints de cod-viewer desde el navegador de sus propios visitantes. Combinado con que el proxy no tiene allowlist de host a propósito, ampliaba la superficie de abuso tipo SSRF sin aportar nada al caso de uso real. Verificado contra un COD real en producción (`viewcod.certificadoorigen.com.ar`) antes y después del cambio: comportamiento idéntico.

### Docs
- `docs/BUSINESS_RULES.md` aclara que A13/A14/A57 siguen siendo acuerdos del sector automotriz (eso no cambió); lo que se unificó con el ROM fue el formulario y las validaciones M/O/NC, no las Normas de Origen de cada acuerdo, que siguen siendo distintas. Esta app no valida Normas de Origen.

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
