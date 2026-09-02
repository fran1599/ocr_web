import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const MEBIBYTE = 1024 * 1024;
const BALANCED_MAX_BYTES = 250 * MEBIBYTE;
const MAX_BYTES = 500 * MEBIBYTE;
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
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function App() {
  const inputRef = useRef(null);
  const docRef = useRef(null);
  const resultUrlRef = useRef(null);
  const completedPagesRef = useRef(new Set());
  const [file, setFile] = useState(null);
  const [format, setFormat] = useState('md');
  const [stage, setStage] = useState('empty');
  const [pageCount, setPageCount] = useState(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [diagnostic, setDiagnostic] = useState('');
  const [download, setDownload] = useState(null);

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
      if (message.type === 'convert' && Number.isInteger(message.n)) {
        completedPagesRef.current.add(message.n);
        setCurrentPage(completedPagesRef.current.size);
        setStatus('Reconociendo texto…');
      } else if (message.type === 'export') {
        setStatus('Preparando el archivo…');
      }
    };
    scribe.opt.errorHandler = (message) => setDiagnostic(String(message));
  }

  async function acceptFile(candidate) {
    await release();
    setError('');
    setDiagnostic('');
    setPageCount(null);
    setCurrentPage(0);

    if (!candidate) return;
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
      setError('El archivo supera el límite de 500 MB. Un documento de ese tamaño puede agotar la memoria del navegador. Dividilo en archivos más pequeños y procesalos por separado.');
      return;
    }

    const profile = getResourceProfile(candidate.size);
    const workerN = getWorkerCount(profile);
    setFile(candidate);
    setStage('inspecting');
    setStatus(
      profile.key === 'saving'
        ? 'Archivo grande detectado. Activando el modo ahorro…'
        : 'Analizando el PDF en este dispositivo…',
    );

    try {
      if (!('Worker' in window) || !('WebAssembly' in window)) {
        throw new Error('Este navegador no dispone de Web Workers o WebAssembly.');
      }
      const scribe = await loadScribe(workerN);
      configureScribe(scribe);
      setStatus('Leyendo la estructura y contando las páginas…');
      const doc = await scribe.openDocument([candidate], {
        deferText: true,
        skipFontOpt: true,
        pdfWorkerN: 1,
      });
      docRef.current = doc;
      const pages = Number(doc.inputData?.pageCount ?? doc.pageMetrics?.length ?? 0);
      if (!pages) throw new Error('No se encontraron páginas en el PDF.');
      setPageCount(pages);
      setStatus(`Documento listo. ${profile.label} activado.`);
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
          : /Web Workers|WebAssembly/.test(message)
            ? message
            : 'No pudimos procesar el PDF. Puede estar corrupto o usar una característica no compatible.',
    );
    setStage('error');
  }

  async function processDocument() {
    if (!file) return;
    setStage('processing');
    setError('');
    setDiagnostic('');
    setCurrentPage(0);
    completedPagesRef.current.clear();

    const profile = getResourceProfile(file.size);
    const workerN = getWorkerCount(profile);
    setStatus(`Preparando ${profile.label.toLowerCase()}…`);

    try {
      const scribe = await loadScribe(workerN);
      configureScribe(scribe);
      let doc = docRef.current;
      if (!doc) {
        setStatus('Leyendo el PDF…');
        doc = await scribe.openDocument([file], { skipFontOpt: true, pdfWorkerN: 1 });
        docRef.current = doc;
      }
      const pages = Number(doc.inputData?.pageCount ?? doc.pageMetrics?.length ?? 0);
      setPageCount(pages);
      setStatus('Iniciando el motor OCR en español…');
      await doc.recognize({
        langs: ['spa'],
        ocrPages: 'all',
        mode: 'quality',
        skipFontOpt: true,
      });

      let blob;
      let name;

      if (format === 'md') {
        setStatus('Preparando Markdown…');
        const chunks = [];
        for (let index = 0; index < pages; index += 1) {
          const pageText = String(
            await doc.exportData('text', { pageArr: [index] }),
          ).trim();
          chunks.push(`<!-- Página ${index + 1} -->\n\n${pageText}`);
        }
        blob = new Blob(
          [`${chunks.join('\n\n---\n\n')}\n`],
          { type: 'text/markdown;charset=utf-8' },
        );
        name = `${baseName(file.name)}-ocr.md`;
      } else {
        setStatus('Generando PDF buscable…');
        const bytes = await doc.exportData('pdf', {
          displayMode: 'invis',
          addOverlay: true,
        });
        blob = new Blob([bytes], { type: 'application/pdf' });
        name = `${baseName(file.name)}-buscable.pdf`;
      }

      const url = URL.createObjectURL(blob);
      resultUrlRef.current = url;
      setDownload({ url, name });
      setCurrentPage(pages);
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
    setCurrentPage(0);
    completedPagesRef.current.clear();
    setStatus('');
    setError('');
    setDiagnostic('');
    if (inputRef.current) inputRef.current.value = '';
  }

  const progress = pageCount
    ? Math.min(100, Math.round((currentPage / pageCount) * 100))
    : 4;
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
            <div
              className="dropzone"
              role="button"
              tabIndex="0"
              onDrop={(event) => {
                event.preventDefault();
                void acceptFile(event.dataTransfer.files?.[0]);
              }}
              onDragOver={(event) => event.preventDefault()}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click();
              }}
              onClick={() => inputRef.current?.click()}
            >
              <div className="upload-icon" aria-hidden="true">↑</div>
              <strong>Arrastrá un PDF acá</strong>
              <span>o</span>
              <button type="button" className="secondary">Seleccionar PDF</button>
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

            <button className="primary" onClick={() => void processDocument()}>
              Procesar documento <span>→</span>
            </button>
          </>
        )}

        {stage === 'processing' && (
          <div className="processing">
            <div className="spinner" aria-hidden="true" />
            <h2>Procesando documento…</h2>
            <p>{status}</p>
            <div className="progress-copy">
              <span>{pageCount ? `${currentPage} de ${pageCount} páginas procesadas` : 'Preparando páginas'}</span>
              <span>{pageCount ? `${progress}%` : ''}</span>
            </div>
            <div className="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={progress}>
              <i style={{ width: `${progress}%` }} />
            </div>
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
            <p>{pageCount} {pageCount === 1 ? 'página procesada' : 'páginas procesadas'} correctamente.</p>
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
        <span>Sin cuentas · Sin historial · Sin nube</span>
      </footer>
    </main>
  );
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode><App /></React.StrictMode>,
);
