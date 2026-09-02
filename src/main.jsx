import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const MEBIBYTE = 1024 * 1024;
const BALANCED_MAX_BYTES = 250 * MEBIBYTE;
const MAX_BYTES = 500 * MEBIBYTE;
const LOW_CONFIDENCE_THRESHOLD = 60;
const REPOSITORY_URL = 'https://github.com/fran1599/ocr_web';
let scribeInstance = null;
let activeWorkerN = null;

function getResourceProfile(bytes) {
  if (bytes > BALANCED_MAX_BYTES) {
    return {
      key: 'saving',
      label: 'Modo ahorro automático',
      workerLimit: 1,
      explanation: 'El archivo supera 250 MB. Se procesará una página a la vez para reducir el pico de memoria; puede demorar más.',
    };
  }
  return {
    key: 'balanced',
    label: 'Modo equilibrado',
    workerLimit: 2,
    explanation: 'Usa hasta dos tareas OCR simultáneas para equilibrar velocidad, memoria y capacidad de respuesta.',
  };
}

function getWorkerCount(profile) {
  const available = navigator.hardwareConcurrency || 4;
  return Math.max(1, Math.min(profile.workerLimit, available - 1));
}

function getCompatibility() {
  const missing = [];
  if (!('Worker' in window)) missing.push('Web Workers');
  if (!('WebAssembly' in window)) missing.push('WebAssembly');
  if (!('File' in window) || !('FileReader' in window)) missing.push('File API');
  if (!('Blob' in window) || !('ArrayBuffer' in window)) missing.push('manejo local de archivos');
  if (!window.URL?.createObjectURL) missing.push('descargas locales');

  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  return {
    supported: missing.length === 0,
    mobile,
    missing,
  };
}

const assetBase = new URL(import.meta.env.BASE_URL, window.location.origin);

async function loadScribe(workerN) {
  if (!scribeInstance) {
    const moduleUrl = new URL('scribe/scribe.js', assetBase).href;
    const module = await import(/* @vite-ignore */ moduleUrl);
    scribeInstance = module.default;
  }
  if (activeWorkerN !== null && activeWorkerN !== workerN) {
    await scribeInstance.terminate();
  }
  scribeInstance.opt.workerN = workerN;
  activeWorkerN = workerN;
  return scribeInstance;
}

function baseName(name) {
  return name.replace(/\.pdf$/i, '').replace(/[\\/:*?"<>|]+/g, '-');
}

function humanSize(bytes) {
  return bytes < MEBIBYTE
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / MEBIBYTE).toFixed(1)} MB`;
}

function selectedPageIndices(pageCount, mode, start, end) {
  if (!pageCount) return [];
  if (mode === 'all') return Array.from({ length: pageCount }, (_, index) => index);
  const first = Number(start);
  const last = Number(end);
  if (!Number.isInteger(first) || !Number.isInteger(last) || first < 1 || last > pageCount || first > last) return [];
  return Array.from({ length: last - first + 1 }, (_, index) => first - 1 + index);
}

function warningText(value) {
  if (value && typeof value === 'object' && 'message' in value) return String(value.message);
  return String(value ?? 'Advertencia sin detalle');
}

function warningPage(value, raw) {
  if (value && typeof value === 'object' && Number.isInteger(value.page)) return value.page;
  const match = raw.match(/page\s+(\d+)/i);
  return match ? Number(match[1]) : null;
}

function analyzeQuality(doc, pageIndices, failedPages) {
  return pageIndices.map((pageIndex) => {
    if (failedPages.has(pageIndex)) {
      return { page: pageIndex + 1, type: 'failed', label: 'El motor OCR no pudo procesarla.' };
    }
    const page = doc.ocr?.active?.[pageIndex];
    const words = page?.lines?.flatMap((line) => line.words ?? []).filter((word) => String(word.text ?? '').trim()) ?? [];
    if (words.length === 0) {
      return { page: pageIndex + 1, type: 'empty', label: 'No se detectó texto.' };
    }
    const confidenceValues = words.map((word) => Number(word.conf)).filter(Number.isFinite);
    const average = confidenceValues.length
      ? confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length
      : 100;
    if (average < LOW_CONFIDENCE_THRESHOLD) {
      return {
        page: pageIndex + 1,
        type: 'low',
        label: `Reconocimiento de baja confianza (${Math.round(average)}%); conviene revisarla.`,
      };
    }
    return null;
  }).filter(Boolean);
}

function App() {
  const inputRef = useRef(null);
  const docRef = useRef(null);
  const resultUrlRef = useRef(null);
  const completedPagesRef = useRef(new Set());
  const selectedPagesRef = useRef(new Set());
  const engineWarningsRef = useRef(new Map());
  const failedPagesRef = useRef(new Set());
  const [file, setFile] = useState(null);
  const [format, setFormat] = useState('md');
  const [stage, setStage] = useState('empty');
  const [pageCount, setPageCount] = useState(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [processingTotal, setProcessingTotal] = useState(0);
  const [status, setStatus] = useState('');
  const [activity, setActivity] = useState([]);
  const [error, setError] = useState('');
  const [diagnostic, setDiagnostic] = useState('');
  const [download, setDownload] = useState(null);
  const [rangeMode, setRangeMode] = useState('all');
  const [rangeStart, setRangeStart] = useState(1);
  const [rangeEnd, setRangeEnd] = useState(1);
  const [qualityIssues, setQualityIssues] = useState([]);
  const [engineWarnings, setEngineWarnings] = useState([]);
  const compatibility = getCompatibility();

  function announce(message, record = true) {
    setStatus(message);
    if (record) {
      setActivity((previous) => [...previous, message].slice(-5));
    }
  }

  async function release() {
    if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    resultUrlRef.current = null;
    setDownload(null);
    if (docRef.current) {
      try { await docRef.current.close(); } catch { /* recursos ya liberados */ }
      docRef.current = null;
    }
  }

  useEffect(() => () => {
    if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    void docRef.current?.close?.();
    activeWorkerN = null;
    void scribeInstance?.terminate?.();
  }, []);

  function configureScribe(scribe) {
    scribe.opt.langPath = new URL('tessdata-v2', assetBase).href.replace(/\/$/, '');
    scribe.opt.progressHandler = (message) => {
      if (message?.type === 'convert' && Number.isInteger(message.n)) {
        if (selectedPagesRef.current.has(message.n)) {
          completedPagesRef.current.add(message.n);
          setCurrentPage(completedPagesRef.current.size);
          announce(`Página ${message.n + 1}: reconocimiento terminado.`);
        }
      } else if (message?.type === 'export') {
        announce('Preparando el archivo para descargar…');
      }
    };
    scribe.opt.warningHandler = (message) => {
      const raw = warningText(message);
      const pageIndex = warningPage(message, raw);
      const key = `${pageIndex ?? 'general'}:${raw}`;
      if (/recognition failed/i.test(raw) && Number.isInteger(pageIndex)) failedPagesRef.current.add(pageIndex);
      engineWarningsRef.current.set(key, {
        page: Number.isInteger(pageIndex) ? pageIndex + 1 : null,
        raw,
      });
      setEngineWarnings([...engineWarningsRef.current.values()]);
    };
    scribe.opt.errorHandler = (message) => setDiagnostic(warningText(message));
  }

  function resetReports() {
    completedPagesRef.current.clear();
    selectedPagesRef.current.clear();
    engineWarningsRef.current.clear();
    failedPagesRef.current.clear();
    setQualityIssues([]);
    setEngineWarnings([]);
    setCurrentPage(0);
    setProcessingTotal(0);
  }

  async function acceptFile(candidate) {
    await release();
    resetReports();
    setError('');
    setDiagnostic('');
    setPageCount(null);
    setActivity([]);

    if (!candidate) return;
    if (!compatibility.supported) {
      setFile(null);
      setStage('error');
      setError(`Este navegador no tiene las funciones necesarias: ${compatibility.missing.join(', ')}.`);
      return;
    }
    if (candidate.type !== 'application/pdf' && !candidate.name.toLowerCase().endsWith('.pdf')) {
      setFile(null);
      setStage('error');
      setError('Seleccioná un archivo PDF.');
      return;
    }
    if (candidate.size === 0) {
      setFile(null);
      setStage('error');
      setError('El PDF está vacío.');
      return;
    }
    if (candidate.size > MAX_BYTES) {
      setFile(null);
      setStage('error');
      setStatus('');
      setError('El archivo supera el límite de 500 MB. Para dividirlo de forma segura primero habría que cargarlo completo, lo que puede agotar la memoria del navegador. Dividilo con una herramienta local y procesá las partes por separado.');
      return;
    }

    const profile = getResourceProfile(candidate.size);
    const workerN = getWorkerCount(profile);
    setFile(candidate);
    setStage('inspecting');
    announce('Archivo recibido localmente; no se enviará a ningún servidor.');
    announce(
      profile.key === 'saving'
        ? 'Archivo grande detectado. Activando el modo ahorro…'
        : 'Analizando el PDF en este dispositivo…',
    );

    try {
      const scribe = await loadScribe(workerN);
      configureScribe(scribe);
      announce('Motor OCR cargado. Leyendo la estructura y contando las páginas…');
      const doc = await scribe.openDocument([candidate], {
        deferText: true,
        skipFontOpt: true,
        pdfWorkerN: 1,
      });
      docRef.current = doc;
      const pages = Number(doc.inputData?.pageCount ?? doc.pageMetrics?.length ?? 0);
      if (!pages) throw new Error('No se encontraron páginas en el PDF.');
      setPageCount(pages);
      setRangeMode('all');
      setRangeStart(1);
      setRangeEnd(pages);
      announce(`Documento listo: ${pages} ${pages === 1 ? 'página' : 'páginas'}. ${profile.label} activado.`);
      setStage('ready');
    } catch (cause) {
      handleError(cause);
    }
  }

  function handleError(cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    setDiagnostic(message);
    setError(
      /memory|allocation|out of bounds/i.test(message)
        ? 'No hay memoria suficiente. Probá con menos páginas o un archivo más pequeño.'
        : /password|encrypted/i.test(message)
          ? 'El PDF está protegido o cifrado y no puede procesarse.'
          : /Web Workers|WebAssembly|File API/.test(message)
            ? message
            : 'No pudimos procesar el PDF. Puede estar corrupto o usar una característica no compatible.',
    );
    setStage('error');
  }

  async function processDocument() {
    if (!file) return;
    const pagesToProcess = selectedPageIndices(pageCount, rangeMode, rangeStart, rangeEnd);
    if (pagesToProcess.length === 0) return;

    setStage('processing');
    setError('');
    setDiagnostic('');
    setActivity([]);
    resetReports();
    selectedPagesRef.current = new Set(pagesToProcess);
    setProcessingTotal(pagesToProcess.length);

    const profile = getResourceProfile(file.size);
    const workerN = getWorkerCount(profile);
    announce(`Preparando ${profile.label.toLowerCase()}…`);

    try {
      const scribe = await loadScribe(workerN);
      configureScribe(scribe);
      let doc = docRef.current;
      if (!doc) {
        announce('Leyendo nuevamente el PDF…');
        doc = await scribe.openDocument([file], { skipFontOpt: true, pdfWorkerN: 1 });
        docRef.current = doc;
      }
      const pages = Number(doc.inputData?.pageCount ?? doc.pageMetrics?.length ?? 0);
      setPageCount(pages);
      const pageMask = Array.from({ length: pages }, (_, index) => selectedPagesRef.current.has(index));
      announce(`Iniciando OCR en español para ${pagesToProcess.length} ${pagesToProcess.length === 1 ? 'página' : 'páginas'}…`);
      await doc.recognize({
        langs: ['spa'],
        ocrPages: rangeMode === 'all' ? 'all' : pageMask,
        mode: 'quality',
        skipFontOpt: true,
      });

      const issues = analyzeQuality(doc, pagesToProcess, failedPagesRef.current);
      setQualityIssues(issues);
      if (issues.length) announce(`OCR finalizado con ${issues.length} ${issues.length === 1 ? 'página para revisar' : 'páginas para revisar'}.`);
      else announce('OCR finalizado sin observaciones de calidad.');

      let blob;
      let name;
      const rangeSuffix = rangeMode === 'range' ? `-paginas-${rangeStart}-${rangeEnd}` : '';

      if (format === 'md') {
        announce('Preparando Markdown…');
        const chunks = [];
        for (const pageIndex of pagesToProcess) {
          const pageText = String(await doc.exportData('text', { pageArr: [pageIndex] })).trim();
          const issue = issues.find((item) => item.page === pageIndex + 1);
          const qualityNote = issue ? `\n<!-- Revisión recomendada: ${issue.label} -->` : '';
          chunks.push(`<!-- Página ${pageIndex + 1} -->${qualityNote}\n\n${pageText}`);
        }
        blob = new Blob(
          [`${chunks.join('\n\n---\n\n')}\n`],
          { type: 'text/markdown;charset=utf-8' },
        );
        name = `${baseName(file.name)}${rangeSuffix}-ocr.md`;
      } else {
        announce('Generando PDF buscable…');
        const bytes = await doc.exportData('pdf', {
          displayMode: 'invis',
          addOverlay: true,
          pageArr: pagesToProcess,
        });
        blob = new Blob([bytes], { type: 'application/pdf' });
        name = `${baseName(file.name)}${rangeSuffix}-buscable.pdf`;
      }

      const url = URL.createObjectURL(blob);
      resultUrlRef.current = url;
      setDownload({ url, name, pageTotal: pagesToProcess.length });
      setCurrentPage(pagesToProcess.length);
      announce('Resultado generado en memoria y listo para descargar.');
      setStage('done');
    } catch (cause) {
      handleError(cause);
    }
  }

  async function reset() {
    await release();
    setFile(null);
    setStage('empty');
    setPageCount(null);
    setRangeMode('all');
    setRangeStart(1);
    setRangeEnd(1);
    resetReports();
    setStatus('');
    setActivity([]);
    setError('');
    setDiagnostic('');
    if (inputRef.current) inputRef.current.value = '';
  }

  const rangePages = selectedPageIndices(pageCount, rangeMode, rangeStart, rangeEnd);
  const rangeInvalid = rangeMode === 'range' && rangePages.length === 0;
  const progress = processingTotal
    ? Math.min(100, Math.round((currentPage / processingTotal) * 100))
    : 0;
  const resourceProfile = getResourceProfile(file?.size ?? 0);

  return (
    <main className="shell">
      <header>
        <div className="mark" aria-hidden="true">Aa</div>
        <div>
          <h1>OCR Local</h1>
          <p>Convertí un PDF escaneado en texto, sin subirlo a internet.</p>
        </div>
      </header>

      <section className="card" aria-live="polite">
        {(stage === 'empty' || (stage === 'error' && !file)) && (
          <>
            <div className={`compatibility ${compatibility.supported ? (compatibility.mobile ? 'notice' : 'ok') : 'blocked'}`} role="status">
              <strong>{compatibility.supported ? 'Navegador compatible' : 'Navegador no compatible'}</strong>
              <span>
                {!compatibility.supported
                  ? `Faltan: ${compatibility.missing.join(', ')}.`
                  : compatibility.mobile
                    ? 'En dispositivos móviles recomendamos procesar sólo documentos pequeños por sus límites de memoria.'
                    : 'Para documentos grandes recomendamos una versión actual de Chrome, Edge, Brave o Firefox en una computadora.'}
              </span>
            </div>
            <div
              className={`dropzone ${compatibility.supported ? '' : 'disabled'}`}
              role="button"
              tabIndex={compatibility.supported ? '0' : '-1'}
              aria-disabled={!compatibility.supported}
              onDrop={(event) => {
                event.preventDefault();
                if (compatibility.supported) void acceptFile(event.dataTransfer.files?.[0]);
              }}
              onDragOver={(event) => event.preventDefault()}
              onKeyDown={(event) => {
                if (compatibility.supported && (event.key === 'Enter' || event.key === ' ')) inputRef.current?.click();
              }}
              onClick={() => compatibility.supported && inputRef.current?.click()}
            >
              <div className="upload-icon" aria-hidden="true">↑</div>
              <strong>Arrastrá un PDF acá</strong>
              <span>o</span>
              <button type="button" className="secondary" disabled={!compatibility.supported}>Seleccionar PDF</button>
              <input
                ref={inputRef}
                type="file"
                accept="application/pdf,.pdf"
                onChange={(event) => void acceptFile(event.target.files?.[0])}
                hidden
              />
            </div>
            <p className="privacy">
              <span aria-hidden="true">◆</span> Procesamiento local: tus documentos no se
              suben ni se almacenan en ningún servidor.
            </p>
            <details className="limits">
              <summary>Límites y uso de recursos</summary>
              <ul>
                <li><strong>Hasta 250 MB:</strong> modo equilibrado, con hasta dos tareas OCR simultáneas.</li>
                <li><strong>Entre 250 y 500 MB:</strong> modo ahorro automático, una página a la vez y mayor demora.</li>
                <li><strong>Más de 500 MB:</strong> se solicita dividir el PDF para evitar agotar la memoria del navegador.</li>
              </ul>
            </details>
          </>
        )}

        {file && stage === 'inspecting' && (
          <div className="processing">
            <div className="spinner" aria-hidden="true" />
            <h2>Preparando documento…</h2>
            <p>{status}</p>
            <ActivityLog items={activity} />
            <small>El archivo permanece en este dispositivo.</small>
          </div>
        )}

        {file && stage === 'ready' && (
          <>
            <div className="file-row">
              <div className="pdf-icon">PDF</div>
              <div>
                <strong>{file.name}</strong>
                <span>{humanSize(file.size)} · {pageCount} {pageCount === 1 ? 'página' : 'páginas'}</span>
              </div>
              <button className="icon-button" onClick={() => void reset()} aria-label="Quitar archivo">×</button>
            </div>

            <div className={`resource-note ${resourceProfile.key}`} role="status">
              <strong>{resourceProfile.label}</strong>
              <span>{resourceProfile.explanation}</span>
            </div>

            <fieldset>
              <legend>Páginas a procesar</legend>
              <label className={rangeMode === 'all' ? 'option selected' : 'option'}>
                <input type="radio" name="pages" checked={rangeMode === 'all'} onChange={() => setRangeMode('all')} />
                <span><strong>Todo el documento</strong><small>{pageCount} {pageCount === 1 ? 'página' : 'páginas'}</small></span>
              </label>
              <label className={rangeMode === 'range' ? 'option selected' : 'option'}>
                <input type="radio" name="pages" checked={rangeMode === 'range'} onChange={() => setRangeMode('range')} />
                <span><strong>Un rango de páginas</strong><small>Útil para capítulos o secciones</small></span>
              </label>
              {rangeMode === 'range' && (
                <div className="range-fields">
                  <label>Desde <input type="number" min="1" max={pageCount} value={rangeStart} onChange={(event) => setRangeStart(event.target.value)} /></label>
                  <label>Hasta <input type="number" min="1" max={pageCount} value={rangeEnd} onChange={(event) => setRangeEnd(event.target.value)} /></label>
                  <span>{rangeInvalid ? `Ingresá un rango válido entre 1 y ${pageCount}.` : `${rangePages.length} ${rangePages.length === 1 ? 'página seleccionada' : 'páginas seleccionadas'}.`}</span>
                </div>
              )}
            </fieldset>

            <fieldset>
              <legend>Formato de salida</legend>
              <label className={format === 'md' ? 'option selected' : 'option'}>
                <input type="radio" name="format" checked={format === 'md'} onChange={() => setFormat('md')} />
                <span><strong>Markdown</strong><small>Texto simple, separado por páginas</small></span>
                <b>.md</b>
              </label>
              <label className={format === 'pdf' ? 'option selected' : 'option'}>
                <input type="radio" name="format" checked={format === 'pdf'} onChange={() => setFormat('pdf')} />
                <span><strong>PDF buscable</strong><small>Original con una capa de texto invisible</small></span>
                <b>.pdf</b>
              </label>
            </fieldset>

            <button className="primary" disabled={rangeInvalid} onClick={() => void processDocument()}>
              Procesar {rangeMode === 'range' ? 'páginas seleccionadas' : 'documento'} <span>→</span>
            </button>
          </>
        )}

        {stage === 'processing' && (
          <div className="processing">
            <div className="spinner" aria-hidden="true" />
            <h2>Procesando documento…</h2>
            <p>{status}</p>
            <div className="progress-copy">
              <span>{processingTotal ? `${currentPage} de ${processingTotal} páginas procesadas` : 'Preparando páginas'}</span>
              <span>{processingTotal ? `${progress}%` : ''}</span>
            </div>
            <div className="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={progress}>
              <i style={{ width: `${progress}%` }} />
            </div>
            <ActivityLog items={activity} />
            <div className="process-notes">
              <small>{resourceProfile.label}: {resourceProfile.key === 'saving' ? 'una página a la vez para reducir memoria.' : 'hasta dos páginas en paralelo.'}</small>
              <small>Podés seguir usando esta pestaña; mantenela abierta hasta que termine.</small>
            </div>
          </div>
        )}

        {stage === 'done' && download && (
          <div className="result">
            <div className="check" aria-hidden="true">✓</div>
            <h2>Documento procesado</h2>
            <p>{download.pageTotal} {download.pageTotal === 1 ? 'página procesada' : 'páginas procesadas'}.</p>
            {qualityIssues.length > 0 && (
              <div className="quality-report" role="status">
                <strong>{qualityIssues.length} {qualityIssues.length === 1 ? 'página requiere' : 'páginas requieren'} revisión</strong>
                <ul>
                  {qualityIssues.map((issue) => <li key={`${issue.page}-${issue.type}`}><b>Página {issue.page}:</b> {issue.label}</li>)}
                </ul>
                <small>La confianza es una estimación del motor OCR, no una garantía de exactitud.</small>
              </div>
            )}
            {qualityIssues.length === 0 && (
              <div className="quality-report good"><strong>Sin páginas problemáticas detectadas</strong><span>La revisión humana sigue siendo recomendable para material de estudio.</span></div>
            )}
            {engineWarnings.some((warning) => warning.page === null) && (
              <details className="engine-diagnostics">
                <summary>Ver advertencias adicionales del motor</summary>
                {engineWarnings.filter((warning) => warning.page === null).map((warning, index) => <code key={`${warning.raw}-${index}`}>{warning.raw}</code>)}
              </details>
            )}
            <a className="primary download" href={download.url} download={download.name}>
              Descargar resultado <span>↓</span>
            </a>
            <button className="link-button" onClick={() => void reset()}>Procesar otro documento</button>
          </div>
        )}

        {stage === 'error' && error && (
          <div className="error" role="alert">
            <strong>No se pudo continuar</strong>
            <p>{error}</p>
            {diagnostic && (
              <details>
                <summary>Ver diagnóstico</summary>
                <code>{diagnostic}</code>
              </details>
            )}
            {file && <button className="secondary" onClick={() => setStage('ready')}>Volver a intentar</button>}
          </div>
        )}
      </section>

      <footer>
        <span><i className="status-dot" /> Todo ocurre en este dispositivo</span>
        <span><a href={REPOSITORY_URL} target="_blank" rel="noreferrer">Código fuente y licencias</a> · Sin cuentas · Sin nube</span>
      </footer>
    </main>
  );
}

function ActivityLog({ items }) {
  if (!items.length) return null;
  return (
    <div className="activity-log" aria-label="Actividad reciente">
      <strong>Actividad</strong>
      <ul>{items.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul>
    </div>
  );
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode><App /></React.StrictMode>,
);
