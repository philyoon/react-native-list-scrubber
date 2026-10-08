// Defined first: a worklet captures the worklets it calls when it's defined
export function clamp(value: number, min: number, max: number): number {
  'worklet';
  return Math.min(max, Math.max(min, value));
}

/**
 * The content offset a label should describe at scroll position `offset`.
 * It slides from the top of the list's visible part (at the start) to its bottom (at the end), so the last
 * section is reachable even when it's shorter than a screen. `cover` is how much of the list's top is covered
 * (a top bar's visible part): the label describes the rows below it.
 */
export function labelPosition(
  offset: number,
  contentHeight: number,
  viewportHeight: number,
  cover = 0,
): number {
  'worklet';
  const maxScroll = Math.max(1, contentHeight - viewportHeight);
  const t = Math.min(1, Math.max(0, offset / maxScroll));
  return Math.min(contentHeight - 1, offset + cover + t * (viewportHeight - cover));
}

/** A top bar as a scroll sees it: its full `height`, how much of it is `hidden` now, and if it's `fixed` */
export interface BarState {
  height: number;
  hidden: number;
  /** It stays as it is while the list scrolls (with a screen reader on) */
  fixed: boolean;
}

/**
 * Where to scroll from `from` so content offset `to` comes to just below a top bar's visible part, once the
 * bar has followed the scroll there: it hides by as much as the list scrolls down and shows by as much as it
 * scrolls up, and shows in full at the top (useListScrubber). `scroll` is within 0…maxScroll; `cover` is how
 * much of the bar shows there. Without a bar, that's `to` itself, clamped.
 */
export function scrollBelowBar(
  to: number,
  from: number,
  bar: BarState,
  maxScroll: number,
): { scroll: number; cover: number } {
  'worklet';
  const { height, hidden, fixed } = bar;
  const y = Math.max(0, from);
  const coverAt = (s: number) => height - (fixed ? hidden : clamp(hidden + s - y, 0, Math.min(height, s)));
  // `to` above the offset just below the bar now is reached scrolling up, which shows the bar in full by the
  // time it's there; below it, scrolling down, which hides the bar. Already there, it stays
  const below = y + coverAt(y);
  const target = fixed ? to - coverAt(y) : to < below ? to - height : to > below ? to : y;
  const scroll = clamp(target, 0, Math.max(0, maxScroll));
  return { scroll, cover: coverAt(scroll) };
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

/**
 * Index of the first of `values` that passes `test`, which flips from false to true once (`length` if none).
 */
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
