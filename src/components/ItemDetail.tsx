import type { ReactNode } from 'react';
import { isRoomKind, resourceLabel } from '../lib/catalogue';
import type { SpaceItem } from '../lib/spaceState';
import { plural } from '../lib/format';
import { PhotoStrip } from './Photos';
import { Button, Chip } from './ui';

/** The panel that opens under the 3D view when a room, desk or office is selected. */
export function ItemDetail({ item, children, extra, onClose }: { item: SpaceItem; children?: ReactNode; /** More to show under the details, such as open problems. */ extra?: ReactNode; onClose?: () => void }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 surface p-5" role="region" aria-label={`${item.name} details`}>
      <div className="min-w-0 flex-1">
        <h3 className="display text-xl">{item.name}</h3>
        <p className="text-sm text-slate">
          {[resourceLabel(item.kind, item.style), item.floor ? `floor ${item.floor}` : '', isRoomKind(item.kind) || item.kind === 'office' ? plural(item.capacity, 'seat') : '', item.rate ?? '', item.amenities]
            .filter(Boolean)
            .join(', ')}
        </p>
        <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <Chip tone={item.tone}>{item.status}</Chip>
          {item.detail && <span className="text-slate">{item.detail}</span>}
          {item.hours && <span className="text-slate">Open {item.hours}</span>}
        </p>
        {item.description && <p className="mt-2 max-w-prose text-sm whitespace-pre-line">{item.description}</p>}
        {!!item.photoIds?.length && (
          <div className="mt-3">
            <PhotoStrip ids={item.photoIds} name={item.name} />
          </div>
        )}
        {extra}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {children}
        {onClose && (
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        )}
      </div>
    </div>
  );
}
