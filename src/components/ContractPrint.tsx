import { api } from '../api';
import { csvAmount, METHOD_LABEL, money, titleCase } from '../lib/format';
import { fmtDate, localDateOf } from '../lib/time';
import type { Contract, DepositEntry, Location } from '../types';

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** The logo at the top of a printed page. Only an image data URL is ever put in, so nothing else can reach the page. */
const logoTag = (logo?: string | null) => (logo && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(logo) ? `<img src="${logo}" alt="" style="max-height:64px;max-width:240px;object-fit:contain;display:block;margin-bottom:14px">` : '');

const ENTRY_WORD = { received: 'Security deposit received', refunded: 'Security deposit returned', kept: 'Security deposit kept by us', advance: 'Advance received', advance_refund: 'Advance given back' } as const;

/** Opens the contract as a clean page in a new window and prints it, with the deposit history and places to sign. */
export async function printContract(c: Contract, place: Location, company: string, logo?: string | null) {
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
            `<tr><td>${escape(fmtDate(localDateOf(e.occurredAt, place.timezone)))}</td><td>${ENTRY_WORD[e.kind]}</td><td>${escape([e.method ? METHOD_LABEL[e.method] : '', e.reference].filter(Boolean).join(', '))}</td><td class="r">${escape(money(e.amountCents, cur))}</td></tr>`,
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
  ${logoTag(logo)}<h1>Rental agreement</h1>
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
export const depositRows = (entries: { occurredAt: string; memberName: string; resourceName: string | null; kind: string; method: string | null; reference: string; amountCents: number }[], timezone: string) =>
  entries.map((e) => [localDateOf(e.occurredAt, timezone), e.memberName, e.resourceName ?? '', e.kind === 'advance' ? 'Advance received' : e.kind === 'advance_refund' ? 'Advance given back' : `Security deposit ${e.kind}`, e.method ? (METHOD_LABEL[e.method as keyof typeof METHOD_LABEL] ?? titleCase(e.method)) : '', e.reference, csvAmount(e.amountCents)]);

/** What a new company contract says, as filled in on the wizard, before it is saved. */
export interface CompanyAgreement {
  provider: string;
  /** The business's logo as a data URL, printed at the top. */
  logo?: string | null;
  /** The day it is prepared, in the space's own timezone. */
  preparedOn: string;
  place: Pick<Location, 'name' | 'address' | 'currency'>;
  company: { name: string; email: string; phone: string };
  start: string;
  end: string | null;
  duration: string | null;
  people: { name: string; email: string; phone: string; seat: string }[];
  sharedSpaces: string[];
  pricing: { mode: 'per_member' | 'fixed'; perMemberCents: number; fixedCents: number; extraCents: number };
  lines: { description: string; amountCents: number }[];
  monthlyCents: number;
  advanceCents: number;
  depositCents: number;
  notes: string;
}

/** The agreement for a new company contract as a whole printable page: parties, period, people, spaces, prices, terms, signatures. */
export function companyAgreementHtml(a: CompanyAgreement, opts: { autoPrint?: boolean } = {}) {
  const cur = a.place.currency;
  const m = (c: number) => escape(money(c, cur));
  const row = (k: string, v: string) => `<tr><th>${escape(k)}</th><td>${v}</td></tr>`;
  const today = fmtDate(a.preparedOn);
  return `<!doctype html><meta charset="utf-8"><title>Agreement, ${escape(a.company.name)}</title><style>
    body{font-family:system-ui,sans-serif;color:#14263f;margin:18mm;line-height:1.45;font-size:13px}
    h1{font-size:22px;margin:0}h2{font-size:14px;margin:20px 0 6px;border-bottom:1px solid #c9d1db;padding-bottom:3px}
    .sub{color:#4b5b72;margin:2px 0 14px}table{border-collapse:collapse;width:100%}
    .kv th{text-align:left;font-weight:600;color:#4b5b72;width:34%;padding:4px 0;vertical-align:top}.kv td{padding:4px 0}
    .grid th,.grid td{border-bottom:1px solid #e1e6ed;padding:5px 6px;text-align:left}.grid th{color:#4b5b72;font-size:12px}.r{text-align:right!important}
    .total td{font-weight:700;border-top:2px solid #14263f;border-bottom:0}
    ol{padding-left:18px;margin:6px 0}li{margin:3px 0}.note{white-space:pre-wrap}
    .sign{display:grid;grid-template-columns:1fr 1fr;gap:28mm;margin-top:24mm}.sign div{border-top:1px solid #14263f;padding-top:4px;font-size:12px}
    @media screen{body{margin:24px}}@media print{body{margin:0}}
  </style>
  ${logoTag(a.logo)}<h1>Space rental agreement</h1>
  <p class="sub">Between ${escape(a.provider)} (${escape(a.place.name)}${a.place.address ? `, ${escape(a.place.address)}` : ''}) and ${escape(a.company.name)}. Prepared on ${escape(today)}.</p>
  <h2>The company</h2>
  <table class="kv">${row('Company', escape(a.company.name))}${a.company.email ? row('Email', escape(a.company.email)) : ''}${a.company.phone ? row('Phone', escape(a.company.phone)) : ''}</table>
  <h2>Period</h2>
  <table class="kv">${row('Starts', escape(fmtDate(a.start)))}${row('Ends', a.end ? escape(fmtDate(a.end)) : 'No end date: runs until either side ends it')}${a.duration ? row('Duration', escape(a.duration)) : ''}</table>
  <h2>People (${a.people.length})</h2>
  <table class="grid"><thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Sits at</th></tr></thead><tbody>${a.people
    .map((p) => `<tr><td>${escape(p.name)}</td><td>${escape(p.email)}</td><td>${escape(p.phone || '—')}</td><td>${escape(p.seat)}</td></tr>`)
    .join('')}</tbody></table>
  <h2>Space</h2>
  <p>${a.sharedSpaces.length ? `Shared by the company: ${escape(a.sharedSpaces.join(', '))}.` : 'No shared space; each person has their own desk.'}</p>
  <h2>Prices</h2>
  <table class="kv">${
    a.pricing.mode === 'per_member'
      ? row('Charged', `Per member: ${m(a.pricing.perMemberCents)} per person, per month`)
      : row('Charged', `One price for the space: ${m(a.pricing.fixedCents)} per month`) + (a.pricing.perMemberCents ? row('Member with own desk', `${m(a.pricing.perMemberCents)} per month`) : '')
  }${a.pricing.extraCents ? row('Extra person', `${m(a.pricing.extraCents)} per month, for each person the shared space has no seat for`) : ''}</table>
  <table class="grid" style="margin-top:8px"><thead><tr><th>Each month</th><th class="r">Amount</th></tr></thead><tbody>${a.lines
    .map((l) => `<tr><td>${escape(l.description)}</td><td class="r">${m(l.amountCents)}</td></tr>`)
    .join('')}<tr class="total"><td>Total per month</td><td class="r">${m(a.monthlyCents)}</td></tr></tbody></table>
  <table class="kv" style="margin-top:10px">${row('Advance', a.advanceCents ? `${m(a.advanceCents)}, rent paid ahead of time and taken off the first invoices` : 'None')}${row('Security deposit', a.depositCents ? `${m(a.depositCents)}, held and returned at the end, less any damage or unpaid rent` : 'None')}</table>
  ${a.notes ? `<h2>Notes</h2><p class="note">${escape(a.notes)}</p>` : ''}
  <h2>Terms</h2>
  <ol>
    <li>The company's people may use the space named above during the opening hours of ${escape(a.place.name)}, and must keep it tidy and respect other members.</li>
    <li>Rent is invoiced monthly. A part month is charged by the day. Bookings the people make, such as meeting rooms, go on the company's invoice.</li>
    <li>The advance is rent paid ahead of time, not a refundable deposit.</li>
    <li>The security deposit is held for the company and is not rent. At the end it is returned, less any amount needed for damage or unpaid rent.</li>
    <li>Prices above are fixed for the period. Adding or removing people changes the monthly amount by the prices above.</li>
    <li>Either side may end this agreement by giving the other reasonable written notice, unless a different period is agreed above.</li>
  </ol>
  <div class="sign"><div>Signed for ${escape(a.provider)}<br>Name and date</div><div>Signed for ${escape(a.company.name)}<br>Name and date</div></div>
  ${opts.autoPrint ? '<script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script>' : ''}`;
}

/** Opens a page in a new window and prints it. */
export function printHtml(html: string) {
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  return true;
}
