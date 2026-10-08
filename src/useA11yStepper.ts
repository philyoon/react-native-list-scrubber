import { useMemo, useState } from 'react';
import { scrollTo, type AnimatedRef, type SharedValue } from 'react-native-reanimated';
import { scheduleOnUI } from 'react-native-worklets';
import { A11Y_PAGE, STEP_SLACK } from './defaults';
import { clamp, firstIndexWhere, labelPosition, sectionIndexAt } from './math';

/**
 * The screen-reader (and web keyboard) side: `step(±1)` scrolls to the next or previous of `steps`
 * (or one screen), `page(±1)` one screen, `jumpTo` brings a content offset to the top of the list's visible
 * part, and `value` describes the position as a section label, a `labelAt` label or a percentage. `sync`
 * re-reads the position after manual scrolling. `cover` is how much of the list's top is covered (a top bar's
 * visible part): steps land below it, and the value describes the rows there.
 */
export function useA11yStepper({
  listRef,
  scrollY,
  maxScroll,
  contentHeight,
  viewportHeight,
  steps,
  offsets,
  labels,
  labelAt,
  formatPercent,
  cover,
}: {
  listRef: AnimatedRef<any>;
  scrollY: SharedValue<number>;
  maxScroll: number;
  contentHeight: number;
  viewportHeight: number;
  /** Ascending step targets; one screen at a time without them */
  steps: readonly number[] | undefined;
  offsets: readonly number[];
  labels: readonly string[];
  labelAt: ((position: number, scrollOffset: number) => string | null) | undefined;
  formatPercent: (percent: number) => string;
  /** How much of the list's top is covered now (pt) */
  cover: () => number;
}) {
  /** The position the value describes: set by its own steps, and re-read when scrolling stops */
  const [{ offset, covered }, setPosition] = useState({ offset: 0, covered: 0 });

  // Computed when the position it describes changes, not on every render (labelAt can be costly)
  const value = useMemo(
    () =>
      (labels.length
        ? labels[sectionIndexAt(offsets, offset + covered)]
        : labelAt?.(labelPosition(offset, contentHeight, viewportHeight, covered), offset)) ??
      formatPercent(maxScroll > 0 ? Math.round((offset / maxScroll) * 100) : 0),
    [labels, offsets, labelAt, offset, covered, formatPercent, maxScroll, contentHeight, viewportHeight],
  );

  /** Scroll so content offset `to` is at the top of the list's visible part (clamped), and describe it */
  const jumpTo = (to: number) => {
    const c = cover();
    const scroll = clamp(to - c, 0, maxScroll);
    scheduleOnUI(scrollTo, listRef, 0, scroll, false);
    setPosition({ offset: scroll, covered: c });
  };

  /** One screen back or forward; the previous screen's last row stays visible */
  const page = (dir: 1 | -1) => {
    const c = cover();
    jumpTo(scrollY.get() + c + dir * (viewportHeight - c) * A11Y_PAGE);
  };

  // One step back or forward from here (the next of `steps`, or one screen)
  const step = (dir: 1 | -1) => {
    if (!steps || !steps.length) return page(dir);
    const from = scrollY.get() + cover();
    // Binary search: steps can be section starts, thousands of them
    const next =
      dir > 0
        ? steps[firstIndexWhere(steps, (s) => s > from + STEP_SLACK)]
        : steps[firstIndexWhere(steps, (s) => s >= from - STEP_SLACK) - 1];
    jumpTo(next ?? (dir > 0 ? contentHeight : 0)); // past the end: clamps to the end
  };

  const sync = () => setPosition({ offset: scrollY.get(), covered: cover() });

  return { value, step, page, jumpTo, sync };
}
