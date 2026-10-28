import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api, errorMessage } from '../api';
import { useLocation } from '../auth';
import { useRefresh, useResources } from '../lib/queries';
import type { IssuePriority } from '../types';
import { useToast } from './toast';
import { Button, ErrorNote, Field, Input, Modal, Select, Textarea } from './ui';

function Form({ resourceId, onDone }: { resourceId?: string; onDone: () => void }) {
  const loc = useLocation();
  const toast = useToast();
  const refresh = useRefresh();
  const spaces = useResources(loc.id);
  const list = (spaces.data ?? []).filter((r) => r.status !== 'retired');
  const [space, setSpace] = useState(resourceId ?? '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<IssuePriority>('normal');
  const send = useMutation({
    mutationFn: () => api.post('/issues', { resourceId: space, title, description, priority }),
    onSuccess: () => {
      toast.ok('Thank you. The team has been told.');
      void refresh('issues');
      onDone();
    },
  });
  return (
    <form
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        send.mutate();
      }}
      className="space-y-4"
    >
      <Field label="Where">
        <Select required value={space} onChange={(e) => setSpace(e.target.value)} disabled={!!resourceId}>
          <option value="">Choose a room, desk or space</option>
          {list.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
              {r.floor ? `, floor ${r.floor}` : ''}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="What is wrong">
        <Input required maxLength={150} value={title} placeholder="The air conditioning is not cooling" onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="More detail (optional)">
        <Textarea rows={3} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <Field label="How urgent is it">
        <Select value={priority} onChange={(e) => setPriority(e.target.value as IssuePriority)}>
          <option value="low">Not urgent</option>
          <option value="normal">Normal</option>
          <option value="urgent">Urgent: it stops people working</option>
        </Select>
      </Field>
      {send.error && <ErrorNote error={new Error(errorMessage(send.error))} />}
      <div className="flex justify-end gap-2">
        <Button onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={!space || !title.trim() || send.isPending}>
          Send report
        </Button>
      </div>
    </form>
  );
}

/** Anyone can report a problem with a room, desk or any other space. The team sees it on their maintenance page. */
export function ReportProblem({ open, onClose, resourceId }: { open: boolean; onClose: () => void; resourceId?: string }) {
  return (
    <Modal open={open} onClose={onClose} title="Report a problem">
      {open && <Form resourceId={resourceId} onDone={onClose} />}
    </Modal>
  );
}
