import './globals.css'

export const metadata = {
  title: 'Visualizador COD',
  description: 'Visualizador de Certificados de Origen Digital',
}

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body className="bg-gray-50">
        <div className="min-h-screen">
          <main className="container mx-auto px-4 py-8">
            {children}
          </main>
        </div>
      </body>
    </html>
  )
}
