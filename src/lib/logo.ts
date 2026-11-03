import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { useAuth } from '../auth';

/** The longest side a logo is kept at, in pixels. Plenty for a printed page header, and small to store and send. */
export const LOGO_MAX_SIDE = 480;
/** What the server accepts, as a data URL (see routes/branding.ts on the server). */
export const LOGO_MAX_CHARS = 400_000;

/**
 * The business's logo as a data URL, or null when it has none. Fetched once per logo version (it changes when the owner uploads a
 * new one), so invoices and agreements can put it straight into the page, including pages opened in a new window to print.
 */
export function useLogo() {
  const { org } = useAuth();
  const version = org?.logoVersion ?? null;
  const q = useQuery({
    queryKey: ['branding', 'logo', org?.id, version],
    queryFn: () => api.get<{ dataUrl: string | null }>('/branding/logo'),
    enabled: !!version,
    staleTime: Infinity,
  });
  return version ? (q.data?.dataUrl ?? null) : null;
}

const load = (file: File) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That file could not be read as an image. Use a PNG, JPEG, WebP or SVG file.'));
    };
    img.src = url;
  });

/**
 * Shrinks an image file to at most LOGO_MAX_SIDE on its longest side and returns it as a data URL. PNG keeps a transparent
 * background; when that is still too large it falls back to WebP, then JPEG on white.
 */
export async function logoFromFile(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file: PNG, JPEG, WebP or SVG.');
  if (file.size > 10 * 1024 * 1024) throw new Error('That image is over 10 MB. Choose a smaller file.');
  const img = await load(file);
  const w0 = img.naturalWidth || 600;
  const h0 = img.naturalHeight || 200;
  const scale = Math.min(1, LOGO_MAX_SIDE / Math.max(w0, h0));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w0 * scale));
  canvas.height = Math.max(1, Math.round(h0 * scale));
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  for (const [type, quality] of [['image/png', undefined], ['image/webp', 0.9], ['image/webp', 0.75]] as const) {
    const url = canvas.toDataURL(type, quality);
    if (url.startsWith(`data:${type}`) && url.length <= LOGO_MAX_CHARS) return url;
  }
  const flat = document.createElement('canvas');
  flat.width = canvas.width;
  flat.height = canvas.height;
  const f = flat.getContext('2d')!;
  f.fillStyle = '#fff';
  f.fillRect(0, 0, flat.width, flat.height);
  f.drawImage(canvas, 0, 0);
  const jpeg = flat.toDataURL('image/jpeg', 0.8);
  if (jpeg.length > LOGO_MAX_CHARS) throw new Error('That image is too detailed to use as a logo. Try a simpler or smaller file.');
  return jpeg;
}
