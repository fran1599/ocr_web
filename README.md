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

## Versión experimental

La versión estable se publica en la raíz del sitio. La prueba paralela se publica en [`/pruebas/v1/`](https://fran1599.github.io/ocr_web/pruebas/v1/) y no modifica el flujo de la versión estable.

La prueba v0.2 —publicada en la ruta histórica `/pruebas/v1/` para no romper enlaces guardados— incorpora:

- auditoría previa por página para reutilizar texto seleccionable, reservar el OCR para páginas que lo necesitan e identificar páginas aparentemente en blanco;
- opción para forzar OCR en todas las páginas cuando la capa de texto existente sea incorrecta;
- selección manual entre Ahorro, Equilibrado y Turbo;
- límite Turbo dinámico según los procesadores lógicos y, cuando el navegador lo informa, la memoria aproximada;
- tiempo transcurrido y estimación restante;
- opción para mantener la pantalla activa durante procesos largos;
- advertencia específica para documentos de más de 400 páginas;
- modo oscuro y temas visuales accesibles;
- explicaciones más precisas para páginas sin texto o con confianza baja.

Turbo aumenta el paralelismo del OCR, pero no controla ventiladores, voltajes ni configuraciones físicas del equipo. Puede aumentar el consumo, la temperatura y el uso de memoria. No elimina el límite máximo de 500 MB.

## Compatibilidad y límites

Se recomiendan versiones actuales de Chrome, Edge, Brave o Firefox en una computadora. Safari requiere validación específica. Los dispositivos móviles se consideran experimentales para documentos grandes debido a sus límites de memoria.

- Hasta 250 MB: modo equilibrado, con hasta dos tareas OCR simultáneas.
- Entre 250 y 500 MB: modo ahorro, con una tarea OCR simultánea.
- Más de 500 MB: no se abre el documento para evitar agotar la memoria del navegador.

La confianza informada por el OCR es una estimación y no reemplaza la revisión humana.

La auditoría previa detecta presencia y legibilidad estructural del texto. No puede garantizar que una capa OCR preexistente sea semánticamente correcta; ante dudas debe utilizarse **Forzar OCR en todas**.

La cantidad de páginas también importa: un archivo liviano con cientos de páginas puede exigir más memoria y tiempo que otro archivo más pesado pero corto. Para documentos extensos se recomienda probar primero un rango representativo.

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
