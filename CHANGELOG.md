# Changelog

Todos los cambios notables de este proyecto se documentan en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/),
y este proyecto sigue [Versionado Semántico](https://semver.org/lang/es/).

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
