# COD Viewer

Visualizador de Certificados de Origen Digital (COD) ALADI/MERCOSUR. Carga un XML de certificado, valida sus campos según la versión y el acuerdo comercial correspondiente, y permite exportar el resultado a PDF.

Desarrollado por [Sauken](https://sauken.com.ar/) para [Certificados de Origen](https://certificadoorigen.com.ar/).

## Qué hace

- Carga un XML de COD desde el disco, o automáticamente vía el parámetro `?xmlUri=<url>` en la URL (por ejemplo `http://localhost:3000/?xmlUri=https://ejemplo.com/certificado.xml`). En este segundo caso el XML se trae a través de `/api/proxy`, una ruta interna que evita problemas de CORS al pedirlo desde el navegador.
- Muestra cada campo del certificado marcando si es **obligatorio**, **opcional** o **no corresponde**, según la combinación de versión del COD (`CODVer`) y acuerdo comercial (`AgreementAcronym`). Esas reglas están tabuladas en [`src/components/xml-specifications.js`](src/components/xml-specifications.js).
- Verifica si existen firmas digitales (XMLDSig) sobre los elementos `COD` y `CODEH` del XML y muestra el algoritmo y el firmante. **No valida criptográficamente la firma** — solo informa si está presente.
- Exporta el certificado visualizado a PDF (`jspdf` + `jspdf-autotable`).

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
    CODViewer.jsx            # componente principal: carga, parsea y renderiza el certificado
    pdf-generator.js         # generación del PDF equivalente a lo que se ve en pantalla
    signature-components.js  # UI y lógica de presentación de campos y firmas
    signature-utils.js       # verificación (no validación) de firmas XMLDSig
    xml-specifications.js    # tabla de reglas M/O/NC por versión y acuerdo
    country-codes.js         # mapeo de códigos de país a nombre
  lib/
    cod-spec.js               # lógica de negocio compartida entre CODViewer y pdf-generator
                               # (requerimiento de campo, prioridad Value/FOB, etc.)
```

## Notas para quien retoque el código

- Las reglas de qué campo es obligatorio/opcional/no-corresponde viven en `src/lib/cod-spec.js` y se alimentan de los datos de `xml-specifications.js`. Tanto la vista en pantalla como el PDF exportado usan ese mismo módulo — si se agrega una versión o un acuerdo nuevo, alcanza con actualizar `xml-specifications.js`.
- `AGREEMENT_MAPPING` (en `src/lib/cod-spec.js`) remapea acuerdos "hijos" (A13, A14, A57) a A18 para efectos de validación.
- `AGENTS.md` / `CLAUDE.md` en la raíz los regenera automáticamente Next.js en cada `next dev` (apuntan a la documentación embebida en `node_modules/next/dist/docs/`); es un archivo del framework, no hace falta tocarlo.

## Licencia

Este proyecto está licenciado bajo la GNU General Public License v2.0 — ver [LICENSE](LICENSE).

Copyright (C) 2026 Grupo Sauken S.A.
