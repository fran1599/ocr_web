# OCR Local

Aplicación web estática para aplicar reconocimiento óptico de caracteres (OCR) a archivos PDF íntegramente en el navegador.

## Privacidad

Los documentos seleccionados, sus páginas y el texto reconocido no se envían a servidores. El PDF se mantiene en memoria del navegador y los recursos del motor OCR se sirven como archivos estáticos desde el mismo origen.

No se incorporan cuentas, analíticas, telemetría, almacenamiento persistente ni un backend de procesamiento.

## Funciones

- PDF escaneado a Markdown.
- PDF escaneado a PDF buscable.
- OCR en español mediante Scribe.js, WebAssembly y Web Workers.
- Procesamiento de todo el documento o de un rango de páginas.
- Progreso por páginas y registro funcional de actividad.
- Informe de páginas fallidas, sin texto o con baja confianza.
- Política automática de recursos según el tamaño del archivo.

## Compatibilidad y límites

Se recomiendan versiones actuales de Chrome, Edge, Brave o Firefox en una computadora. Safari requiere validación específica. Los dispositivos móviles se consideran experimentales para documentos grandes debido a sus límites de memoria.

- Hasta 250 MB: modo equilibrado, con hasta dos tareas OCR simultáneas.
- Entre 250 y 500 MB: modo ahorro, con una tarea OCR simultánea.
- Más de 500 MB: no se abre el documento para evitar agotar la memoria del navegador.

La confianza informada por el OCR es una estimación y no reemplaza la revisión humana.

## Desarrollo

```bash
npm install
npm run build
npm run verify
```

La publicación en GitHub Pages se realiza automáticamente mediante GitHub Actions al actualizar `main`.

## Licencia

OCR Local es una modificación e integración basada en Scribe.js. Esta versión fue modificada en septiembre de 2026 y se distribuye bajo la Licencia Pública General Affero de GNU, versión 3 (AGPL-3.0).

El programa se entrega sin garantía, en la medida permitida por la legislación aplicable. Consultá [LICENSE](LICENSE) para conocer los términos completos y [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) para las dependencias principales.
