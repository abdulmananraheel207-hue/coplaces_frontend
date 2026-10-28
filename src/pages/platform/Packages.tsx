import { useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api, errorMessage } from '../../api';
import { Button, Chip, Empty, ErrorNote, Field, Input, Loading, Modal, PageHeader, Select, Textarea } from '../../components/ui';
import { useToast } from '../../components/toast';
import { FEATURE_LABELS } from '../../lib/features';
import { fromCents, money, toCents } from '../../lib/format';
import { useRefresh } from '../../lib/queries';
import type { FeatureDef, FeatureKey, PackageRow } from '../../types';
import { intervalLabel } from './common';
import { usePackages } from './Spaces';

const useCatalog = () =>
  useQuery({ queryKey: ['platform', 'features'], queryFn: () => api.get<{ features: FeatureDef[]; core: string[] }>('/platform/features'), staleTime: Infinity });

function PackageForm({ initial, onDone }: { initial?: PackageRow; onDone: () => void }) {
  const toast = useToast();
  const refresh = useRefresh();
  const catalog = useCatalog();
  const [v, setV] = useState({
    name: initial?.name ?? '',
    description: initial?.description ?? '',
    interval: initial?.interval ?? 'month',
    price: initial ? fromCents(initial.priceCents) : '',
    active: initial?.active ?? true,
  });
  const [features, setFeatures] = useState<FeatureKey[]>(initial?.features ?? []);
  const [locLimit, setLocLimit] = useState(initial?.maxLocations != null ? String(initial.maxLocations) : '');
  const [memberLimit, setMemberLimit] = useState(initial?.maxMembers != null ? String(initial.maxMembers) : '');
  const defs = catalog.data?.features ?? [];

  // Turning a feature on also turns on what it needs; turning one off drops anything that needs it.
  const toggle = (key: FeatureKey) =>
    setFeatures((cur) => {
      const on = cur.includes(key);
      const next = new Set(cur);
      if (on) {
        next.delete(key);
        let changed = true;
        while (changed) {
          changed = false;
          for (const d of defs) if (next.has(d.key) && d.requires?.some((r) => !next.has(r as FeatureKey))) (next.delete(d.key), (changed = true));
        }
      } else {
        const add = (k: FeatureKey) => {
          next.add(k);
          defs.find((d) => d.key === k)?.requires?.forEach((r) => add(r as FeatureKey));
        };
        add(key);
      }
      return defs.map((d) => d.key).filter((k) => next.has(k));
    });

  const save = useMutation({
    mutationFn: () => {
      const cents = toCents(v.price);
      if (cents === null) throw new Error('Enter the price as a number in rupees, like 19000');
      const limit = (s: string, what: string) => {
        if (s.trim() === '') return null;
        const n = Number(s);
        if (!Number.isInteger(n) || n < 1) throw new Error(`${what} limit must be a whole number from 1, or empty for no limit`);
        return n;
      };
      const body = {
        name: v.name,
        description: v.description,
        interval: v.interval,
        priceCents: cents,
        features,
        maxLocations: limit(locLimit, 'Locations'),
        maxMembers: limit(memberLimit, 'Members'),
        active: v.active,
      };
      return initial ? api.patch(`/platform/packages/${initial.id}`, body) : api.post('/platform/packages', body);
    },
    onSuccess: () => {
      toast.ok(initial ? 'Package saved' : 'Package created');
      void refresh('platform');
      onDone();
    },
  });

  return (
    <form
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        save.mutate();
      }}
      className="space-y-5"
    >
      <div className="grid gap-3 sm:grid-cols-[1fr_12rem_9rem]">
        <Field label="Package name">
          <Input required value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} maxLength={80} />
        </Field>
        <Field label="Price (PKR)">
          <Input inputMode="decimal" required placeholder="19000" value={v.price} onChange={(e) => setV({ ...v, price: e.target.value })} />
        </Field>
        <Field label="Billed">
          <Select value={v.interval} onChange={(e) => setV({ ...v, interval: e.target.value as 'month' | 'year' })}>
            <option value="month">Monthly</option>
            <option value="year">Yearly</option>
          </Select>
        </Field>
      </div>
      <Field label="Short description" hint="Shown to you when assigning a package.">
        <Textarea value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} rows={2} maxLength={500} />
      </Field>

      <fieldset>
        <legend className="display-sm mb-1 text-base">Functionality</legend>
        <p className="mb-3 text-xs text-slate">Always included: {catalog.data?.core.join(', ').toLowerCase()}. Pick what else this package unlocks.</p>
        <div className="surface divide-y divide-line px-4">
          {defs.map((f) => (
            <label key={f.key} className="flex cursor-pointer items-start gap-3 py-2.5">
              <input type="checkbox" checked={features.includes(f.key)} onChange={() => toggle(f.key)} className="mt-1 size-4 accent-ink" />
              <span className="text-sm">
                <span className="font-semibold">{f.label}</span>
                <span className="block text-xs text-slate">
                  {f.description}
                  {f.requires?.length ? ` Needs ${f.requires.map((r) => FEATURE_LABELS[r as FeatureKey].toLowerCase()).join(' and ')}.` : ''}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="display-sm mb-2 text-base">Limits</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Locations" hint="Leave empty for no limit.">
            <Input type="number" min={1} value={locLimit} placeholder="No limit" onChange={(e) => setLocLimit(e.target.value)} />
          </Field>
          <Field label="Members" hint="Everyone except cancelled members counts.">
            <Input type="number" min={1} value={memberLimit} placeholder="No limit" onChange={(e) => setMemberLimit(e.target.value)} />
          </Field>
        </div>
      </fieldset>

      <label className="flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} className="size-4 accent-ink" />
        Offer this package to new coworking spaces
      </label>
      {initial && initial.tenants > 0 && (
        <p className="rounded-lg border border-signal-deep/30 bg-hold-wash px-3 py-2 text-sm">
          {initial.tenants} {initial.tenants === 1 ? 'coworking space uses' : 'coworking spaces use'} this package. Changes to features and limits apply to them straight away.
        </p>
      )}
      {save.error && <ErrorNote error={new Error(errorMessage(save.error))} />}
      <div className="flex justify-end gap-2">
        <Button onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save package'}
        </Button>
      </div>
    </form>
  );
}

export default function Packages() {
  const packages = usePackages();
  const [editing, setEditing] = useState<PackageRow | 'new' | null>(null);

  return (
    <>
      <PageHeader title="Packages" sub="What coworking spaces subscribe to: a set of functionality, limits and a price in PKR.">
        <Button variant="primary" onClick={() => setEditing('new')}>
          Create a package
        </Button>
      </PageHeader>

      {packages.isLoading ? (
        <Loading />
      ) : packages.error ? (
        <ErrorNote error={packages.error} />
      ) : !packages.data?.length ? (
        <Empty title="No packages yet" hint="Create one to start registering coworking spaces." action={<Button variant="primary" onClick={() => setEditing('new')}>Create a package</Button>} />
      ) : (
        <div className="surface-table">
          <table className="tbl">
            <thead>
              <tr>
                <th>Package</th>
                <th className="r">Price</th>
                <th>Functionality</th>
                <th>Limits</th>
                <th className="r">Spaces</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {packages.data.map((p) => (
                <tr key={p.id} className="align-top">
                  <td>
                    <span className="display-sm text-[15px]">{p.name}</span>
                    {!p.active && (
                      <span className="ml-2 align-middle">
                        <Chip tone="idle">Not offered</Chip>
                      </span>
                    )}
                    {p.description && <span className="mt-0.5 block max-w-56 text-xs text-slate">{p.description}</span>}
                  </td>
                  <td className="r whitespace-nowrap">
                    <span className="display-sm text-[15px]">{money(p.priceCents, 'PKR')}</span>
                    <span className="block text-xs text-slate">per {intervalLabel(p.interval)}</span>
                  </td>
                  <td className="max-w-80 text-sm">
                    {p.features.length ? p.features.map((f) => FEATURE_LABELS[f]).join(', ') : <span className="text-slate">Core features only</span>}
                  </td>
                  <td className="whitespace-nowrap text-sm">
                    {p.maxLocations ?? 'Unlimited'} {p.maxLocations === 1 ? 'location' : 'locations'}
                    <span className="block text-slate">{p.maxMembers ? `${p.maxMembers} members` : 'Unlimited members'}</span>
                  </td>
                  <td className="r">{p.tenants}</td>
                  <td className="r">
                    <Button small variant="ghost" onClick={() => setEditing(p)}>
                      Edit
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Create a package' : 'Edit package'} wide>
        {editing && <PackageForm initial={editing === 'new' ? undefined : editing} onDone={() => setEditing(null)} />}
      </Modal>
    </>
  );
}
