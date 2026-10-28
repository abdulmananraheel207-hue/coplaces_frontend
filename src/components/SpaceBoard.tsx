import { useMemo, useState, type ReactNode } from 'react';
import { useFeature, useLocation } from '../auth';
import { useFloorObjects } from '../lib/queries';
import type { SpaceItem } from '../lib/spaceState';
import { SpaceViewer, webglAvailable } from './space3d/SpaceViewer';
import { Segmented } from './ui';

const KEY = 'coplaces.spaceView';

function readMode(): '3d' | 'list' {
  try {
    return localStorage.getItem(KEY) === 'list' ? 'list' : '3d';
  } catch {
    return '3d';
  }
}

/**
 * The 3D floor view with a switch to the plain list. Falls back to the list alone when the package
 * does not include the 3D view or the browser cannot do WebGL.
 */
/** Whether this user can see the 3D view: the package includes it and the browser can draw it. */
export function use3d() {
  const entitled = useFeature('floor_3d');
  const webgl = useMemo(webglAvailable, []);
  return entitled && webgl;
}

export function SpaceBoard({
  items,
  selectedId,
  onSelect,
  renderDetail,
  list,
  heightClass,
  aside,
  heat,
}: {
  items: SpaceItem[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  renderDetail?: (item: SpaceItem) => ReactNode;
  list?: ReactNode;
  heightClass?: string;
  /** Extra controls shown beside the 3D/List switch, such as a time picker. */
  aside?: ReactNode;
  /** How busy each space has been, 0 to 1 by space id. Colours the 3D view. */
  heat?: Record<string, number>;
}) {
  const entitled = useFeature('floor_3d');
  const webgl = useMemo(webglAvailable, []);
  const loc = useLocation();
  const objects = useFloorObjects(loc.id, entitled && webgl);
  const [mode, setModeState] = useState<'3d' | 'list'>(readMode);
  const setMode = (m: '3d' | 'list') => {
    setModeState(m);
    try {
      localStorage.setItem(KEY, m);
    } catch {
      // not persisted; fine
    }
  };

  if (!entitled || !webgl) return <>{list ?? null}</>;

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        {list ? (
        <Segmented
          label="How to view spaces"
          value={mode}
          onChange={setMode}
          options={[
            { value: '3d', label: '3D floor' },
            { value: 'list', label: 'List' },
          ]}
        />
        ) : <span />}
        {(mode === '3d' || !list) && aside}
      </div>
      {mode === '3d' || !list ? <SpaceViewer items={items} objects={objects.data} selectedId={selectedId} onSelect={onSelect} renderDetail={renderDetail} heightClass={heightClass} heat={heat} /> : list}
    </>
  );
}
