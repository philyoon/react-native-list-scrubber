import { useCallback, useLayoutEffect, useRef } from 'react';

/** A function with a stable identity that always calls the latest `fn`: safe to capture in worklets. */
export function useLatest<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const ref = useRef(fn);
  useLayoutEffect(() => {
    ref.current = fn;
  });
  return useCallback((...args: A) => ref.current(...args), []);
}
