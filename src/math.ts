/**
 * The content offset a label should describe at scroll position `offset`.
 * It slides from the top of the viewport (at the start) to its bottom (at the end), so the last
 * section is reachable even when it's shorter than a screen.
 */
export function labelPosition(offset: number, contentHeight: number, viewportHeight: number): number {
  'worklet';
  const maxScroll = Math.max(1, contentHeight - viewportHeight);
  const t = Math.min(1, Math.max(0, offset / maxScroll));
  return Math.min(contentHeight - 1, offset + t * viewportHeight);
}

/** Index of the section that contains `y`, given ascending section start offsets. */
export function sectionIndexAt(starts: readonly number[], y: number): number {
  'worklet';
  // Binary search: lists can have thousands of sections (e.g. one per day).
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid]! <= y + 0.5) lo = mid;
    else hi = mid - 1;
  }
  return Math.max(0, lo);
}

/** Index of the first of `values` that passes `test`, which flips from false to true once (`length` if none). */
export function firstIndexWhere(values: readonly number[], test: (value: number) => boolean): number {
  let lo = 0;
  let hi = values.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (test(values[mid]!)) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

export function clamp(value: number, min: number, max: number): number {
  'worklet';
  return Math.min(max, Math.max(min, value));
}
