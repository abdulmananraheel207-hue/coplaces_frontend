import { useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { CountText } from './Count';
import { NavLink } from 'react-router';
import { X } from 'lucide-react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const buttonBase =
  'inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold whitespace-nowrap transition-[background-color,border-color,box-shadow,color] duration-150 disabled:opacity-50 disabled:shadow-none';
const variants: Record<Variant, string> = {
  primary: 'bg-signal text-ink border border-signal-deep/50 shadow-[0_1px_2px_rgb(16_24_40/0.08),inset_0_1px_0_rgb(255_255_255/0.35)] hover:bg-signal-deep',
  secondary: 'bg-paper text-ink border border-line-strong shadow-[0_1px_2px_rgb(16_24_40/0.05)] hover:border-ink/40 hover:bg-mist',
  ghost: 'text-ink hover:bg-ink/[0.06] border border-transparent',
  danger: 'bg-paper text-busy border border-busy/40 shadow-[0_1px_2px_rgb(16_24_40/0.05)] hover:border-busy hover:bg-busy-wash',
};

/** The same look as `Button`, for links that act as buttons. */
export const buttonClass = (variant: Variant = 'secondary', small = false) =>
  `${buttonBase} ${variants[variant]} ${small ? 'px-2.5 py-1 text-[13px]' : 'px-3.5 py-2 text-sm'}`;

export function Button({
  variant = 'secondary',
  small,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; small?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      className={`${buttonClass(variant, small)} ${className}`}
    />
  );
}

const fieldCls =
  'w-full rounded-lg border border-line-strong bg-paper px-3 py-2 text-sm text-ink shadow-[0_1px_2px_rgb(16_24_40/0.04)] transition-[border-color,box-shadow] placeholder:text-slate/70 hover:border-ink/35 focus:border-ink focus:shadow-[0_0_0_3px_rgb(246_195_36/0.35)] focus:outline-none disabled:bg-plaster disabled:text-slate';

export const Input = (props: InputHTMLAttributes<HTMLInputElement>) => <input {...props} className={`${fieldCls} ${props.className ?? ''}`} />;
export const Select = (props: SelectHTMLAttributes<HTMLSelectElement>) => <select {...props} className={`${fieldCls} ${props.className ?? ''}`} />;
export const Textarea = (props: TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea rows={3} {...props} className={`${fieldCls} ${props.className ?? ''}`} />
);

export function Field({ label, hint, children, className = '' }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-semibold text-ink/90">
        {label}
      </label>
      <FieldChild id={id}>{children}</FieldChild>
      {hint && <p className="mt-1 text-xs text-slate">{hint}</p>}
    </div>
  );
}

// Wires the label to the single input/select/textarea passed as a child.
function FieldChild({ id, children }: { id: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current?.querySelector('input,select,textarea');
    if (el && !el.id) el.id = id;
  }, [id]);
  return <div ref={ref}>{children}</div>;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
  xwide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
  xwide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-label={title}
    >
      {open && (
        <div className={`m-3 max-h-[92dvh] overflow-y-auto rounded-2xl bg-paper shadow-[0_24px_64px_-12px_rgb(14_28_48/0.35)] ring-1 ring-ink/10 ${xwide ? 'w-[min(66rem,calc(100vw-1.5rem))]' : wide ? 'w-[min(44rem,calc(100vw-1.5rem))]' : 'w-[min(30rem,calc(100vw-1.5rem))]'}`}>
          <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-line bg-paper/95 px-6 py-4 backdrop-blur">
            <h2 className="display-sm text-lg">{title}</h2>
            <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate transition-colors hover:bg-plaster hover:text-ink">
              <X size={18} />
            </button>
          </div>
          <div className="px-6 py-5">{children}</div>
        </div>
      )}
    </dialog>
  );
}

export function PageHeader({ title, children, sub }: { title: string; sub?: string; children?: ReactNode }) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div>
        <h1 className="display text-[1.75rem] sm:text-[2.1rem]">{title}</h1>
        {sub && <p className="mt-1.5 text-[15px] text-slate">{sub}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

export const Panel = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <div className={`surface ${className}`}>{children}</div>
);

export function Section({ title, aside, children, className = '' }: { title: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={className}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="display-sm text-[1.1rem]">{title}</h2>
        {aside && <div className="text-sm text-slate">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

type Tone = 'ok' | 'busy' | 'hold' | 'mine' | 'idle';
const tones: Record<Tone, string> = {
  ok: 'bg-ok-wash text-ok',
  busy: 'bg-busy-wash text-busy',
  hold: 'bg-hold-wash text-hold',
  mine: 'bg-mine-wash text-mine',
  idle: 'bg-plaster text-slate ring-1 ring-inset ring-line',
};
const glyph: Record<Tone, string> = { ok: 'bg-ok', busy: 'bg-busy', hold: 'bg-hold', mine: 'bg-mine', idle: 'bg-slate' };

/** Status is always colour plus a word. */
export function Chip({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${tones[tone]}`}>
      <span className={`inline-block size-1.5 rounded-full ${glyph[tone]}`} aria-hidden />
      {children}
    </span>
  );
}

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="rounded-card border border-dashed border-line-strong bg-paper/60 px-6 py-12 text-center">
      <p className="display-sm text-base">{title}</p>
      {hint && <p className="mx-auto mt-1 max-w-sm text-sm text-slate">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export const Loading = ({ label = 'Loading' }: { label?: string }) => (
  <p role="status" className="py-10 text-center text-sm text-slate">
    {label}…
  </p>
);

export const ErrorNote = ({ error }: { error: unknown }) => (
  <p role="alert" className="rounded-lg border border-busy/25 bg-busy-wash px-3.5 py-2.5 text-sm text-busy">
    {error instanceof Error ? error.message : 'Something went wrong'}
  </p>
);

export function Tabs({ items }: { items: { to: string; label: string; end?: boolean }[] }) {
  return (
    <nav className="no-print -mt-1 mb-7 flex w-fit max-w-full gap-1 overflow-x-auto rounded-xl bg-ink/[0.05] p-1" aria-label="Section">
      {items.map((i) => (
        <NavLink
          key={i.to}
          to={i.to}
          end={i.end}
          className={({ isActive }) =>
            `whitespace-nowrap rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-colors ${isActive ? 'bg-paper text-ink shadow-[0_1px_3px_rgb(16_24_40/0.12)]' : 'text-slate hover:text-ink'}`
          }
        >
          {i.label}
        </NavLink>
      ))}
    </nav>
  );
}

/** Definition rows with a rule between them; used instead of stat tiles. */
export function Ledger({ rows }: { rows: { label: string; value: ReactNode; tone?: 'busy' | 'ok'; note?: string }[] }) {
  return (
    <dl className="surface divide-y divide-line px-4">
      {rows.map((r) => (
        <div key={r.label} className="flex items-baseline justify-between gap-4 py-2.5">
          <dt className="text-sm text-slate">
            {r.label}
            {r.note && <span className="block text-xs">{r.note}</span>}
          </dt>
          <dd className={`num text-[15px] font-semibold ${r.tone === 'busy' ? 'text-busy' : r.tone === 'ok' ? 'text-ok' : ''}`}>{typeof r.value === 'string' ? <CountText text={r.value} /> : r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex gap-0.5 rounded-xl bg-ink/[0.05] p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-lg px-3 py-1 text-sm font-semibold transition-colors ${value === o.value ? 'bg-paper text-ink shadow-[0_1px_3px_rgb(16_24_40/0.12)]' : 'text-slate hover:text-ink'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.match(/\p{L}/u)?.[0])
    .filter((c): c is string => !!c)
    .slice(0, 2)
    .join('')
    .toUpperCase();

const AVATAR_TINTS = ['bg-mine-wash text-mine', 'bg-ok-wash text-ok', 'bg-hold-wash text-hold', 'bg-busy-wash text-busy', 'bg-ink/10 text-ink'];

/** A person's initials in a circle. The tint follows the name, so the same person always looks the same. */
export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return (
    <span
      aria-hidden
      className={`inline-grid shrink-0 place-items-center rounded-full font-bold ${AVATAR_TINTS[h % AVATAR_TINTS.length]}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
    >
      {initials(name)}
    </span>
  );
}
