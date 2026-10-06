/** Arrays already checked: each is scanned once, however many components read it */
const checked = new WeakSet<object>();

/**
 * Development only: warns when `values` (section offsets or screen-reader steps) aren't ascending.
 * They're looked up by binary search, so out of order they silently pick the wrong one.
 * `source` is the caller's array: each one is checked once.
 */
export function warnIfUnsorted(values: readonly number[], source: object, what: string): void {
  if (!__DEV__ || checked.has(source)) return;
  checked.add(source);
  for (let i = 1; i < values.length; i++) {
    if (values[i]! < values[i - 1]!) {
      console.warn(
        `react-native-list-scrubber: ${what} must be in ascending order, but at index ${i} ` +
          `${values[i]} comes after ${values[i - 1]}. They're looked up by binary search, so the wrong ` +
          `one would show. Sort them by offset.`,
      );
      return;
    }
  }
}
