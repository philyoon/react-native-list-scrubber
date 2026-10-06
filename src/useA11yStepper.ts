import { useMemo, useState } from 'react';
import { scrollTo, type AnimatedRef, type SharedValue } from 'react-native-reanimated';
import { scheduleOnUI } from 'react-native-worklets';
import { A11Y_PAGE, STEP_SLACK } from './defaults';
import { clamp, firstIndexWhere, sectionIndexAt } from './math';

/**
 * The screen-reader side: `step(±1)` scrolls to the next or previous of `steps` (or one screen), and
 * `value` describes the position as a section label, a `labelAt` label or a percentage.
 * `sync` re-reads the position after manual scrolling.
 */
export function useA11yStepper({
  listRef,
  scrollY,
  maxScroll,
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
  viewportHeight: number;
  /** Ascending step targets; one screen at a time without them */
  steps: readonly number[] | undefined;
  offsets: readonly number[];
  labels: readonly string[];
  labelAt: ((offset: number) => string | null) | undefined;
  formatPercent: (percent: number) => string;
}) {
  /** Offset the value describes: set by its own steps, and re-read when scrolling stops */
  const [offset, setOffset] = useState(0);

  // Computed when the position it describes changes, not on every render (labelAt can be costly)
  const value = useMemo(
    () =>
      (labels.length ? labels[sectionIndexAt(offsets, offset)] : labelAt?.(offset)) ??
      formatPercent(maxScroll > 0 ? Math.round((offset / maxScroll) * 100) : 0),
    [labels, offsets, labelAt, offset, formatPercent, maxScroll],
  );

  // One step back or forward from here (the next of `steps`, or one screen)
  const step = (dir: 1 | -1) => {
    const from = scrollY.get();
    let to: number;
    if (steps && steps.length) {
      // Binary search: steps can be section starts, thousands of them
      const next =
        dir > 0
          ? steps[firstIndexWhere(steps, (s) => s > from + STEP_SLACK)]
          : steps[firstIndexWhere(steps, (s) => s >= from - STEP_SLACK) - 1];
      to = next ?? (dir > 0 ? maxScroll : 0);
    } else to = from + dir * viewportHeight * A11Y_PAGE;
    to = clamp(to, 0, maxScroll);
    scheduleOnUI(scrollTo, listRef, 0, to, false);
    setOffset(to);
  };

  const sync = () => setOffset(scrollY.get());

  return { value, step, sync };
}
