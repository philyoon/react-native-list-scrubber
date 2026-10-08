import { sectionText, sharedZero } from './support';
import { render, renderHook, screen } from '@testing-library/react-native';
import { StyleSheet, type ViewStyle } from 'react-native';
import { CurrentSectionLabel, PinnedSectionHeader, usePinnedSectionHeaderStyle } from '../index';

it('CurrentSectionLabel shows the section at the top of the list', async () => {
  const scrollY = sharedZero();
  scrollY.set(620);
  await render(
    <CurrentSectionLabel
      scrollY={scrollY}
      height={20}
      sections={[
        { offset: 0, label: 'A' },
        { offset: 500, label: 'M' },
      ]}
    />,
  );
  // the Reanimated mock computes animated props on render, from the current values
  expect(sectionText('list-scrubber-section-label-text')).toMatchObject({ text: 'M', style: { height: 20 } });
});

describe('usePinnedSectionHeaderStyle', () => {
  const sections = [
    { offset: 0, label: 'A' },
    { offset: 500, label: 'B' },
  ];
  const push = async (y: number) => {
    const scrollY = sharedZero();
    scrollY.set(y);
    const { result } = await renderHook(() => usePinnedSectionHeaderStyle(scrollY, sections, 36));
    return (result.current as unknown as { transform: { translateY: number }[] }).transform[0]!.translateY;
  };

  it('stays put until the next header reaches it', async () => {
    expect(await push(0)).toBe(0);
    expect(await push(464)).toBe(0); // B's header top is exactly one header below
  });

  it('is pushed up by the next header, then the next section takes over', async () => {
    expect(await push(480)).toBe(-16);
    expect(await push(499)).toBe(-35);
    expect(await push(500)).toBe(0); // now pinned B, nothing after it
  });
});

describe('CurrentSectionLabel line height', () => {
  const sections = [
    { offset: 0, label: 'A' },
    { offset: 500, label: 'M' },
  ];
  // The test environment reports a system text size of 2×: rows scale with it, capped at 1.5× by default.
  const lineWith = async (style?: object, maxFontSizeMultiplier?: number) => {
    await render(
      <CurrentSectionLabel
        scrollY={sharedZero()}
        sections={sections}
        style={style}
        maxFontSizeMultiplier={maxFontSizeMultiplier}
      />,
    );
    return sectionText('list-scrubber-section-label-text').style.height;
  };

  it('uses the style lineHeight, scaled', async () => expect(await lineWith({ lineHeight: 30 })).toBe(45));
  it('else 1.3 × fontSize, scaled', async () => expect(await lineWith({ fontSize: 20 })).toBe(39));
  it('else 1.3 × 14, scaled and rounded up', async () => expect(await lineWith()).toBe(28)); // 27.3

  it('scales with the system text size below the cap', async () => {
    expect(await lineWith({ lineHeight: 30 }, 3)).toBe(60); // 2×, under a 3× cap
  });

  it('caps the label text at the same multiple', async () => {
    await lineWith({ lineHeight: 30 });
    expect(sectionText('list-scrubber-section-label-text').field.props.maxFontSizeMultiplier).toBe(1.5);
  });
});

describe('PinnedSectionHeader', () => {
  const sections = [
    { offset: 0, label: 'A' },
    { offset: 500, label: 'B' },
  ];
  const header = () =>
    screen.getByTestId('list-scrubber-pinned-header', { includeHiddenElements: true })
      .children[0] as unknown as {
      props: { style: ViewStyle };
    };

  it('pins over the top of the list, clipped to its height, and is pushed out by the next header', async () => {
    const scrollY = sharedZero();
    scrollY.set(480);
    await render(
      <PinnedSectionHeader
        scrollY={scrollY}
        sections={sections}
        height={36}
        style={{ backgroundColor: 'red' }}
      />,
    );
    const pinned = screen.getByTestId('list-scrubber-pinned-header', { includeHiddenElements: true });
    expect(StyleSheet.flatten(pinned.props.style)).toMatchObject({
      position: 'absolute',
      top: 0,
      height: 36,
      overflow: 'hidden',
    });
    expect(StyleSheet.flatten(header().props.style)).toMatchObject({
      height: 36,
      backgroundColor: 'red',
      transform: [{ translateY: -16 }],
    });
    expect(sectionText('list-scrubber-pinned-header-label-text').text).toBe('A');
  });

  it('is blank, not broken, before there are sections', async () => {
    await render(<PinnedSectionHeader scrollY={sharedZero()} sections={[]} height={36} />);
    expect(sectionText('list-scrubber-pinned-header-label-text').text).toBe('');
    expect(sectionText('list-scrubber-pinned-header-label-text').field.props.defaultValue).toBe('');
  });

  it('its text field is display only: no focus (a Tab stop on web), no editing, screen readers skip it', async () => {
    await render(<PinnedSectionHeader scrollY={sharedZero()} sections={sections} height={36} />);
    expect(sectionText('list-scrubber-pinned-header-label-text').field.props).toMatchObject({
      editable: false,
      focusable: false,
      'aria-hidden': true,
      accessible: false,
      pointerEvents: 'none',
    });
  });

  it('push={false} keeps it in place', async () => {
    const scrollY = sharedZero();
    scrollY.set(480);
    await render(<PinnedSectionHeader scrollY={scrollY} sections={sections} height={36} push={false} />);
    expect(StyleSheet.flatten(header().props.style)?.transform).toBeUndefined();
  });

  it('testID names the header and its label, so two on one screen stay apart', async () => {
    await render(
      <>
        <PinnedSectionHeader scrollY={sharedZero()} sections={sections} height={36} testID="contacts" />
        <PinnedSectionHeader scrollY={sharedZero()} sections={sections} height={36} testID="calls" />
      </>,
    );
    for (const id of ['contacts', 'contacts-label', 'contacts-label-text', 'calls', 'calls-label-text']) {
      expect(screen.getByTestId(id, { includeHiddenElements: true })).toBeTruthy();
    }
  });
});

it('PinnedSectionHeader sits `top` below the top of the list: a number, or a shared value (below a top bar)', async () => {
  const sections = [{ offset: 0, label: 'A' }];
  const translate = () =>
    StyleSheet.flatten(screen.getByTestId('list-scrubber-pinned-header').props.style as ViewStyle)!.transform;
  const view = await render(<PinnedSectionHeader scrollY={sharedZero()} sections={sections} height={32} />);
  expect(translate()).toEqual([{ translateY: 0 }]);
  await view.rerender(
    <PinnedSectionHeader scrollY={sharedZero()} sections={sections} height={32} top={12} />,
  );
  expect(translate()).toEqual([{ translateY: 12 }]);
  const visibleHeight = sharedZero();
  visibleHeight.set(80);
  await view.rerender(
    <PinnedSectionHeader scrollY={sharedZero()} sections={sections} height={32} top={visibleHeight} />,
  );
  expect(translate()).toEqual([{ translateY: 80 }]);
});
