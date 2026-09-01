# OCR Local

Prueba de concepto de OCR de PDF que se ejecuta íntegramente en el navegador.

## Privacidad

Los documentos seleccionados, sus páginas y el texto reconocido no se envían a servidores. El PDF se mantiene en memoria del navegador y los recursos del motor OCR se sirven como archivos estáticos desde el mismo origen.

## Funciones iniciales

- PDF escaneado a Markdown.
- PDF escaneado a PDF buscable.
- OCR en español mediante Scribe.js y WebAssembly.
- Procesamiento con Web Workers.
- Sin backend, cuentas, analíticas ni almacenamiento persistente.

## Desarrollo

```bash
npm install
npm run dev
```

La publicación en GitHub Pages se realiza automáticamente mediante GitHub Actions.

## Licencia

Este proyecto utiliza Scribe.js, distribuido bajo AGPL-3.0. El código de esta prueba de concepto se publica bajo la misma licencia.
