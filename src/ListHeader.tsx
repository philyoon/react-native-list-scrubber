import {
  createElement,
  isValidElement,
  useEffect,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
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
 * component changes, so the latest spacer and header come from a store instead. Development builds warn when
 * there's a spacer to draw but it never is, e.g. a `ListHeaderComponent` given to the list replaced it,
 * unless `warnIfUndrawn` is false (the Jest mock: tests don't lay views out).
 */
export function useListHeader(
  spacerHeight: number,
  own: ListHeaderContent | undefined,
  warnIfUndrawn = true,
) {
  const [store] = useState(() => createStore({ spacerHeight, own }));
  useLayoutEffect(() => store.set({ spacerHeight, own }), [store, spacerHeight, own]);
  const [ListHeader] = useState(() => {
    function ListHeader() {
      const content = useSyncExternalStore(store.subscribe, store.get);
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
  return ListHeader;
}

function createStore(initial: Content) {
  let content = initial;
  const listeners = new Set<() => void>();
  const store = {
    drawn: false,
    get: () => content,
    set(next: Content) {
      if (next.spacerHeight === content.spacerHeight && next.own === content.own) return;
      content = next;
      listeners.forEach((listener) => listener());
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    markDrawn: () => {
      store.drawn = true;
    },
  };
  return store;
}
