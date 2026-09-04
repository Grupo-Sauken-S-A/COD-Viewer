/** @type {import('next').NextConfig} */
const nextConfig = {
  // xmllint-wasm carga su .wasm relativo a su propio archivo dentro de node_modules — si
  // Next.js lo empaqueta (bundlea) para las Route Handlers, esa ruta relativa se rompe
  // (falla con ENOENT buscando el .wasm en la carpeta de build, no en node_modules). Se
  // excluye del bundling para que use require() nativo de Node y resuelva bien.
  serverExternalPackages: ['xmllint-wasm']
}

module.exports = nextConfig
