import type { Word } from './types';

/**
 * Reads the text on a picture of a plan (room names, printed sizes), so a plan that is not a PDF can still be
 * named and scaled. It runs in the browser: the engine and its English data are part of this app, nothing is
 * fetched from elsewhere and the picture never leaves the page. It is only loaded when a picture without text is opened.
 */

/** Text smaller than this, in pixels, is too small to read, so the picture is enlarged first. */
const TARGET_EDGE = 3600;
const MAX_ZOOM = 3;
/** Anything the reader is less sure of than this is noise from lines and furniture. */
const MIN_CONFIDENCE = 55;

const absolute = (url: string) => new URL(url, window.location.href).href;

export async function readWords(blob: Blob): Promise<Word[]> {
  const [{ createWorker }, worker, core] = await Promise.all([
    import('tesseract.js'),
    import('tesseract.js/dist/worker.min.js?url'),
    import('tesseract.js-core/tesseract-core-lstm.wasm.js?url'),
  ]);
  const bitmap = await createImageBitmap(blob);
  const zoom = Math.min(MAX_ZOOM, Math.max(1, TARGET_EDGE / Math.max(bitmap.width, bitmap.height)));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * zoom);
  canvas.height = Math.round(bitmap.height * zoom);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  // The engine runs in its own thread, which cannot resolve relative addresses, so each is made absolute.
  const reader = await createWorker('eng', 1, {
    workerPath: absolute(worker.default),
    corePath: absolute(core.default),
    langPath: absolute(`${import.meta.env.BASE_URL}ocr`),
    gzip: true,
    cacheMethod: 'none',
  });
  try {
    // Plans scatter their text, so the page is read as separate pieces rather than as columns of a document.
    await reader.setParameters({ tessedit_pageseg_mode: '11' as never });
    const { data } = await reader.recognize(canvas, {}, { blocks: true });
    const words: Word[] = [];
    for (const block of data.blocks ?? [])
      for (const para of block.paragraphs)
        for (const line of para.lines)
          for (const w of line.words) {
            const text = w.text.trim();
            if (w.confidence < MIN_CONFIDENCE || !/[\p{L}\p{N}]/u.test(text) || (text.length < 2 && !/\d/.test(text))) continue;
            const { x0, y0, x1, y1 } = w.bbox;
            words.push({ text, cx: (x0 + x1) / 2 / canvas.width, cy: (y0 + y1) / 2 / canvas.height, w: (x1 - x0) / canvas.width, h: (y1 - y0) / canvas.height });
          }
    return words;
  } finally {
    await reader.terminate();
    canvas.width = canvas.height = 0;
  }
}
