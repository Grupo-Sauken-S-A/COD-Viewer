import { NextResponse } from 'next/server';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const url = searchParams.get('url');

        if (!url) {
            return NextResponse.json(
                { error: 'El parámetro con el URL es requerido' },
                { status: 400 }
            );
        }

        // Sin allowlist de host/esquema a propósito: los certificados XML pueden
        // estar alojados en cualquier red, interna o externa, según el emisor.
        const response = await fetch(url);
        const xmlContent = await response.text();

        return new NextResponse(xmlContent, {
            headers: {
                'Content-Type': 'text/xml',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            }
        });
    } catch (error) {
        return NextResponse.json(
            { error: 'Error al cargar el archivo XML' },
            { status: 500 }
        );
    }
}
