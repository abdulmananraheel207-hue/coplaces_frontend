import type { Bitmap } from './types';

/** A blank sheet to draw test floor plans on, with just enough drawing tools to make walls, doors and desks. Only tests use it. */
export class Sheet {
  readonly data: Uint8ClampedArray;

  constructor(
    readonly width: number,
    readonly height: number,
    paper = 255,
    private readonly ink = 0,
  ) {
    this.data = new Uint8ClampedArray(width * height * 4).fill(255);
    for (let i = 0; i < width * height; i++) this.data.fill(paper, i * 4, i * 4 + 3);
  }

  private put(x: number, y: number, v: number) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const p = (Math.floor(y) * this.width + Math.floor(x)) * 4;
    this.data[p] = this.data[p + 1] = this.data[p + 2] = v;
  }

  /** A filled rectangle. */
  fill(x: number, y: number, w: number, h: number, v = this.ink) {
    for (let j = Math.round(y); j < Math.round(y + h); j++) for (let i = Math.round(x); i < Math.round(x + w); i++) this.put(i, j, v);
  }

  /** A horizontal wall from x1 to x2, centred on y, with doorways cut out of it as [from, to] pairs. */
  across(x1: number, x2: number, y: number, thick = 5, gaps: [number, number][] = []) {
    let from = x1;
    for (const [a, b] of [...gaps].sort((p, q) => p[0] - q[0]).concat([[x2, x2]])) {
      this.fill(from, y - thick / 2, a - from, thick);
      from = b;
    }
  }

  /** A vertical wall from y1 to y2, centred on x. */
  down(y1: number, y2: number, x: number, thick = 5, gaps: [number, number][] = []) {
    let from = y1;
    for (const [a, b] of [...gaps].sort((p, q) => p[0] - q[0]).concat([[y2, y2]])) {
      this.fill(x - thick / 2, from, thick, a - from);
      from = b;
    }
  }

  /** The outline of a rectangle. */
  frame(x: number, y: number, w: number, h: number, thick = 5) {
    this.across(x - thick / 2, x + w + thick / 2, y, thick);
    this.across(x - thick / 2, x + w + thick / 2, y + h, thick);
    this.down(y, y + h, x, thick);
    this.down(y, y + h, x + w, thick);
  }

  /** A little scribble that stands in for text: short strokes that must never be mistaken for walls. */
  scribble(x: number, y: number, w: number) {
    for (let i = 0; i < w; i += 7) this.fill(x + i, y + (i % 14 ? 0 : 4), 3, 5);
  }

  bitmap(): Bitmap {
    return { data: this.data, width: this.width, height: this.height };
  }
}
