import { mockDelays, mockTimings, reactions, setup, sharedZero } from './support';
import { act, screen } from '@testing-library/react-native';

describe('appearing and hiding', () => {
  const thumb = () => screen.getByTestId('list-scrubber-thumb', { includeHiddenElements: true });

  it('fades in on the first scroll frame, then hides after hideAfterMs', async () => {
    const scrollY = sharedZero();
    await setup({ scrollY });
    const [fade] = reactions();
    scrollY.set(10);
    expect(fade.prepare()).toBe(10); // it watches the scroll offset
    fade.react(10, 0);
    expect(mockTimings.map((t) => [t.to, t.duration])).toEqual([
      [1, 150], // fade in: fadeMs × (1 − 0)
      [0, 150], // then fade out
    ]);
    expect(mockDelays).toEqual([1500]);
  });

  it('starts the fade-in once: more scroll frames while it runs do not restart it', async () => {
    await setup();
    const [fade] = reactions();
    fade.react(10, 0);
    fade.react(20, 10);
    fade.react(30, 20);
    expect(mockTimings.filter((t) => t.to === 1)).toHaveLength(1);
    mockTimings[0]!.done!(); // fade-in finished
    fade.react(40, 30); // already fully visible: only re-arm the hide timer
    expect(mockTimings.filter((t) => t.to === 1)).toHaveLength(1);
    expect(mockDelays).toEqual([1500, 1500]);
  });

  it('ignores the first value, unchanged values and scrolling caused by a drag', async () => {
    await setup();
    const [fade] = reactions();
    fade.react(0, null);
    fade.react(5, 5);
    expect(mockTimings).toHaveLength(0);
  });

  it('honours custom timing', async () => {
    await setup({ timing: { fadeMs: 400, hideAfterMs: 3000 } });
    reactions()[0].react(10, 0);
    expect(mockTimings[0]).toMatchObject({ to: 1, duration: 400 });
    expect(mockDelays).toEqual([3000]);
  });

  it('lets touches through while hidden and catches them while visible', async () => {
    await setup();
    expect(thumb().props.pointerEvents).toBe('none');
    const [fade, visible] = reactions();
    fade.react(10, 0); // opacity becomes 1
    expect(visible.prepare()).toBe(true);
    await act(async () => visible.react(true, false));
    expect(thumb().props.pointerEvents).toBe('auto');
    await act(async () => visible.react(false, true));
    expect(thumb().props.pointerEvents).toBe('none');
  });

  it('screen-reader value follows manual scrolling once the thumb hides', async () => {
    const scrollY = sharedZero();
    await setup({
      scrollY,
      sections: [
        { offset: 0, label: 'A' },
        { offset: 500, label: 'M' },
      ],
    });
    const el = screen.getByRole('adjustable', { name: 'Scroll position' });
    expect(el.props.accessibilityValue).toEqual({ text: 'A' });
    scrollY.set(600); // the user scrolled by hand
    await act(async () => reactions()[1].react(false, true));
    expect(screen.getByRole('adjustable', { name: 'Scroll position' }).props.accessibilityValue).toEqual({
      text: 'M',
    });
  });
});

it('the visibility reaction ignores repeats', async () => {
  await setup();
  const thumb = screen.getByTestId('list-scrubber-thumb', { includeHiddenElements: true });
  await act(async () => reactions()[1].react(false, false));
  expect(thumb.props.pointerEvents).toBe('none');
});
