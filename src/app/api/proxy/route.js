import { NextResponse } from 'next/server';
import { MAX_XML_SIZE_BYTES } from '@/lib/input-validation';

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

        // Content-Length no es confiable (puede faltar o venir mal informado por el
        // servidor remoto) — sirve como rechazo rápido, pero el límite real se aplica
        // mientras se lee el cuerpo, ya que no hay allowlist de host que acote esto de otra forma.
        const contentLengthHeader = response.headers.get('content-length');
        if (contentLengthHeader && Number(contentLengthHeader) > MAX_XML_SIZE_BYTES) {
            return NextResponse.json(
                { error: 'El recurso remoto supera el tamaño máximo permitido (4 MB).' },
                { status: 413 }
            );
        }

        // Se pasa el cuerpo tal cual (bytes crudos, sin decodificar/reencodear como texto)
        // para no perder un eventual BOM en el camino — el cliente lo detecta él mismo
        // (ver decodeXmlBytes en input-validation.js) sobre estos mismos bytes.
        const reader = response.body.getReader();
        const chunks = [];
        let totalBytes = 0;
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            totalBytes += value.byteLength;
            if (totalBytes > MAX_XML_SIZE_BYTES) {
                reader.cancel();
                return NextResponse.json(
                    { error: 'El recurso remoto supera el tamaño máximo permitido (4 MB).' },
                    { status: 413 }
                );
            }
            chunks.push(value);
        }
        const bodyBuffer = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));

        return new NextResponse(bodyBuffer, {
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
