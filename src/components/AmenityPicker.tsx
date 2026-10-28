import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { AMENITY_OPTIONS, amenityList, joinAmenities } from '../lib/catalogue';

/** What a space offers, ticked from a list instead of typed. Anything typed that is not on the list is kept too. */
export function AmenityPicker({ value, onChange, compact }: { value: string; onChange: (v: string) => void; compact?: boolean }) {
  const have = amenityList(value);
  const lower = have.map((h) => h.toLowerCase());
  const known = new Set(AMENITY_OPTIONS.map((o) => o.toLowerCase()));
  const extra = have.filter((h) => !known.has(h.toLowerCase()));
  const [custom, setCustom] = useState('');

  const toggle = (label: string) => {
    const on = lower.includes(label.toLowerCase());
    onChange(joinAmenities(on ? have.filter((h) => h.toLowerCase() !== label.toLowerCase()) : [...have, label]));
  };
  const add = () => {
    const t = custom.trim();
    if (t) onChange(joinAmenities([...have, t]));
    setCustom('');
  };
  const chip = (on: boolean) => `rounded-full border px-2.5 ${compact ? 'py-0.5 text-[12px]' : 'py-1 text-[13px]'} font-semibold transition-colors ${on ? 'border-ink bg-ink text-white' : 'border-line-strong bg-paper text-ink hover:border-ink/50'}`;

  return (
    <div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="What it offers">
        {AMENITY_OPTIONS.map((label) => {
          const on = lower.includes(label.toLowerCase());
          return (
            <button key={label} type="button" aria-pressed={on} onClick={() => toggle(label)} className={chip(on)}>
              {label}
            </button>
          );
        })}
        {extra.map((label) => (
          <button key={label} type="button" aria-label={`Remove ${label}`} onClick={() => toggle(label)} className={`${chip(true)} inline-flex items-center gap-1`}>
            {label} <X size={12} aria-hidden />
          </button>
        ))}
      </div>
      <div className="mt-2 flex gap-1.5">
        <input
          value={custom}
          maxLength={40}
          placeholder="Something else"
          aria-label="Add another feature"
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          className="min-w-0 flex-1 rounded-lg border border-line-strong bg-paper px-2.5 py-1.5 text-[13px] focus:border-ink focus:outline-none"
        />
        <button type="button" onClick={add} disabled={!custom.trim()} className="inline-flex items-center gap-1 rounded-lg border border-line-strong bg-paper px-2.5 text-[13px] font-semibold hover:border-ink/50 disabled:opacity-50">
          <Plus size={13} aria-hidden /> Add
        </button>
      </div>
    </div>
  );
}
