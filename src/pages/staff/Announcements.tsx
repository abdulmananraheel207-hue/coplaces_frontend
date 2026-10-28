import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api, errorMessage } from '../../api';
import { useLocation } from '../../auth';
import { useToast } from '../../components/toast';
import { Button, Chip, Empty, ErrorNote, Field, Input, Loading, Modal, PageHeader, Select, Textarea } from '../../components/ui';
import { useAnnouncements, useRefresh } from '../../lib/queries';
import { fmtDateTime } from '../../lib/time';
import type { Announcement } from '../../types';

type When = 'draft' | 'now' | 'later';

/** An ISO instant as the value of a datetime-local field, in the browser's time. */
const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

function AnnouncementForm({ initial, onDone }: { initial?: Announcement; onDone: () => void }) {
  const loc = useLocation();
  const toast = useToast();
  const refresh = useRefresh();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [when, setWhen] = useState<When>(!initial || initial.draft ? 'draft' : initial.state === 'scheduled' ? 'later' : 'now');
  const [at, setAt] = useState(initial?.publishAt ? toLocalInput(initial.publishAt) : '');
  const save = useMutation({
    mutationFn: () => {
      if (when === 'later' && !at) throw new Error('Pick the date and time it should go out');
      const payload = { title, body, draft: when === 'draft', publishAt: when === 'later' ? new Date(at).toISOString() : null };
      return initial ? api.patch(`/announcements/${initial.id}`, payload) : api.post('/announcements', { ...payload, locationId: loc.id });
    },
    onSuccess: () => {
      toast.ok(when === 'draft' ? 'Saved as a draft' : when === 'now' ? 'Announcement is live' : 'Announcement scheduled');
      void refresh('announcements');
      onDone();
    },
  });
  return (
    <form
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        save.mutate();
      }}
      className="space-y-4"
    >
      <Field label="Title">
        <Input required maxLength={150} value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="Message">
        <Textarea rows={6} maxLength={5000} value={body} onChange={(e) => setBody(e.target.value)} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Publish">
          <Select value={when} onChange={(e) => setWhen(e.target.value as When)}>
            <option value="draft">Keep as a draft</option>
            <option value="now">Show to members now</option>
            <option value="later">Show to members at a set time</option>
          </Select>
        </Field>
        {when === 'later' && (
          <Field label="Goes live">
            <Input type="datetime-local" required value={at} onChange={(e) => setAt(e.target.value)} />
          </Field>
        )}
      </div>
      {save.error && <ErrorNote error={new Error(errorMessage(save.error))} />}
      <div className="flex justify-end gap-2">
        <Button onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={!title.trim() || save.isPending}>
          Save
        </Button>
      </div>
    </form>
  );
}

export default function Announcements() {
  const loc = useLocation();
  const toast = useToast();
  const refresh = useRefresh();
  const q = useAnnouncements(loc.id);
  const [editing, setEditing] = useState<Announcement | 'new' | null>(null);
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/announcements/${id}`),
    onSuccess: () => {
      toast.ok('Announcement deleted');
      void refresh('announcements');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const tone = { draft: 'idle', scheduled: 'hold', live: 'ok' } as const;
  const label = { draft: 'Draft', scheduled: 'Scheduled', live: 'Live' } as const;

  return (
    <>
      <PageHeader title="Announcements" sub="Notices members see on their home page.">
        <Button variant="primary" onClick={() => setEditing('new')}>
          New announcement
        </Button>
      </PageHeader>

      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorNote error={q.error} />
      ) : !q.data?.length ? (
        <Empty title="No announcements" hint="Tell members about a holiday closure, maintenance or an event." action={<Button variant="primary" onClick={() => setEditing('new')}>New announcement</Button>} />
      ) : (
        <ul className="surface divide-y divide-line px-4">
          {q.data.map((a) => (
            <li key={a.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{a.title}</span>
                  <Chip tone={tone[a.state]}>{label[a.state]}</Chip>
                </p>
                {a.body && <p className="mt-1 line-clamp-2 whitespace-pre-line text-sm text-slate">{a.body}</p>}
                {a.state === 'scheduled' && a.publishAt && <p className="num mt-1 text-xs text-slate">Goes live {fmtDateTime(a.publishAt, loc.timezone)}</p>}
              </div>
              <span className="flex gap-1">
                <Button small variant="ghost" onClick={() => setEditing(a)}>
                  Edit
                </Button>
                <Button small variant="ghost" disabled={remove.isPending} onClick={() => window.confirm(`Delete "${a.title}"?`) && remove.mutate(a.id)}>
                  Delete
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'New announcement' : 'Edit announcement'} wide>
        {editing && <AnnouncementForm initial={editing === 'new' ? undefined : editing} onDone={() => setEditing(null)} />}
      </Modal>
    </>
  );
}
