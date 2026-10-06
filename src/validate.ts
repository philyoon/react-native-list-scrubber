import { useMemo } from 'react';
import type { ListScrubberSection } from './types';

/** Arrays already checked: each is scanned once, however many components read it */
const checked = new WeakSet<object>();

/**
 * Development only: warns when `values` (section offsets or screen-reader steps) aren't finite and
 * ascending, or when one of `sections` has an empty label. They're looked up by binary search, so out of order they
 * silently pick the wrong one; an empty label leaves screen readers nothing to read.
 * `source` is the caller's array: each one is checked once.
 */
export function warnIfInvalid(
  values: readonly number[],
  source: object,
  what: string,
  sections?: readonly ListScrubberSection[],
): void {
  if (!__DEV__ || checked.has(source)) return;
  checked.add(source);
  const problem = findProblem(values, sections);
  if (problem) console.warn(`react-native-list-scrubber: ${what} ${problem}`);
}

function findProblem(
  values: readonly number[],
  sections: readonly ListScrubberSection[] | undefined,
): string | undefined {
  for (let i = 0; i < values.length; i++) {
    if (!Number.isFinite(values[i])) {
      return `must be finite numbers, but index ${i} is ${values[i]}. Check how the offsets are computed.`;
    }
    if (i > 0 && values[i]! < values[i - 1]!) {
      return (
        `must be in ascending order, but at index ${i} ${values[i]} comes after ${values[i - 1]}. ` +
        `They're looked up by binary search, so the wrong one would show. Sort them by offset.`
      );
    }
    if (sections && !sections[i]!.label) {
      return `need labels, but the one at index ${i} is empty: the bubble and screen readers would show nothing there.`;
    }
  }
  return undefined;
}

/**
 * The sections' offsets, checked in development. Memoized: worklets copy what they capture to the UI
 * thread whenever its identity changes.
 */
export function useSectionOffsets(sections: readonly ListScrubberSection[] | undefined): readonly number[] {
  return useMemo(() => {
    if (!sections) return NO_OFFSETS;
    const values = sections.map((s) => s.offset);
    warnIfInvalid(values, sections, 'sections', sections);
    return values;
  }, [sections]);
}

const NO_OFFSETS: readonly number[] = [];
