import type { ListScrubberSection } from './types';

/** What `getItemLayout` returns for one row (FlatList and SectionList take the same shape) */
interface ItemLayout {
  length: number;
  offset: number;
  index: number;
}

/**
 * Sections for a flat list (FlatList, FlashList, Legend List, or a ScrollView of fixed blocks), from the
 * rows' heights: a new section starts wherever `label` changes from one row to the next. `getItemLayout`
 * comes from the same numbers, so the list and the scrubber can't disagree.
 *
 *   const { sections, getItemLayout } = useMemo(
 *     () => listLayout(contacts, { label: (c) => c.name[0]!, itemHeight: ROW }),
 *     [contacts],
 *   );
 *
 * `itemHeight` includes any separator below the row. `listHeaderHeight` is the ListHeaderComponent's height.
 * The first section starts at 0, so it also covers the list header above it.
 */
export function listLayout<T>(
  items: readonly T[],
  {
    label,
    itemHeight,
    listHeaderHeight = 0,
  }: {
    /** The row's section label, e.g. its first letter or its month */
    label: (item: T, index: number) => string;
    /** One height for every row, or each row's own */
    itemHeight: number | ((item: T, index: number) => number);
    listHeaderHeight?: number;
  },
): { sections: ListScrubberSection[]; getItemLayout: (data: unknown, index: number) => ItemLayout } {
  const sections: ListScrubberSection[] = [];
  // Fixed heights need no table: getItemLayout is arithmetic
  const offsets: number[] = [];
  const lengths: number[] = [];
  let y = listHeaderHeight;
  items.forEach((item, i) => {
    const name = label(item, i);
    if (sections.at(-1)?.label !== name) sections.push({ offset: sections.length ? y : 0, label: name });
    const length = typeof itemHeight === 'number' ? itemHeight : itemHeight(item, i);
    if (typeof itemHeight !== 'number') {
      offsets.push(y);
      lengths.push(length);
    }
    y += length;
  });
  const getItemLayout =
    typeof itemHeight === 'number'
      ? (_: unknown, index: number) => ({
          length: itemHeight,
          offset: listHeaderHeight + itemHeight * index,
          index,
        })
      : (_: unknown, index: number) => ({ length: lengths[index]!, offset: offsets[index]!, index });
  return { sections, getItemLayout };
}

/**
 * Sections and `getItemLayout` for a SectionList, one scrubber section per list section, starting at its
 * header. `getItemLayout` follows SectionList's own indexing: each section counts a header, its rows and a
 * footer (0 tall without `renderSectionFooter`).
 *
 *   const { sections, getItemLayout } = useMemo(
 *     () => sectionListLayout(data, { itemHeight: ROW, sectionHeaderHeight: HEADER }),
 *     [data],
 *   );
 *
 * `label` defaults to the section's `title`. `itemHeight` includes any separator below the row.
 * The first section starts at 0, so it also covers a list header above it.
 */
export function sectionListLayout<S extends { data: readonly unknown[]; title?: unknown }>(
  listSections: readonly S[],
  {
    label = defaultLabel,
    itemHeight,
    sectionHeaderHeight = 0,
    sectionFooterHeight = 0,
    listHeaderHeight = 0,
  }: {
    /** The section's label (default: its `title`) */
    label?: (section: S, index: number) => string;
    /** One height for every row, or each row's own (`index` is within its section) */
    itemHeight: number | ((item: S['data'][number], index: number, section: S) => number);
    sectionHeaderHeight?: number;
    sectionFooterHeight?: number;
    listHeaderHeight?: number;
  },
): { sections: ListScrubberSection[]; getItemLayout: (data: unknown, index: number) => ItemLayout } {
  const sections: ListScrubberSection[] = [];
  const offsets: number[] = [];
  const lengths: number[] = [];
  let y = listHeaderHeight;
  const add = (length: number) => {
    offsets.push(y);
    lengths.push(length);
    y += length;
  };
  listSections.forEach((section, s) => {
    sections.push({ offset: s ? y : 0, label: label(section, s) });
    add(sectionHeaderHeight);
    section.data.forEach((item, i) =>
      add(typeof itemHeight === 'number' ? itemHeight : itemHeight(item, i, section)),
    );
    add(sectionFooterHeight);
  });
  const getItemLayout = (_: unknown, index: number) => ({
    length: lengths[index]!,
    offset: offsets[index]!,
    index,
  });
  return { sections, getItemLayout };
}

/** A section's `title` when it's a string; otherwise empty, which development builds warn about */
function defaultLabel(section: { title?: unknown }): string {
  return typeof section.title === 'string' ? section.title : '';
}
