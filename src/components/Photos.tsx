import { useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, ImagePlus, Trash2 } from 'lucide-react';
import { api, API_URL, ApiError } from '../api';
import { useRefresh } from '../lib/queries';
import { Button, ErrorNote, Modal } from './ui';

export const photoUrl = (id: string) => `${API_URL}/resources/photos/${id}/file`;

/** A row of small photos that open large when clicked. */
export function PhotoStrip({ ids, name }: { ids: string[]; name: string }) {
  const [at, setAt] = useState<number | null>(null);
  if (!ids.length) return null;
  const step = (d: number) => setAt((i) => (i === null ? i : (i + d + ids.length) % ids.length));
  return (
    <>
      <ul className="flex flex-wrap gap-2" aria-label={`Photos of ${name}`}>
        {ids.map((id, i) => (
          <li key={id}>
            <button type="button" onClick={() => setAt(i)} className="block overflow-hidden rounded-lg ring-1 ring-ink/15 transition-transform hover:scale-[1.03]" aria-label={`Open photo ${i + 1} of ${ids.length}`}>
              <img src={photoUrl(id)} alt="" loading="lazy" className="h-16 w-24 object-cover" />
            </button>
          </li>
        ))}
      </ul>
      <Modal open={at !== null} onClose={() => setAt(null)} title={name} xwide>
        {at !== null && (
          <div className="relative">
            <img src={photoUrl(ids[at]!)} alt={`${name}, photo ${at + 1} of ${ids.length}`} className="max-h-[70vh] w-full rounded-lg object-contain" />
            {ids.length > 1 && (
              <>
                <button type="button" aria-label="Previous photo" onClick={() => step(-1)} className="absolute top-1/2 left-2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-ink/70 text-white hover:bg-ink">
                  <ChevronLeft size={20} aria-hidden />
                </button>
                <button type="button" aria-label="Next photo" onClick={() => step(1)} className="absolute top-1/2 right-2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-ink/70 text-white hover:bg-ink">
                  <ChevronRight size={20} aria-hidden />
                </button>
              </>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}

/** Photos are shrunk before they are sent, so a phone picture of several megabytes becomes a few hundred kilobytes. */
async function shrink(file: File): Promise<Blob> {
  const MAX = 1600;
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, MAX / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k);
    c.height = Math.round(bmp.height * k);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close();
    const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, 'image/jpeg', 0.86));
    if (blob && blob.size < file.size) return blob;
  } catch {
    // fall back to the original file
  }
  return file;
}

/** Add and remove the photos of a space. */
export function PhotoManager({ resourceId, ids }: { resourceId: string; ids: string[] }) {
  const refresh = useRefresh();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const blob = await shrink(file);
      const type = blob.type || file.type;
      const res = await fetch(`${API_URL}/resources/${resourceId}/photos`, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': type }, body: blob });
      if (!res.ok) throw new ApiError(res.status, (await res.json().catch(() => null))?.error ?? 'Could not add the photo');
    },
    onSuccess: () => {
      setError(null);
      void refresh('resources');
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Could not add the photo'),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/resources/${resourceId}/photos/${id}`),
    onSuccess: () => void refresh('resources'),
    onError: (e) => setError(e instanceof Error ? e.message : 'Could not remove the photo'),
  });

  return (
    <div>
      <ul className="flex flex-wrap gap-2">
        {ids.map((id, i) => (
          <li key={id} className="group relative">
            <img src={photoUrl(id)} alt={`Photo ${i + 1}`} className="h-20 w-28 rounded-lg object-cover ring-1 ring-ink/15" />
            <button
              type="button"
              aria-label={`Remove photo ${i + 1}`}
              disabled={remove.isPending}
              onClick={() => remove.mutate(id)}
              className="absolute top-1 right-1 grid size-7 place-items-center rounded-full bg-ink/80 text-white opacity-90 hover:bg-busy"
            >
              <Trash2 size={13} aria-hidden />
            </button>
          </li>
        ))}
        {ids.length < 8 && (
          <li>
            <Button onClick={() => input.current?.click()} disabled={upload.isPending} className="!h-20 !w-28 flex-col">
              <ImagePlus size={18} aria-hidden /> {upload.isPending ? 'Adding…' : 'Add photo'}
            </Button>
          </li>
        )}
      </ul>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        aria-label="Choose a photo"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) upload.mutate(f);
        }}
      />
      <p className="mt-1.5 text-xs text-slate">Up to 8 photos. JPEG, PNG or WebP.</p>
      {error && <div className="mt-2"><ErrorNote error={new Error(error)} /></div>}
    </div>
  );
}
