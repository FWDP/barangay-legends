// How prices and times rise with each copy built or tile cleared: a gentle curve,
// 1 + linear·n + quadratic·n² (rules.json), so late building stays affordable but still
// meaningful, instead of the old exponential growth that made the 50th house cost thousands.
export interface Curve {
  linear: number;
  quadratic: number;
}

/** The multiplier for the item after `n` earlier ones (1 for the first). */
export const curveFactor = (c: Curve, n: number) => 1 + c.linear * n + c.quadratic * n * n;
