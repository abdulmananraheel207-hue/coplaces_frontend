import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Printer } from 'lucide-react';
import { resourceLabel } from '../lib/catalogue';
import type { Resource } from '../types';
import { floorLabel } from './space3d/layout';
import { Button, Loading, Modal } from './ui';

/** The address a space's QR code leads to. */
export const spaceLink = (id: string) => `${window.location.origin}/s/${id}`;

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** A QR code for every space, to print and stick on the desk or the door. Scanning one opens that space on the phone. */
export function QrSheet({ open, onClose, spaces, place }: { open: boolean; onClose: () => void; spaces: Resource[]; place: string }) {
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [only, setOnly] = useState('');
  const shown = spaces.filter((s) => s.status !== 'retired' && (!only || s.kind === only));

  useEffect(() => {
    if (!open) return;
    let live = true;
    void Promise.all(spaces.filter((s) => s.status !== 'retired').map(async (s) => [s.id, await QRCode.toDataURL(spaceLink(s.id), { margin: 1, width: 300, color: { dark: '#14263f', light: '#ffffff' } })] as const)).then((pairs) => {
      if (live) setCodes(Object.fromEntries(pairs));
    });
    return () => {
      live = false;
    };
  }, [open, spaces]);

  // A new window, so a long sheet can run over several pages.
  const print = () => {
    const w = window.open('', '_blank');
    if (!w) return;
    const cards = shown
      .map(
        (s) => `<figure><img src="${codes[s.id] ?? ''}" alt=""><figcaption><strong>${escape(s.name)}</strong><span>${escape([resourceLabel(s.kind, s.style), floorLabel(s.floor)].join(', '))}</span><small>Scan to check in, see details or report a problem</small></figcaption></figure>`,
      )
      .join('');
    w.document.write(`<!doctype html><title>QR codes, ${escape(place)}</title><style>
      body{font-family:system-ui,sans-serif;color:#14263f;margin:12mm}h1{font-size:18px;margin:0 0 10px}
      main{display:grid;grid-template-columns:repeat(3,1fr);gap:10mm}figure{margin:0;border:1px solid #c9d1db;border-radius:10px;padding:8px;text-align:center;break-inside:avoid}
      img{width:100%;max-width:52mm}figcaption{display:grid;gap:2px;font-size:13px}figcaption span{font-size:11px;color:#4b5b72}small{font-size:9.5px;color:#4b5b72}
    </style><h1>${escape(place)}: QR codes</h1><main>${cards}</main><script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script>`);
    w.document.close();
  };

  return (
    <Modal open={open} onClose={onClose} title="QR codes for your spaces" xwide>
      <div className="space-y-4">
        <p className="text-sm text-slate">Print these and stick one on each desk or door. Members and staff scan with their phone to check in at a desk, see what a space offers, or report a problem. They sign in first if they need to.</p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <select aria-label="Which spaces" value={only} onChange={(e) => setOnly(e.target.value)} className="rounded-lg border border-line-strong bg-paper px-3 py-2 text-sm">
            <option value="">All spaces ({spaces.filter((s) => s.status !== 'retired').length})</option>
            {['room', 'corporate_room', 'hot_desk', 'dedicated_desk', 'office', 'storage'].map((k) => (
              <option key={k} value={k}>
                {k.replace('_', ' ')}s
              </option>
            ))}
          </select>
          <Button variant="primary" onClick={print} disabled={!shown.length || Object.keys(codes).length === 0}>
            <Printer size={15} aria-hidden /> Print {shown.length} {shown.length === 1 ? 'code' : 'codes'}
          </Button>
        </div>
        {Object.keys(codes).length === 0 ? (
          <Loading />
        ) : (
          <ul className="grid max-h-[55vh] gap-3 overflow-y-auto sm:grid-cols-3 lg:grid-cols-4">
            {shown.map((s) => (
              <li key={s.id} className="rounded-xl border border-line bg-white p-2.5 text-center">
                <img src={codes[s.id]} alt={`QR code for ${s.name}`} className="mx-auto w-full max-w-36" />
                <p className="mt-1 text-sm font-semibold">{s.name}</p>
                <p className="text-xs text-slate">{[resourceLabel(s.kind, s.style), floorLabel(s.floor)].join(', ')}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
