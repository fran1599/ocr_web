# Pruebas paralelas

Este directorio contiene versiones experimentales publicadas junto con OCR Local, sin reemplazar la aplicación estable de la raíz.

## v1

URL: <https://fran1599.github.io/ocr_web/pruebas/v1/>

Objetivos de la prueba:

- comparar perfiles de uso de recursos;
- observar mejor los procesos prolongados;
- validar documentos de cientos de páginas;
- evaluar modo oscuro y temas;
- mejorar la explicación de páginas problemáticas.

### Perfiles

- **Ahorro:** una tarea OCR simultánea.
- **Equilibrado:** hasta dos tareas OCR simultáneas.
- **Turbo:** entre dos y cuatro tareas, calculadas de forma conservadora según lo que informa el navegador.

La calidad del reconocimiento no cambia entre perfiles. Turbo sólo modifica el paralelismo.

### Caso de validación de 541 páginas

En la revisión de un documento real de 541 páginas, el PDF buscable conservó las 541 páginas y añadió texto recuperable en 540. La página restante estaba realmente en blanco. Dos páginas fueron señaladas con confianza baja:

- una página estaba físicamente girada dentro del PDF, aunque compartía metadatos de rotación con otras páginas correctas;
- otra era una portada con composición gráfica y muy poco texto convencional.

Esto confirma que una advertencia de confianza baja no equivale siempre a un fallo del motor. La rotación automática tampoco debe aplicarse indiscriminadamente, porque puede perjudicar páginas correctas o dobles páginas escaneadas.

### Limitaciones conocidas

- La versión v1 todavía no corrige automáticamente páginas giradas.
- La estimación restante se estabiliza después de las primeras páginas y puede variar según su complejidad.
- Mantener la pantalla activa depende del navegador y puede ser revocado por el sistema.
- La exportación de un PDF buscable grande puede producir un pico de memoria después de finalizar el OCR.
