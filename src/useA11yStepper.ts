import { useMemo, useState } from 'react';
import { scrollTo, type AnimatedRef, type SharedValue } from 'react-native-reanimated';
import { scheduleOnUI } from 'react-native-worklets';
import { A11Y_PAGE, STEP_SLACK } from './defaults';
import { clamp, firstIndexWhere, labelPosition, sectionIndexAt } from './math';

/**
 * The screen-reader (and web keyboard) side: `step(±1)` scrolls to the next or previous of `steps`
 * (or one screen), `page(±1)` one screen, `jumpTo` to an offset, and `value` describes the position as a
 * section label, a `labelAt` label or a percentage. `sync` re-reads the position after manual scrolling.
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
}) {
  /** Offset the value describes: set by its own steps, and re-read when scrolling stops */
  const [offset, setOffset] = useState(0);

  // Computed when the position it describes changes, not on every render (labelAt can be costly)
  const value = useMemo(
    () =>
      (labels.length
        ? labels[sectionIndexAt(offsets, offset)]
        : labelAt?.(labelPosition(offset, contentHeight, viewportHeight), offset)) ??
      formatPercent(maxScroll > 0 ? Math.round((offset / maxScroll) * 100) : 0),
    [labels, offsets, labelAt, offset, formatPercent, maxScroll, contentHeight, viewportHeight],
  );

  /** Scroll the list to `to` (clamped) and describe that position */
  const jumpTo = (to: number) => {
    to = clamp(to, 0, maxScroll);
    scheduleOnUI(scrollTo, listRef, 0, to, false);
    setOffset(to);
  };

  /** One screen back or forward; the previous screen's last row stays visible */
  const page = (dir: 1 | -1) => jumpTo(scrollY.get() + dir * viewportHeight * A11Y_PAGE);

  // One step back or forward from here (the next of `steps`, or one screen)
  const step = (dir: 1 | -1) => {
    if (!steps || !steps.length) return page(dir);
    const from = scrollY.get();
    // Binary search: steps can be section starts, thousands of them
    const next =
      dir > 0
        ? steps[firstIndexWhere(steps, (s) => s > from + STEP_SLACK)]
        : steps[firstIndexWhere(steps, (s) => s >= from - STEP_SLACK) - 1];
    jumpTo(next ?? (dir > 0 ? maxScroll : 0));
  };

  const sync = () => setOffset(scrollY.get());

  return { value, step, page, jumpTo, sync };
}
