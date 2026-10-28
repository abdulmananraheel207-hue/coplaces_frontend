import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { ChevronLeft, ChevronRight, FileUp, LoaderCircle } from 'lucide-react';
import { OBJECTS, resourceLabel } from '../../lib/catalogue';
import { ACCEPT, PlanFileError, openPlanFile, type PlanSource, type Rendered } from '../../lib/planFile';
import type { Frac } from '../../types';
import { detectRegions } from '../../lib/planVision/detect';
import { readWords } from '../../lib/planVision/ocr';
import { guessWidth, interpret, toReading, type Overrides } from '../../lib/planVision/interpret';
import { AMENITY_TYPES, ROOM_TYPES, ROOM_TYPE_KEYS, type Item, type ItemType, type Region, type RoomType, type Word } from '../../lib/planVision/types';
import { Button, ErrorNote, Field, Input, Modal, Segmented, Select } from '../ui';
import { boxOf, isResource, type Draft } from './editorModel';
import { floorLabel } from './layout';
import { importPlan, pictureSize, type ImportResult } from './importLayout';

/** What the editor needs to put an imported plan on the floor. */
export interface Imported {
  draft: Draft;
  floor: string;
  /** The picture to draw under the floor, and where it sits in the plan's coordinates. */
  picture: { blob: Blob; x: number; z: number; w: number; d: number };
  /** One line saying what happened. */
  summary: string;
}

const MIN_WIDTH = 3;
const MAX_WIDTH = 300;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** What was added, in a sentence. */
function describe(a: ImportResult['added']) {
  const parts = [a.rooms && plural(a.rooms, 'room'), a.desks && plural(a.desks, 'desk'), a.amenities && plural(a.amenities, 'amenity', 'amenities')].filter(Boolean);
  return parts.length ? parts.join(', ') : 'nothing';
}

function typeLabel(t: ItemType) {
  if (t === 'skip') return 'Left out';
  if (t === 'desks') return 'Block of desks';
  if (t in ROOM_TYPES) {
    const r = ROOM_TYPES[t as RoomType];
    return resourceLabel(r.kind, r.style);
  }
  return OBJECTS[t as keyof typeof OBJECTS].label;
}

const tone = (t: ItemType) =>
  t === 'skip'
    ? 'border-slate/50 border-dashed bg-transparent'
    : t === 'desks'
      ? 'border-signal-deep bg-signal/30'
      : t === 'boardroom' || t === 'training_hall'
        ? 'border-mine bg-mine/15'
        : t in ROOM_TYPES
          ? 'border-ok bg-ok/15'
          : 'border-ink border-dashed bg-ink/10';

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The plan with a box drawn where each thing was found, so a wrong read is easy to spot. */
function Findings({
  items,
  outline,
  widthMetres,
  src,
  width,
  height,
  hover,
}: {
  items: Item[];
  outline: Box;
  widthMetres: number;
  src: string;
  width: number;
  height: number;
  hover: string | null;
}) {
  const pos = (b: Box) => ({ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%` });
  const tag = 'absolute top-0 left-0 max-w-full truncate bg-white/90 px-1 text-[10px] leading-4 font-semibold text-ink';
  return (
    <div className="relative mx-auto max-h-120 w-fit max-w-full border border-line bg-white">
      <img src={src} width={width} height={height} alt="Your floor plan" className="block max-h-120 max-w-full" />
      <div aria-hidden className="absolute inset-0">
        <div className="absolute border border-dashed border-busy" style={pos(outline)}>
          <span className="absolute -top-5 left-1/2 -translate-x-1/2 bg-white/90 px-1 text-[10px] leading-4 font-semibold whitespace-nowrap text-busy">Width: {widthMetres} m</span>
        </div>
        {items.map((it) => (
          <div key={it.id} className={`absolute border-2 ${tone(it.type)} ${hover === it.id ? 'z-10 ring-2 ring-ink' : ''}`} style={pos(it.box)}>
            <span className={tag}>{it.type === 'desks' ? `${it.rows} × ${it.columns} desks` : it.label || typeLabel(it.type)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface Analysis {
  regions: Region[];
  notes: string[];
  /** What the building's own walls cover, when it could be told. */
  extent?: Frac;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export default function PlanImport({
  open,
  onClose,
  floors,
  floor: currentFloor,
  draft,
  takenNames,
  nextSerial,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  floors: string[];
  floor: string;
  draft: Draft;
  takenNames: string[];
  nextSerial: () => number;
  onApply: (imported: Imported) => void;
}) {
  const [source, setSource] = useState<PlanSource | null>(null);
  const [page, setPage] = useState(1);
  /** The page the importer opened by itself, when it was not the first. */
  const [autoPage, setAutoPage] = useState<number | null>(null);
  const [rendered, setRendered] = useState<Rendered | null>(null);
  const [busy, setBusy] = useState(false);
  const [fileError, setFileError] = useState('');
  const [dragging, setDragging] = useState(false);

  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [analysing, setAnalysing] = useState(false);
  const [widthText, setWidthText] = useState('');
  const [widthEdited, setWidthEdited] = useState(false);
  const [overrides, setOverrides] = useState<Overrides>({});
  const [hover, setHover] = useState<string | null>(null);
  const [targetFloor, setTargetFloor] = useState(currentFloor);
  const [replace, setReplace] = useState(true);
  const [deskKind, setDeskKind] = useState<'hot_desk' | 'dedicated_desk'>('hot_desk');
  /** Text read from a picture that carries none of its own. */
  const [ocrWords, setOcrWords] = useState<Word[] | null>(null);
  const [readingText, setReadingText] = useState(false);
  /** The building's edges as the owner has set them, in place of the ones found. */
  const [edges, setEdges] = useState<Frac | null>(null);
  const [calId, setCalId] = useState('');
  const [calText, setCalText] = useState('');

  // Hold on to the latest of these for cleanup, which must not depend on them.
  const held = useRef({ source, rendered });
  held.current = { source, rendered };
  useEffect(
    () => () => {
      held.current.source?.close();
      if (held.current.rendered) URL.revokeObjectURL(held.current.rendered.url);
    },
    [],
  );

  // Opening the dialog aims at the floor being looked at, unless a plan is already being reviewed.
  useEffect(() => {
    if (open && !analysis) setTargetFloor(currentFloor);
  }, [open, currentFloor, analysis]);

  // Look for the rooms as soon as there is a picture. It takes a fraction of a second, done here in the browser.
  useEffect(() => {
    setAnalysis(null);
    setOverrides({});
    setWidthEdited(false);
    setEdges(null);
    setCalId('');
    if (!rendered) return;
    let live = true;
    setAnalysing(true);
    // Let the picture paint first.
    const timer = setTimeout(() => {
      let next: Analysis;
      try {
        const found = detectRegions(rendered.pixels);
        next = { regions: found.regions, notes: found.notes, extent: found.extent };
      } catch {
        next = { regions: [], notes: ['That picture could not be read.'] };
      }
      if (!live) return;
      setAnalysis(next);
      setAnalysing(false);
    }, 40);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [rendered]);

  // A picture has no text of its own, so its room names and printed sizes are read from it, in the background.
  useEffect(() => {
    setOcrWords(null);
    if (!rendered || rendered.words.length) return;
    let live = true;
    setReadingText(true);
    readWords(rendered.blob)
      .then((w) => live && setOcrWords(w))
      .catch(() => undefined)
      .finally(() => live && setReadingText(false));
    return () => {
      live = false;
    };
  }, [rendered]);
  const words = useMemo(() => (rendered?.words.length ? rendered.words : (ocrWords ?? [])), [rendered, ocrWords]);

  // The size is worked out again when the text arrives, unless the owner has already given one.
  const guess = useMemo(() => (analysis && rendered ? guessWidth(analysis.regions, words, rendered.height / rendered.width, analysis.extent) : null), [analysis, rendered, words]);
  useEffect(() => {
    if (guess && !widthEdited) setWidthText(String(guess.widthMetres));
  }, [guess, widthEdited]);

  const show = useCallback(async (src: PlanSource, p: number) => {
    setBusy(true);
    setFileError('');
    try {
      const next = await src.render(p);
      setRendered((old) => {
        if (old) URL.revokeObjectURL(old.url);
        return next;
      });
    } catch (e) {
      setFileError(e instanceof PlanFileError ? e.message : 'That file could not be prepared.');
    } finally {
      setBusy(false);
    }
  }, []);

  const choose = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setFileError('');
    try {
      const src = await openPlanFile(file);
      source?.close();
      setSource(src);
      const first = src.pages > 1 ? await src.bestPage() : 1;
      setAutoPage(first > 1 ? first : null);
      setPage(first);
      await show(src, first);
    } catch (e) {
      setFileError(e instanceof PlanFileError ? e.message : 'That file could not be opened.');
      setBusy(false);
    }
  };

  /** Back to choosing a file, freeing the picture. */
  const discard = () => {
    setRendered((old) => {
      if (old) URL.revokeObjectURL(old.url);
      return null;
    });
  };

  const turnPage = (p: number) => {
    if (!source || busy || analysing) return;
    setPage(p);
    setAutoPage(null);
    void show(source, p);
  };

  const width = Number(widthText);
  const widthOk = Number.isFinite(width) && width >= MIN_WIDTH && width <= MAX_WIDTH;
  const aspect = rendered ? rendered.height / rendered.width : 1;
  const onFloor = draft.things.filter((t) => t.floor === targetFloor);

  // What the picture shows, given the building's width. It is worked out again as the width and the choices change.
  const outline = edges ?? analysis?.extent;
  const options = useMemo(() => ({ widthMetres: width, aspect, overrides, ...(outline ? { outline } : {}) }), [width, aspect, overrides, outline]);
  const found = useMemo(() => (analysis && rendered && widthOk ? interpret(analysis.regions, words, options) : null), [analysis, rendered, widthOk, options, words]);
  const reading = useMemo(
    () => (found ? toReading(found, options, widthEdited ? 'stated' : (guess?.basis ?? 'estimated')) : null),
    [found, options, widthEdited, guess],
  );

  // What importing would do right now.
  const result = useMemo(() => {
    if (!reading) return null;
    let n = 0;
    return importPlan(draft, reading, { floor: targetFloor, widthMetres: width, aspect, deskKind, replace }, takenNames, () => ++n);
  }, [reading, width, aspect, draft, targetFloor, deskKind, replace, takenNames]);

  const apply = () => {
    if (!rendered || !reading || !widthOk) return;
    const done = importPlan(draft, reading, { floor: targetFloor, widthMetres: width, aspect, deskKind, replace }, takenNames, nextSerial);
    onApply({
      draft: done.draft,
      floor: targetFloor,
      picture: { blob: rendered.blob, ...done.picture },
      summary: `Added ${describe(done.added)}${done.removed ? `, replacing ${plural(done.removed, 'thing')}` : ''}.${done.skipped ? ` ${done.skipped} did not fit and ${done.skipped === 1 ? 'was' : 'were'} left out.` : ''} Check it against the plan, then save.`,
    });
  };

  /** The picture goes under the floor to trace over, centred on what is there, without adding anything. */
  const useAsGuide = () => {
    if (!rendered || !widthOk) return;
    // The width is the building's, not the sheet's, so the picture is sized from the building's outline and placed with
    // the building's middle where the floor's things are centred.
    const o = found?.outline ?? outline ?? { x: 0, y: 0, w: 1, h: 1 };
    const { w, d } = pictureSize({ outline: o }, width, aspect);
    const boxes = onFloor.map(boxOf);
    const cx = boxes.length ? boxes.reduce((s, b) => s + b.x, 0) / boxes.length : 0;
    const cz = boxes.length ? boxes.reduce((s, b) => s + b.z, 0) / boxes.length : 0;
    onApply({
      draft,
      floor: targetFloor,
      picture: { blob: rendered.blob, x: Math.round((cx - (o.x + o.w / 2) * w) * 2) / 2, z: Math.round((cz - (o.y + o.h / 2) * d) * 2) / 2, w, d },
      summary: 'The plan is under the floor. Place rooms and desks over it, then save.',
    });
  };

  const drop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void choose(e.dataTransfer.files[0]);
  };

  const items = found?.items ?? [];
  const S = found ? width / Math.max(found.outline.w, 0.01) : 1;
  const sizeOf = (it: Item) => `${(it.box.w * S).toFixed(1)} × ${(it.box.h * S * aspect).toFixed(1)} m`;
  const hasDesks = items.some((i) => i.type === 'desks');
  const o = found?.outline;
  /** Moves one edge of the building. The scale stays what it was, so the width follows the new outline. */
  const moveEdge = (side: 'left' | 'right' | 'top' | 'bottom', pct: number) => {
    if (!o) return;
    const v = pct / 100;
    const min = 0.1;
    const x0 = side === 'left' ? Math.min(v, o.x + o.w - min) : o.x;
    const x1 = side === 'right' ? Math.max(v, o.x + min) : o.x + o.w;
    const y0 = side === 'top' ? Math.min(v, o.y + o.h - min) : o.y;
    const y1 = side === 'bottom' ? Math.max(v, o.y + min) : o.y + o.h;
    const next = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    setWidthText(String(round1((width / o.w) * next.w)));
    setEdges(next);
  };
  const calItem = items.find((i) => i.id === calId);
  const calibrate = () => {
    const real = Number(calText);
    if (!calItem || !Number.isFinite(real) || real <= 0) return;
    setWidthText(String(round1((width * real) / (calItem.box.w * S))));
    setWidthEdited(true);
  };
  const nothing = !!analysis && !analysing && (analysis.regions.length === 0 || (!!found && found.items.length === 0));
  const ready = !!analysis && !nothing && !analysing;
  const floorSelect = (
    <Field label="Draw it on">
      <Select value={targetFloor} onChange={(e) => setTargetFloor(e.target.value)}>
        {floors.map((f) => (
          <option key={f || 'ground'} value={f}>
            {floorLabel(f)}
          </option>
        ))}
      </Select>
    </Field>
  );
  const widthField = (hint: string) => (
    <Field label="Width of the building, in metres" hint={widthOk ? hint : `Enter a width from ${MIN_WIDTH} to ${MAX_WIDTH} metres.`}>
      <Input
        type="number"
        inputMode="decimal"
        min={MIN_WIDTH}
        max={MAX_WIDTH}
        step="0.5"
        value={widthText}
        onChange={(e) => {
          setWidthText(e.target.value);
          setWidthEdited(true);
        }}
      />
    </Field>
  );

  return (
    <Modal open={open} onClose={onClose} title="Import a floor plan" xwide>
      {!rendered ? (
        <div className="space-y-3">
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={drop}
            className={`flex cursor-pointer flex-col items-center gap-2 border-2 border-dashed px-6 py-12 text-center transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ink ${dragging ? 'border-ink bg-signal/20' : 'border-ink/40 hover:border-ink hover:bg-plaster'}`}
          >
            {busy ? <LoaderCircle size={28} aria-hidden className="motion-safe:animate-spin" /> : <FileUp size={28} aria-hidden />}
            <span className="display-sm text-base">{busy ? 'Opening the file…' : 'Drop your floor plan here'}</span>
            <span className="text-sm text-slate">or choose a file. PDF, PNG, JPG or WebP, up to 25 MB.</span>
            <input type="file" accept={ACCEPT} className="sr-only" disabled={busy} onChange={(e) => void choose(e.target.files?.[0])} />
            <span className="mt-1 rounded-lg border border-ink bg-paper px-3.5 py-2 text-sm font-semibold">Choose a file</span>
          </label>
          {fileError && <ErrorNote error={new Error(fileError)} />}
          <p className="text-sm text-slate">
            Coplaces finds the walls, rooms, desks and amenities on the plan, right here in your browser. The file is not uploaded anywhere. You check and change everything before
            it is added, and nothing is saved until you save the floor plan. It works best on a clean top-down plan with straight walls, such as a PDF exported from drawing
            software.
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="min-w-0 space-y-2">
              {found ? (
                <Findings items={items} outline={found.outline} widthMetres={width} src={rendered.url} width={rendered.width} height={rendered.height} hover={hover} />
              ) : (
                <img
                  src={rendered.url}
                  width={rendered.width}
                  height={rendered.height}
                  alt="Your floor plan"
                  className={`mx-auto block max-h-120 max-w-full border border-line bg-white transition-opacity ${busy || analysing ? 'opacity-50' : ''}`}
                />
              )}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="min-w-0 truncate text-sm text-slate">{source?.name}</p>
                {source && source.pages > 1 && (
                  <div className="flex items-center gap-1" role="group" aria-label="PDF page">
                    <Button small aria-label="Previous page" disabled={page <= 1 || busy || analysing} onClick={() => turnPage(page - 1)}>
                      <ChevronLeft size={14} />
                    </Button>
                    <span className="num text-sm" role="status">
                      Page {page} of {source.pages}
                    </span>
                    <Button small aria-label="Next page" disabled={page >= source.pages || busy || analysing} onClick={() => turnPage(page + 1)}>
                      <ChevronRight size={14} />
                    </Button>
                  </div>
                )}
              </div>
              {autoPage === page && (
                <p className="text-[13px] text-slate">Opened page {page} because it looks like the floor plan with room sizes printed on it. Use the arrows to read another page.</p>
              )}
              {found && (
                <p className="text-[13px] text-slate">
                  <span className="inline-block size-2.5 border-2 border-ok bg-ok/15 align-middle" aria-hidden /> Rooms{' '}
                  <span className="inline-block size-2.5 border-2 border-mine bg-mine/15 align-middle" aria-hidden /> Corporate rooms{' '}
                  <span className="inline-block size-2.5 border-2 border-signal-deep bg-signal/30 align-middle" aria-hidden /> Desks{' '}
                  <span className="inline-block size-2.5 border-2 border-dashed border-ink bg-ink/10 align-middle" aria-hidden /> Amenities
                </p>
              )}
            </div>

            <div className="min-w-0 space-y-4">
              {fileError && <ErrorNote error={new Error(fileError)} />}

              {(analysing || busy) && (
                <p role="status" className="flex items-start gap-2 rounded-lg border border-line bg-mist px-3 py-2 text-sm">
                  <LoaderCircle size={16} aria-hidden className="mt-0.5 shrink-0 motion-safe:animate-spin" />
                  <span>{busy ? 'Preparing the picture…' : 'Looking for walls, rooms and desks…'}</span>
                </p>
              )}

              {nothing && (
                <div className="space-y-3">
                  <p role="alert" className="rounded-lg border border-hold/20 bg-hold-wash px-3 py-2 text-sm">
                    {analysis!.notes[0] ?? (source && source.pages > 1 ? 'No rooms were found on this page. Try another page.' : 'No rooms were found.')} This works best on a clean
                    top-down plan with straight walls and closed rooms. You can still use the picture as a guide and draw over it.
                  </p>
                  {widthField("Measure the plan's widest side. It sets the scale.")}
                  {floorSelect}
                  <div className="flex flex-wrap gap-2">
                    <Button variant="primary" disabled={!widthOk || busy} onClick={useAsGuide}>
                      Put it under the floor
                    </Button>
                    <Button variant="ghost" onClick={discard}>
                      Choose another file
                    </Button>
                  </div>
                </div>
              )}

              {ready && analysis && (
                <>
                  <div>
                    <h3 className="display-sm text-base">
                      {reading
                        ? `Found ${describe({ rooms: reading.rooms.length, desks: reading.deskBlocks.reduce((n, b) => n + b.rows * b.columns, 0), amenities: reading.amenities.length })}`
                        : 'Check the width below'}
                    </h3>
                    <p className="text-[13px] text-slate">Look over what was found. Change what is wrong, or leave it out.</p>
                  </div>

                  {widthField(widthEdited || !guess ? 'The dashed red outline on the plan is this wide.' : `${guess.note} The dashed red outline on the plan is this wide.`)}
                  {guess?.basis === 'estimated' && !widthEdited && (
                    <p className="rounded-lg border border-hold/20 bg-hold-wash px-3 py-2 text-sm">
                      The size is a guess. Rooms are named by their size, so check the width and correct it if you know it.
                    </p>
                  )}

                  {readingText && (
                    <p role="status" className="flex items-start gap-2 rounded-lg border border-line bg-mist px-3 py-2 text-sm">
                      <LoaderCircle size={16} aria-hidden className="mt-0.5 shrink-0 motion-safe:animate-spin" />
                      <span>Reading the text on the plan. Room names and sizes will improve the result when it finishes.</span>
                    </p>
                  )}

                  {o && (
                    <details className="border border-line px-3 py-2 text-sm">
                      <summary className="cursor-pointer font-semibold">Fix the size or the building edges</summary>
                      <div className="mt-3 space-y-3">
                        {items.length > 0 && (
                          <div className="space-y-1.5">
                            <p className="text-[13px] text-slate">If you know how wide one room is, pick it and enter its real width. The scale follows.</p>
                            <div className="flex flex-wrap items-center gap-2">
                              <Select aria-label="A room whose width you know" className="w-52! py-1! text-[13px]" value={calId} onChange={(e) => setCalId(e.target.value)}>
                                <option value="">Pick a room</option>
                                {items
                                  .filter((i) => i.type !== 'skip')
                                  .map((i) => (
                                    <option key={i.id} value={i.id}>
                                      {i.type === 'desks' ? `${i.rows} × ${i.columns} desks` : i.label || typeLabel(i.type)}, now {(i.box.w * S).toFixed(1)} m wide
                                    </option>
                                  ))}
                              </Select>
                              <Input
                                aria-label="Its real width in metres"
                                type="number"
                                inputMode="decimal"
                                min="0.5"
                                step="0.05"
                                placeholder="Width, m"
                                className="w-28! py-1!"
                                value={calText}
                                onChange={(e) => setCalText(e.target.value)}
                              />
                              <Button small disabled={!calItem || !(Number(calText) > 0)} onClick={calibrate}>
                                Set scale
                              </Button>
                            </div>
                          </div>
                        )}
                        <div className="space-y-1.5">
                          <p className="text-[13px] text-slate">The dashed outline should touch the building's outer walls. Move any edge that is off.</p>
                          {(
                            [
                              ['left', 'Left', o.x],
                              ['right', 'Right', o.x + o.w],
                              ['top', 'Top', o.y],
                              ['bottom', 'Bottom', o.y + o.h],
                            ] as const
                          ).map(([side, label, v]) => (
                            <label key={side} className="flex items-center gap-2 text-[13px]">
                              <span className="w-14 shrink-0">{label}</span>
                              <input type="range" min={0} max={100} step={0.25} value={v * 100} onChange={(e) => moveEdge(side, Number(e.target.value))} className="min-w-0 flex-1 accent-ink" />
                            </label>
                          ))}
                          {edges && (
                            <Button small variant="ghost" onClick={() => setEdges(null)}>
                              Back to the outline that was found
                            </Button>
                          )}
                        </div>
                      </div>
                    </details>
                  )}

                  {items.length > 0 && (
                    <ul className="max-h-64 divide-y divide-line overflow-y-auto border border-line" aria-label="What was found">
                      {items.map((it) => (
                        <li key={it.id} className="flex items-center gap-2 px-2 py-1.5" onMouseEnter={() => setHover(it.id)} onMouseLeave={() => setHover(null)}>
                          <div className="min-w-0 flex-1">
                            <p className={`truncate text-[13px] font-semibold ${it.type === 'skip' ? 'text-slate line-through' : ''}`}>
                              {it.type === 'desks' ? `${it.rows} × ${it.columns} desks` : it.label || typeLabel(it.type)}
                            </p>
                            <p className="num text-[11px] leading-snug text-slate">
                              {sizeOf(it)}, {it.why}
                            </p>
                          </div>
                          <Select
                            aria-label={`What ${it.label || 'this shape'} is`}
                            className="w-38! shrink-0 py-1! text-[13px]"
                            value={it.type}
                            onChange={(e) => setOverrides((o) => ({ ...o, [it.id]: e.target.value as ItemType }))}
                            onFocus={() => setHover(it.id)}
                            onBlur={() => setHover(null)}
                          >
                            {it.type === 'desks' ? (
                              <option value="desks">Block of desks</option>
                            ) : (
                              <>
                                <optgroup label="Rooms">
                                  {ROOM_TYPE_KEYS.map((k) => (
                                    <option key={k} value={k}>
                                      {typeLabel(k)}
                                    </option>
                                  ))}
                                </optgroup>
                                <optgroup label="Amenities">
                                  {AMENITY_TYPES.map((k) => (
                                    <option key={k} value={k}>
                                      {OBJECTS[k].label}
                                    </option>
                                  ))}
                                </optgroup>
                              </>
                            )}
                            <option value="skip">Leave out</option>
                          </Select>
                        </li>
                      ))}
                    </ul>
                  )}

                  {analysis.notes.length + (found?.notes.length ?? 0) > 0 && (
                    <ul className="space-y-1.5">
                      {[...analysis.notes, ...(found?.notes ?? [])].map((n) => (
                        <li key={n} className="rounded-lg border border-hold/20 bg-hold-wash px-3 py-2 text-sm">
                          {n}
                        </li>
                      ))}
                    </ul>
                  )}

                  {floorSelect}

                  {onFloor.length > 0 && (
                    <div>
                      <p className="mb-1 text-[13px] font-semibold">What is on {floorLabel(targetFloor).toLowerCase()} now</p>
                      <Segmented
                        label="Existing things"
                        value={replace ? 'replace' : 'keep'}
                        onChange={(v) => setReplace(v === 'replace')}
                        options={[
                          { value: 'replace', label: `Replace ${onFloor.length}` },
                          { value: 'keep', label: 'Keep, add beside' },
                        ]}
                      />
                      {replace && onFloor.some((t) => isResource(t) && t.id) && (
                        <p className="mt-1 text-xs text-slate">Spaces with bookings coming up cannot be removed. Saving will tell you which.</p>
                      )}
                    </div>
                  )}

                  {hasDesks && (
                    <div>
                      <p className="mb-1 text-[13px] font-semibold">The desks are</p>
                      <Segmented
                        label="Desk type"
                        value={deskKind}
                        onChange={setDeskKind}
                        options={[
                          { value: 'hot_desk', label: 'Hot desks' },
                          { value: 'dedicated_desk', label: 'Dedicated desks' },
                        ]}
                      />
                      <p className="mt-1 text-xs text-slate">{deskKind === 'hot_desk' ? 'Booked by the day.' : 'Assigned to one member each.'}</p>
                    </div>
                  )}

                  {result && result.skipped > 0 && <p className="rounded-lg border border-hold/20 bg-hold-wash px-3 py-2 text-sm">{result.notes.join(' ')}</p>}
                  {result && result.removed > 0 && (
                    <p className="text-sm">
                      This takes {plural(result.removed, 'thing')} off {floorLabel(targetFloor).toLowerCase()}.
                    </p>
                  )}
                  <p className="text-[13px] text-slate sm:hidden">Nothing is saved until you save the floor plan, and Undo takes this back.</p>
                </>
              )}
            </div>
          </div>

          {ready && (
            <div className="sticky bottom-0 z-10 -mx-5 -mb-4 mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line bg-paper px-5 py-3">
              <Button variant="primary" disabled={!result || result.added.rooms + result.added.desks + result.added.amenities === 0} onClick={apply}>
                Add to floor plan
              </Button>
              <Button disabled={!widthOk || busy} onClick={useAsGuide}>
                Use as tracing guide only
              </Button>
              <Button variant="ghost" onClick={discard}>
                Choose another file
              </Button>
              <p className="hidden min-w-0 flex-1 text-[13px] text-slate lg:block">Nothing is saved until you save the floor plan, and Undo takes this back.</p>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
