import { listLayout, sectionListLayout } from '../index';

describe('listLayout', () => {
  const names = ['Ada', 'Alan', 'Bob', 'Cy', 'Cleo'];
  const sectionLabel = (n: string) => n[0]!;

  it('starts a section wherever the label changes, the first at 0', () => {
    const { sections } = listLayout(names, { sectionLabel, itemHeight: 64, listHeaderHeight: 32 });
    expect(sections).toEqual([
      { offset: 0, label: 'A' },
      { offset: 32 + 2 * 64, label: 'B' },
      { offset: 32 + 3 * 64, label: 'C' },
    ]);
  });

  it('getItemLayout for fixed heights counts the list header', () => {
    const { getItemLayout } = listLayout(names, { sectionLabel, itemHeight: 64, listHeaderHeight: 32 });
    expect(getItemLayout(null, 3)).toEqual({ length: 64, offset: 32 + 3 * 64, index: 3 });
  });

  it("adds up each row's own height", () => {
    const { sections, getItemLayout } = listLayout(names, { sectionLabel, itemHeight: (n) => n.length * 10 });
    // Rows: 30, 40, 30, 20, 40
    expect(sections).toEqual([
      { offset: 0, label: 'A' },
      { offset: 70, label: 'B' },
      { offset: 100, label: 'C' },
    ]);
    expect(getItemLayout(null, 4)).toEqual({ length: 40, offset: 120, index: 4 });
  });

  it('gives nothing for no rows', () => {
    expect(listLayout([], { sectionLabel, itemHeight: 64 }).sections).toEqual([]);
  });
});

describe('sectionListLayout', () => {
  const data = [
    { title: 'A', data: ['Ada', 'Alan'] },
    { title: 'B', data: ['Bob'] },
  ];

  it('one section per list section, at its header, the first at 0', () => {
    const { sections } = sectionListLayout(data, {
      itemHeight: 64,
      sectionHeaderHeight: 32,
      listHeaderHeight: 10,
    });
    expect(sections).toEqual([
      { offset: 0, label: 'A' },
      { offset: 10 + 32 + 2 * 64, label: 'B' },
    ]);
  });

  it("getItemLayout follows SectionList's indexing: header, rows, footer per section", () => {
    const { getItemLayout } = sectionListLayout(data, {
      itemHeight: 64,
      sectionHeaderHeight: 32,
      sectionFooterHeight: 8,
    });
    const layouts = [0, 1, 2, 3, 4, 5, 6].map((i) => getItemLayout(null, i));
    expect(layouts.map((l) => [l.offset, l.length])).toEqual([
      [0, 32], // A header
      [32, 64],
      [96, 64],
      [160, 8], // A footer
      [168, 32], // B header
      [200, 64],
      [264, 8], // B footer
    ]);
  });

  it('takes a label and per-row heights', () => {
    const { sections, getItemLayout } = sectionListLayout(data, {
      sectionLabel: (s, i) => `${i + 1}. ${s.title}`,
      itemHeight: (name, i, section) => (section.title === 'A' ? 10 * (i + 1) : name.length),
    });
    expect(sections).toEqual([
      { offset: 0, label: '1. A' },
      { offset: 30, label: '2. B' },
    ]);
    expect(getItemLayout(null, 5)).toEqual({ length: 3, offset: 30, index: 5 });
  });

  it('without a string title the label is empty (development builds warn)', () => {
    const { sections } = sectionListLayout([{ data: [1] }], { itemHeight: 64 });
    expect(sections).toEqual([{ offset: 0, label: '' }]);
  });
});
