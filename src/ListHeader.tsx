import {
  createElement,
  isValidElement,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useState,
  type ComponentType,
  type ReactElement,
} from 'react';
import { View } from 'react-native';
import { UNMEASURED_AFTER_MS, warnOnce } from './validate';

/** Your own list header: an element or a component, as a list's `ListHeaderComponent` takes */
export type ListHeaderContent = ReactElement | ComponentType;

interface Content {
  spacerHeight: number;
  own: ListHeaderContent | undefined;
}

/**
 * The list's header: a spacer as tall as what's drawn over the list's top (a top bar, a pinned header), then
 * your own header below it. One component for the life of the hook: a list remounts its header whenever the
 * component changes, so the latest spacer and header come from a store instead.
 *
 * `header`, an element of that component, is what the lists' spreads pass: a new one whenever the spacer's
 * height changes, so the list re-renders in the same commit as the rest of the screen and the rows never show
 * a frame without the new spacer (the element's type stays the same, so the header isn't remounted). The
 * store is written during render for that; a header that didn't re-render with it (one rendered elsewhere,
 * or a change to your own header alone) catches up a commit later.
 *
 * Development builds warn when there's a spacer to draw but it never is, e.g. a `ListHeaderComponent` given
 * to the list replaced it, unless `warnIfUndrawn` is false (the Jest mock: tests don't lay views out).
 */
export function useListHeader(
  spacerHeight: number,
  own: ListHeaderContent | undefined,
  warnIfUndrawn = true,
) {
  const [store] = useState(() => createStore({ spacerHeight, own }));
  store.write({ spacerHeight, own });
  useLayoutEffect(() => store.catchUp(), [store, spacerHeight, own]);
  const [ListHeader] = useState(() => {
    function ListHeader() {
      const [, rerender] = useReducer((n: number) => n + 1, 0);
      useLayoutEffect(() => store.subscribe(rerender), []);
      const content = store.read();
      return (
        <>
          {content.spacerHeight > 0 && (
            <View
              style={{ height: content.spacerHeight }}
              onLayout={store.markDrawn}
              testID="list-scrubber-spacer"
            />
          )}
          {content.own && (isValidElement(content.own) ? content.own : createElement(content.own))}
        </>
      );
    }
    return ListHeader;
  });
  // A new element when the height changes (see above), not on every render: that would re-render the list
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const header = useMemo(() => <ListHeader />, [ListHeader, spacerHeight]);
  useEffect(() => {
    if (!__DEV__ || !warnIfUndrawn || spacerHeight <= 0) return;
    const timer = setTimeout(() => {
      if (store.drawn) return;
      warnOnce(
        'spacer',
        "react-native-list-scrubber: the list's spacer for its top bar or pinned header isn't drawn, so they " +
          'cover its first rows. Spread the props named after your list (e.g. `flatListProps`), and give your ' +
          'own ListHeaderComponent to useListScrubber instead of the list. In a ScrollView, put ' +
          '<scrubber.ListHeader /> first.',
      );
    }, UNMEASURED_AFTER_MS);
    return () => clearTimeout(timer);
  }, [store, spacerHeight, warnIfUndrawn]);
  return { ListHeader, header };
}

function createStore(initial: Content) {
  let content = initial;
  /** What the headers last rendered */
  let shown: Content | undefined;
  const listeners = new Set<() => void>();
  const store = {
    drawn: false,
    write(next: Content) {
      if (next.spacerHeight !== content.spacerHeight || next.own !== content.own) content = next;
    },
    read() {
      shown = content;
      return content;
    },
    /** Re-renders the headers that didn't render the latest content */
    catchUp() {
      if (shown !== content) listeners.forEach((listener) => listener());
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    markDrawn: () => {
      store.drawn = true;
    },
  };
  return store;
}
