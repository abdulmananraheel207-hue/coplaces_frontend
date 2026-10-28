import { useState } from 'react';
import { Button, Modal } from './ui';

/** Shows a one-time temporary password after creating an account or resetting it. */
export function CredentialsModal({ info, onClose }: { info: { name: string; email: string; password: string } | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <Modal open={info !== null} onClose={onClose} title="Share these sign-in details">
      {info && (
        <div className="space-y-4">
          <p className="text-sm">
            {info.name} can sign in with the details below. The password is shown only now, so copy it before closing.
          </p>
          <dl className="divide-y divide-line rounded-xl border border-line px-3 text-sm">
            <div className="flex justify-between gap-4 py-2">
              <dt className="text-slate">Email</dt>
              <dd className="font-semibold">{info.email}</dd>
            </div>
            <div className="flex justify-between gap-4 py-2">
              <dt className="text-slate">Temporary password</dt>
              <dd className="num font-mono text-[15px] font-semibold" data-testid="temp-password">
                {info.password}
              </dd>
            </div>
          </dl>
          <div className="flex justify-end gap-2">
            <Button
              onClick={() => {
                void navigator.clipboard?.writeText(info.password).then(() => setCopied(true));
              }}
            >
              {copied ? 'Copied' : 'Copy password'}
            </Button>
            <Button variant="primary" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
