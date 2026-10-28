import { api } from '../api';
import { fromCents, METHOD_LABEL, money, titleCase } from '../lib/format';
import { fmtDate } from '../lib/time';
import type { Contract, DepositEntry, Location } from '../types';

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const ENTRY_WORD = { received: 'Security deposit received', refunded: 'Security deposit returned', kept: 'Security deposit kept by us', advance: 'Advance received' } as const;

/** Opens the contract as a clean page in a new window and prints it, with the deposit history and places to sign. */
export async function printContract(c: Contract, place: Location, company: string) {
  // Opened first so the browser allows the pop-up; filled once the deposit history has arrived.
  const w = window.open('', '_blank');
  if (!w) return;
  const entries = c.depositCents > 0 || c.advanceCents > 0 ? await api.get<DepositEntry[]>(`/contracts/${c.id}/deposit-entries`).catch(() => []) : [];
  const cur = place.currency;
  const row = (k: string, v: string) => `<tr><th>${escape(k)}</th><td>${escape(v)}</td></tr>`;
  const history = entries.length
    ? `<h2>Money record</h2><table class="grid"><thead><tr><th>Date</th><th>What happened</th><th>How</th><th class="r">Amount</th></tr></thead><tbody>${entries
        .map(
          (e) =>
            `<tr><td>${escape(fmtDate(e.occurredAt.slice(0, 10)))}</td><td>${ENTRY_WORD[e.kind]}</td><td>${escape([e.method ? METHOD_LABEL[e.method] : '', e.reference].filter(Boolean).join(', '))}</td><td class="r">${escape(money(e.amountCents, cur))}</td></tr>`,
        )
        .join('')}</tbody></table>`
    : '';
  w.document.write(`<!doctype html><meta charset="utf-8"><title>Contract, ${escape(c.memberName)}</title><style>
    body{font-family:system-ui,sans-serif;color:#14263f;margin:18mm;line-height:1.45;font-size:13px}
    h1{font-size:22px;margin:0}h2{font-size:14px;margin:22px 0 6px;border-bottom:1px solid #c9d1db;padding-bottom:3px}
    .sub{color:#4b5b72;margin:2px 0 16px}table{border-collapse:collapse;width:100%}
    .kv th{text-align:left;font-weight:600;color:#4b5b72;width:34%;padding:4px 0;vertical-align:top}.kv td{padding:4px 0}
    .grid th,.grid td{border-bottom:1px solid #e1e6ed;padding:5px 6px;text-align:left}.grid th{color:#4b5b72;font-size:12px}.r{text-align:right!important}
    ol{padding-left:18px;margin:6px 0}li{margin:3px 0}
    .sign{display:grid;grid-template-columns:1fr 1fr;gap:28mm;margin-top:26mm}.sign div{border-top:1px solid #14263f;padding-top:4px;font-size:12px}
    .note{white-space:pre-wrap}
    @media print{body{margin:0}}
  </style>
  <h1>Rental agreement</h1>
  <p class="sub">${escape(company)}, ${escape(place.name)}${place.address ? `, ${escape(place.address)}` : ''}</p>
  <h2>The agreement</h2>
  <table class="kv">${[
    row('Member', c.memberName),
    c.company ? row('Company', c.company) : '',
    row('Space rented', c.resourceName ?? 'No particular space (membership only)'),
    row('Starts', fmtDate(c.startDate)),
    row('Ends', c.endDate ? fmtDate(c.endDate) : 'No end date'),
    row('Rent', c.rentCents ? `${money(c.rentCents, cur)} per month` : 'None'),
    row('Advance', c.advanceCents ? `${money(c.advanceCents, cur)} (${c.advanceReceivedAt ? 'received' : 'not yet received'})` : 'None'),
    row('Security deposit', c.depositCents ? `${money(c.depositCents, cur)} (${c.depositStatus === 'pending' ? 'not yet received' : titleCase(c.depositStatus === 'forfeited' ? 'kept' : c.depositStatus)})` : 'None'),
    row('Status', titleCase(c.status)),
  ].join('')}</table>
  ${c.notes ? `<h2>Notes</h2><p class="note">${escape(c.notes)}</p>` : ''}
  ${history}
  <h2>Terms</h2>
  <ol>
    <li>The member may use the space named above during the opening hours of ${escape(place.name)} and must keep it tidy and respect other members.</li>
    <li>Rent is paid monthly in advance. Unpaid rent can be taken from the security deposit.</li>
    <li>Any advance named above is rent paid ahead of time. It is not a refundable deposit.</li>
    <li>The security deposit is held for the member and is not rent. At the end of this agreement it is returned, less any amount needed for damage or unpaid rent.</li>
    <li>Either side may end this agreement by giving the other reasonable written notice, unless a different period is agreed above.</li>
  </ol>
  <div class="sign"><div>Signed for ${escape(company)}<br>Name and date</div><div>Signed by ${escape(c.memberName)}<br>Date</div></div>
  <script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script>`);
  w.document.close();
}

/** Plain-number export of the advance and security deposit entries, for a spreadsheet. */
export const depositRows = (entries: { occurredAt: string; memberName: string; resourceName: string | null; kind: string; method: string | null; reference: string; amountCents: number }[]) =>
  entries.map((e) => [e.occurredAt.slice(0, 10), e.memberName, e.resourceName ?? '', e.kind === 'advance' ? 'Advance received' : `Security deposit ${e.kind}`, e.method ? METHOD_LABEL[e.method as keyof typeof METHOD_LABEL] : '', e.reference, fromCents(e.amountCents)]);
