# COD Viewer

Visualizador de Certificados de Origen Digital (COD) ALADI/MERCOSUR. Carga un XML de certificado, valida sus campos según la versión y el acuerdo comercial correspondiente, y permite exportar el resultado a PDF.

Desarrollado por [Sauken](https://sauken.com.ar/) para [Certificados de Origen](https://certificadoorigen.com.ar/).

## Qué hace

- Carga un XML de COD desde el disco, o automáticamente vía el parámetro `?xmlUri=<url>` en la URL (por ejemplo `http://localhost:3000/?xmlUri=https://ejemplo.com/certificado.xml`). En este segundo caso el XML se trae a través de `/api/proxy`, una ruta interna que evita problemas de CORS al pedirlo desde el navegador.
- Valida el archivo de entrada: codificación UTF-8, versión y acuerdo reconocidos, estructura básica del COD, `Content-Type` de la URL remota — avisa sin bloquear la vista.
- Muestra cada campo del certificado marcando si es **obligatorio**, **opcional** o **no corresponde**, según la combinación de versión del COD (`CODVer`) y acuerdo comercial (`AgreementAcronym`). Esas reglas están tabuladas en [`src/components/xml-specifications.js`](src/components/xml-specifications.js), documentadas en detalle en [`docs/BUSINESS_RULES.md`](docs/BUSINESS_RULES.md).
- Avisa si aparecen campos con datos que no corresponden al acuerdo/versión del certificado.
- Verifica las firmas digitales (XMLDSig) de los elementos `COD` y `CODEH`: algoritmo, firmante, y si el certificado estaba vigente en el momento real de esa firma (no en el momento de mirarlo). **No valida criptográficamente la firma** ni su revocación — solo informa presencia y vigencia temporal.
- Detecta en qué etapa del proceso de emisión está el COD (borrador, firmado por el Exportador, certificado por la Entidad Habilitada, completo) y lo avisa si no está terminado.
- Exporta el certificado visualizado a PDF (`jspdf` + `jspdf-autotable`), A4, comprimido, con la versión de la app en el pie de página.

## Más documentación

- [`docs/DEVELOPER_GUIDE.md`](docs/DEVELOPER_GUIDE.md) — qué es un COD, cómo se construye y firma, cómo lo interpreta esta app. Punto de entrada conceptual para quien no conozca el dominio.
- [`docs/BUSINESS_RULES.md`](docs/BUSINESS_RULES.md) — referencia exhaustiva de cada regla de negocio y validación, con su fuente y su porqué.

## Requisitos

- Node.js 20 o superior.

## Instalación y uso

```bash
npm install
npm run dev
```

La app queda disponible en `http://localhost:3000`.

Otros scripts disponibles:

```bash
npm run build   # build de producción
npm run start   # sirve el build de producción
```

## Estructura del proyecto

```
src/
  app/
    api/proxy/route.js     # proxy server-side para cargar XML por URL (?xmlUri=)
    layout.js, page.js      # layout y entrada de Next.js (App Router)
  components/
    CODViewer.jsx            # componente principal: carga, valida, parsea y renderiza el certificado
    pdf-generator.js         # generación del PDF equivalente a lo que se ve en pantalla
    signature-components.js  # UI: campos y alertas (entrada, elementos inesperados, etapa de emisión)
    signature-utils.js       # firmas digitales (verificación, no validación criptográfica) + etapa de emisión
    xml-specifications.js    # tabla de reglas M/O/NC por versión y acuerdo
    country-codes.js         # mapeo de códigos de país a nombre
  lib/
    cod-spec.js               # lógica de negocio compartida entre CODViewer y pdf-generator
                               # (requerimiento de campo, prioridad Value/FOB, etc.)
    input-validation.js       # validaciones de codificación y estructura del XML de entrada
    app-version.js            # versión de la app (package.json), para mostrarla sin confundirla con CODVer
```

## Notas para quien retoque el código

- Las reglas de qué campo es obligatorio/opcional/no-corresponde viven en `src/lib/cod-spec.js` y se alimentan de los datos de `xml-specifications.js`. Tanto la vista en pantalla como el PDF exportado usan ese mismo módulo — si se agrega una versión o un acuerdo nuevo, alcanza con actualizar `xml-specifications.js`.
- `AGREEMENT_MAPPING` (en `src/lib/cod-spec.js`) remapea acuerdos "hijos" (A13, A14, A57) a A18 para efectos de validación.
- `AGENTS.md` / `CLAUDE.md` en la raíz los regenera automáticamente Next.js en cada `next dev` (apuntan a la documentación embebida en `node_modules/next/dist/docs/`); es un archivo del framework, no hace falta tocarlo.

## Licencia

Este proyecto está licenciado bajo la GNU General Public License v2.0 — ver [LICENSE](LICENSE).

Copyright (C) 2026 Grupo Sauken S.A.
