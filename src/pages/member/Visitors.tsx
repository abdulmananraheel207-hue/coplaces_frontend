import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api, errorMessage } from '../../api';
import { useLocation } from '../../auth';
import { useToast } from '../../components/toast';
import { Button, Chip, Empty, ErrorNote, Field, Input, Loading, Modal, PageHeader } from '../../components/ui';
import { useRefresh, useVisitors } from '../../lib/queries';
import { addDays, fmtDateTime, todayIn } from '../../lib/time';

function Form({ onDone }: { onDone: () => void }) {
  const loc = useLocation();
  const toast = useToast();
  const refresh = useRefresh();
  const today = todayIn(loc.timezone);
  const [v, setV] = useState({ name: '', email: '', company: '', purpose: '', expectedDate: today, expectedTime: '10:00' });
  const set = (k: keyof typeof v, val: string) => setV((x) => ({ ...x, [k]: val }));
  const save = useMutation({
    mutationFn: () => api.post('/visitors', v),
    onSuccess: () => {
      toast.ok(`${v.name} is on the list`);
      void refresh('visitors', 'summary');
      onDone();
    },
  });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
      className="space-y-4"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Visitor name">
          <Input required value={v.name} onChange={(e) => set('name', e.target.value)} maxLength={100} />
        </Field>
        <Field label="Company">
          <Input value={v.company} onChange={(e) => set('company', e.target.value)} maxLength={120} />
        </Field>
        <Field label="Their email">
          <Input type="email" value={v.email} onChange={(e) => set('email', e.target.value)} />
        </Field>
        <Field label="Reason for visit">
          <Input value={v.purpose} onChange={(e) => set('purpose', e.target.value)} maxLength={300} />
        </Field>
        <Field label="Date">
          <Input type="date" required min={today} max={addDays(today, 180)} value={v.expectedDate} onChange={(e) => set('expectedDate', e.target.value)} />
        </Field>
        <Field label="Arriving around">
          <Input type="time" required value={v.expectedTime} onChange={(e) => set('expectedTime', e.target.value)} />
        </Field>
      </div>
      {save.error && <ErrorNote error={new Error(errorMessage(save.error))} />}
      <div className="flex justify-end gap-2">
        <Button onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={save.isPending}>
          Add visitor
        </Button>
      </div>
    </form>
  );
}

export default function MemberVisitors() {
  const loc = useLocation();
  const toast = useToast();
  const refresh = useRefresh();
  const list = useVisitors(loc.id, {});
  const [adding, setAdding] = useState(false);
  const cancel = useMutation({
    mutationFn: (id: string) => api.post(`/visitors/${id}/cancel`),
    onSuccess: () => {
      toast.ok('Visit cancelled');
      void refresh('visitors', 'summary');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const rows = [...(list.data ?? [])].sort((a, b) => b.expectedAt.localeCompare(a.expectedAt));

  return (
    <>
      <PageHeader title="Visitors" sub="Let the front desk know who is coming so they are ready.">
        <Button variant="primary" onClick={() => setAdding(true)}>
          Add a visitor
        </Button>
      </PageHeader>
      {list.isLoading ? (
        <Loading />
      ) : rows.length === 0 ? (
        <Empty title="No visitors yet" hint="Add a visitor ahead of time and they will be checked in at the desk when they arrive." action={<Button variant="primary" onClick={() => setAdding(true)}>Add a visitor</Button>} />
      ) : (
        <div className="surface-table">
          <table className="tbl">
            <thead>
              <tr>
                <th>When</th>
                <th>Visitor</th>
                <th>Status</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((v) => (
                <tr key={v.id}>
                  <td className="num whitespace-nowrap">{fmtDateTime(v.expectedAt, loc.timezone)}</td>
                  <td>
                    <span className="font-semibold">{v.name}</span>
                    {(v.company || v.purpose) && <span className="block text-xs text-slate">{[v.company, v.purpose].filter(Boolean).join(', ')}</span>}
                  </td>
                  <td>
                    <Chip tone={v.status === 'checked_in' ? 'ok' : v.status === 'expected' ? 'hold' : 'idle'}>
                      {v.status === 'checked_in' ? 'Arrived' : v.status === 'expected' ? 'Expected' : v.status === 'checked_out' ? 'Left' : 'Cancelled'}
                    </Chip>
                  </td>
                  <td className="r">
                    {v.status === 'expected' && (
                      <Button small variant="ghost" onClick={() => cancel.mutate(v.id)}>
                        Cancel
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modal open={adding} onClose={() => setAdding(false)} title="Add a visitor" wide>
        {adding && <Form onDone={() => setAdding(false)} />}
      </Modal>
    </>
  );
}
