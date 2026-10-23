// Screen <-> world transforms. World units are tiles; TILE pixels per tile at zoom 1.

export const TILE = 32;

export class Camera {
  /** World-pixel coordinate at the top-left of the view. */
  x = 0;
  y = 0;
  zoom = 1;
  viewW = 800;
  viewH = 600;

  constructor(
    private worldW: number,
    private worldH: number,
  ) {}

  /** Tile coords -> screen pixels. */
  toScreen(wx: number, wy: number): { x: number; y: number } {
    return { x: (wx * TILE - this.x) * this.zoom, y: (wy * TILE - this.y) * this.zoom };
  }

  /** Screen pixels -> tile coords. */
  toWorld(sx: number, sy: number): { x: number; y: number } {
    return { x: (sx / this.zoom + this.x) / TILE, y: (sy / this.zoom + this.y) / TILE };
  }

  centerOn(wx: number, wy: number): void {
    this.x = wx * TILE - this.viewW / this.zoom / 2;
    this.y = wy * TILE - this.viewH / this.zoom / 2;
    this.clamp();
  }

  pan(dx: number, dy: number): void {
    this.x += dx / this.zoom;
    this.y += dy / this.zoom;
    this.clamp();
  }

  zoomAt(sx: number, sy: number, factor: number): void {
    const before = this.toWorld(sx, sy);
    this.zoom = Math.min(1.6, Math.max(0.5, this.zoom * factor));
    this.x = before.x * TILE - sx / this.zoom;
    this.y = before.y * TILE - sy / this.zoom;
    this.clamp();
  }

  clamp(): void {
    const margin = 64;
    const maxX = this.worldW * TILE - this.viewW / this.zoom + margin;
    const maxY = this.worldH * TILE - this.viewH / this.zoom + margin;
    this.x = Math.min(Math.max(-margin, this.x), Math.max(-margin, maxX));
    this.y = Math.min(Math.max(-margin, this.y), Math.max(-margin, maxY));
  }

  /** Visible tile range (inclusive), padded. */
  visibleTiles(pad = 2): { x0: number; y0: number; x1: number; y1: number } {
    const a = this.toWorld(0, 0);
    const b = this.toWorld(this.viewW, this.viewH);
    return {
      x0: Math.floor(a.x) - pad,
      y0: Math.floor(a.y) - pad,
      x1: Math.ceil(b.x) + pad,
      y1: Math.ceil(b.y) + pad,
    };
  }
}
