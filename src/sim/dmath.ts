// Deterministic maths for the simulation. Online play runs the same
// simulation on every player's machine and must reach bit-identical results
// in every browser. JavaScript guarantees that for + - * / and Math.sqrt
// (correctly rounded IEEE 754 doubles), but not for Math.hypot, sin, cos,
// atan2 and the like, whose precision each engine chooses. So the
// simulation uses these instead: built only from the guaranteed operations,
// with a fixed number of steps, they give the same bits everywhere.
// (tests/determinism.test.ts keeps the others out of src/sim and src/ai.)

const PI = 3.141592653589793;
const HALF_PI = PI / 2;
const TWO_PI = 2 * PI;

/** Length of (dx, dy). */
export function len(dx: number, dy: number): number {
  return Math.sqrt(dx * dx + dy * dy);
}

/** Distance between two points. */
export function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return len(a.x - b.x, a.y - b.y);
}

// Taylor series on |x| <= pi/4: the terms left out are below 1e-17.
function sinCore(x: number): number {
  const x2 = x * x;
  let term = x;
  let sum = x;
  for (let n = 1; n <= 8; n++) {
    term *= -x2 / ((2 * n) * (2 * n + 1));
    sum += term;
  }
  return sum;
}

function cosCore(x: number): number {
  const x2 = x * x;
  let term = 1;
  let sum = 1;
  for (let n = 1; n <= 8; n++) {
    term *= -x2 / ((2 * n - 1) * (2 * n));
    sum += term;
  }
  return sum;
}

/** sin(x) to about 1e-15, the same bits in every engine. */
export function dsin(x: number): number {
  // Into [-pi, pi], then fold onto a quarter where the series is exact enough.
  let r = x - TWO_PI * Math.round(x / TWO_PI);
  let sign = 1;
  if (r < 0) {
    r = -r;
    sign = -1;
  }
  if (r > HALF_PI) r = PI - r; // sin(pi - r) = sin(r)
  return sign * (r <= PI / 4 ? sinCore(r) : cosCore(HALF_PI - r));
}

/** cos(x) to about 1e-15, the same bits in every engine. */
export function dcos(x: number): number {
  return dsin(x + HALF_PI);
}

/** atan(t) for any t. */
function datan(t: number): number {
  if (t < 0) return -datan(-t);
  if (t > 1) return HALF_PI - datan(1 / t);
  // Halve the angle twice (atan z = 2 atan(z / (1 + sqrt(1 + z^2)))) so the
  // series below converges fast: |z| <= 0.2 after this.
  let z = t;
  z = z / (1 + Math.sqrt(1 + z * z));
  z = z / (1 + Math.sqrt(1 + z * z));
  const z2 = z * z;
  let term = z;
  let sum = z;
  for (let n = 1; n <= 12; n++) {
    term *= -z2;
    sum += term / (2 * n + 1);
  }
  return 4 * sum;
}

/** atan2(y, x) to about 1e-15, the same bits in every engine. */
export function datan2(y: number, x: number): number {
  if (x > 0) return datan(y / x);
  if (x < 0) return y >= 0 ? datan(y / x) + PI : datan(y / x) - PI;
  if (y > 0) return HALF_PI;
  if (y < 0) return -HALF_PI;
  return 0;
}
