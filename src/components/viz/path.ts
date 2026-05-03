/** Tiny shared helpers for the visualizations. */

export type Point = { x: number; y: number };

/**
 * Build a smooth SVG path through the given points using quadratic curves
 * anchored at midpoints (cheap Catmull-Rom-ish interpolation).
 */
export function smoothPath(points: Point[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M${points[0].x},${points[0].y}`;
  if (points.length === 2) {
    return `M${points[0].x},${points[0].y} L${points[1].x},${points[1].y}`;
  }
  const [first, ...rest] = points;
  let d = `M${first.x.toFixed(2)},${first.y.toFixed(2)}`;
  for (let i = 0; i < rest.length - 1; i++) {
    const p = rest[i];
    const next = rest[i + 1];
    const mx = (p.x + next.x) / 2;
    const my = (p.y + next.y) / 2;
    d += ` Q${p.x.toFixed(2)},${p.y.toFixed(2)} ${mx.toFixed(2)},${my.toFixed(2)}`;
  }
  const last = rest[rest.length - 1];
  d += ` L${last.x.toFixed(2)},${last.y.toFixed(2)}`;
  return d;
}

/** Map a value from one range to another. */
export function lerp(v: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
  if (inMax === inMin) return outMin;
  const t = (v - inMin) / (inMax - inMin);
  return outMin + t * (outMax - outMin);
}
