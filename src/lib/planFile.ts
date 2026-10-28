import { dimsOf } from './planVision/interpret';
import type { Bitmap, Word } from './planVision/types';

/**
 * Turns an uploaded floor plan, a PDF or a picture, into one picture that is small enough to send and
 * read. The same picture is drawn under the 3D floor, so what is read and what is shown always line up.
 */

export const ACCEPT = 'application/pdf,image/png,image/jpeg,image/webp';
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
/** The longest side, in pixels. Bigger gives the reader nothing more to go on. */
const MAX_EDGE = 1600;
/** The server turns away anything over 5 MB. */
const MAX_BYTES = 4.5 * 1024 * 1024;

export interface Rendered {
  blob: Blob;
  /** An object URL for showing it. Revoke it when done. */
  url: string;
  width: number;
  height: number;
  /** The picture's pixels, for reading the plan. */
  pixels: Bitmap;
  /** Text the file itself carries (a PDF's text layer), positioned on the picture. Pictures have none. */
  words: Word[];
}

export interface PlanSource {
  name: string;
  pages: number;
  render(page: number): Promise<Rendered>;
  /** The page most likely to be the floor plan, judged from its text alone. */
  bestPage(): Promise<number>;
  close(): void;
}

export class PlanFileError extends Error {}

const isPdf = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);

export function checkFile(file: File) {
  if (file.size > MAX_FILE_BYTES) throw new PlanFileError('That file is over 25 MB. Export the plan at a smaller size and try again.');
  if (!isPdf(file) && !/^image\/(png|jpeg|webp)$/.test(file.type)) throw new PlanFileError('Use a PDF, PNG, JPG or WebP file.');
}

const canvasTo = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new PlanFileError('The plan could not be prepared.'))), type, quality));

/** PNG keeps thin lines crisp. A JPEG is the way out when the PNG is too big to send. */
async function encode(canvas: HTMLCanvasElement): Promise<Blob> {
  const png = await canvasTo(canvas, 'image/png');
  if (png.size <= MAX_BYTES) return png;
  const jpeg = await canvasTo(canvas, 'image/jpeg', 0.88);
  if (jpeg.size <= MAX_BYTES) return jpeg;
  const small = document.createElement('canvas');
  small.width = Math.round(canvas.width * 0.7);
  small.height = Math.round(canvas.height * 0.7);
  small.getContext('2d')!.drawImage(canvas, 0, 0, small.width, small.height);
  return canvasTo(small, 'image/jpeg', 0.8);
}

async function finish(canvas: HTMLCanvasElement, words: Word[]): Promise<Rendered> {
  const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
  const blob = await encode(canvas);
  const out: Rendered = {
    blob,
    url: URL.createObjectURL(blob),
    width: canvas.width,
    height: canvas.height,
    pixels: { data: pixels.data, width: pixels.width, height: pixels.height },
    words,
  };
  canvas.width = canvas.height = 0; // lets the browser free the memory now
  return out;
}

function blank(w: number, h: number) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w));
  canvas.height = Math.max(1, Math.round(h));
  const ctx = canvas.getContext('2d')!;
  // Transparent areas would turn black when saved as a JPEG, and plans are drawn on white.
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return { canvas, ctx };
}

async function openImage(file: File): Promise<PlanSource> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new PlanFileError('That picture could not be opened. Try saving it as a PNG or JPG.');
  }
  return {
    name: file.name,
    pages: 1,
    async render() {
      const k = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
      const { canvas, ctx } = blank(bitmap.width * k, bitmap.height * k);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      return finish(canvas, []);
    },
    bestPage: async () => 1,
    close: () => bitmap.close(),
  };
}

async function openPdf(file: File): Promise<PlanSource> {
  // The PDF reader is large, so it is only fetched when a PDF is chosen.
  const [pdfjs, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  let doc;
  try {
    doc = await task.promise;
  } catch (e) {
    throw new PlanFileError(
      (e as { name?: string }).name === 'PasswordException' ? 'That PDF is locked with a password. Remove the password and try again.' : 'That PDF could not be opened.',
    );
  }
  return {
    name: file.name,
    pages: doc.numPages,
    async render(page) {
      const p = await doc.getPage(Math.min(Math.max(1, page), doc.numPages));
      const base = p.getViewport({ scale: 1 });
      const viewport = p.getViewport({ scale: MAX_EDGE / Math.max(base.width, base.height) });
      const { canvas, ctx } = blank(viewport.width, viewport.height);
      try {
        await p.render({ canvas, canvasContext: ctx, viewport }).promise;
      } catch {
        throw new PlanFileError('That page of the PDF could not be drawn.');
      }
      // The PDF's own text names the rooms, and often carries the building's measurements.
      const words: Word[] = [];
      try {
        const content = await p.getTextContent();
        for (const item of content.items) {
          if (!('str' in item) || !item.str.trim()) continue;
          const [a, b, c, d, e, f] = pdfjs.Util.transform(viewport.transform, item.transform) as number[];
          const along = Math.hypot(a!, b!) || 1;
          const up = Math.hypot(c!, d!) || 1;
          const length = item.width * viewport.scale;
          const ux = a! / along;
          const uy = b! / along;
          const vx = c! / up;
          const vy = d! / up;
          words.push({
            text: item.str,
            cx: (e! + ux * (length / 2) + vx * up * 0.35) / canvas.width,
            cy: (f! + uy * (length / 2) + vy * up * 0.35) / canvas.height,
            w: (Math.abs(ux) * length + Math.abs(vx) * up) / canvas.width,
            h: (Math.abs(uy) * length + Math.abs(vy) * up) / canvas.height,
          });
        }
      } catch {
        /* a PDF without a text layer is read from its picture alone */
      }
      return finish(canvas, words);
    },
    async bestPage() {
      // A floor plan prints room sizes ("10'-0"x12'-0""). Of the pages that do, the one with the most measurements
      // drawn along its walls is the dimension plan, which reads better than a page full of furniture.
      let best = { page: 1, score: 0 };
      for (let n = 1; n <= Math.min(doc.numPages, 40); n++) {
        try {
          const content = await (await doc.getPage(n)).getTextContent();
          let sizes = 0;
          let lengths = 0;
          for (const item of content.items) {
            if (!('str' in item)) continue;
            if (dimsOf(item.str)) sizes++;
            else if (/^\s*\d+\s*['’′]\s*-?\s*\d/.test(item.str) || /^\s*\d{3,5}\s*$/.test(item.str)) lengths++;
          }
          const score = sizes >= 3 ? sizes * 10 + lengths : 0;
          if (score > best.score) best = { page: n, score };
        } catch {
          /* a page whose text cannot be read is not the best one */
        }
      }
      return best.page;
    },
    close: () => void task.destroy(),
  };
}

export async function openPlanFile(file: File): Promise<PlanSource> {
  checkFile(file);
  return isPdf(file) ? openPdf(file) : openImage(file);
}
