import { useEffect, useMemo, useRef } from 'react';
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
  useWarnIfUnmemoized(sections);
  return useMemo(() => {
    if (!sections) return NO_OFFSETS;
    const values = sections.map((s) => s.offset);
    warnIfInvalid(values, sections, 'sections', sections);
    return values;
  }, [sections]);
}

const NO_OFFSETS: readonly number[] = [];

/** Mistakes already reported: each is warned about once, however many components make it */
const warned = new Set<string>();

/** Test only: lets each test see the once-only warnings again */
export function resetWarnings(): void {
  warned.clear();
}

/** Renders in a row with a new but identical `sections` array before it counts as unmemoized */
const UNMEMOIZED_RENDERS = 2;

/**
 * Development only: warns once when `sections` keeps arriving as a new array with the same contents,
 * e.g. `sections={items.map(…)}` without useMemo. Nothing breaks, but every new array is re-validated and
 * copied to the UI thread again, on every render. Once alone (a refetch with the same data) is fine.
 */
function useWarnIfUnmemoized(sections: readonly ListScrubberSection[] | undefined): void {
  const previous = useRef(sections);
  const repeats = useRef(0);
  useEffect(() => {
    const prev = previous.current;
    previous.current = sections;
    if (!__DEV__ || warned.has('unmemoized') || !prev || !sections || prev === sections) return;
    repeats.current = sameSections(prev, sections) ? repeats.current + 1 : 0;
    if (repeats.current < UNMEMOIZED_RENDERS) return;
    warned.add('unmemoized');
    console.warn(
      'react-native-list-scrubber: `sections` is a new array with the same contents as on the last render. ' +
        'Wrap it in useMemo: each new array is checked and copied to the UI thread again.',
    );
  });
}

function sameSections(a: readonly ListScrubberSection[], b: readonly ListScrubberSection[]): boolean {
  return a.length === b.length && a.every((s, i) => s.offset === b[i]!.offset && s.label === b[i]!.label);
}
