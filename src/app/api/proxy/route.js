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

        if (!response.ok) {
            return NextResponse.json(
                { error: `El servidor remoto respondió con estado ${response.status}` },
                { status: 502 }
            );
        }

        // No exigimos que declare "xml" (algunos servidores lo sirven como text/plain u
        // octet-stream), pero descartamos los tipos que claramente no son XML.
        const contentType = response.headers.get('content-type') || '';
        if (/html|json|image\/|video\/|audio\/|pdf/i.test(contentType)) {
            return NextResponse.json(
                { error: `El recurso remoto no parece ser un XML (Content-Type: ${contentType})` },
                { status: 502 }
            );
        }

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
