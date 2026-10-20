import { ScrollPacer } from '../ScrollPacer';

// Frames driven by hand: each `frame(gap)` advances the clock by `gap` ms and runs what was requested
let callbacks: ((t: number) => void)[] = [];
let now = 1000;
const frame = (gap: number) => {
  now += gap;
  const due = callbacks;
  callbacks = [];
  due.forEach((callback) => callback(now));
};
beforeEach(() => {
  callbacks = [];
  now = 1000;
  jest.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback) => {
    callbacks.push(callback as (t: number) => void);
    return callbacks.length;
  });
});
afterEach(() => jest.restoreAllMocks());

describe('ScrollPacer', () => {
  it('lets a callback through at the next frame while JS keeps up', () => {
    const pacer = new ScrollPacer();
    const run = jest.fn();
    pacer.afterIdle(run);
    frame(16);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('after a long frame, waits until smooth frames have paid back its overrun', () => {
    const pacer = new ScrollPacer();
    pacer.afterIdle(() => {});
    frame(16); // through; it keeps counting frames for a while after
    const run = jest.fn();
    pacer.afterIdle(run);
    frame(100); // a long frame, as the scroll's rows rendered: about 83 ms over
    expect(run).not.toHaveBeenCalled();
    for (let i = 0; i < 5; i++) frame(16); // 80 ms paid back
    expect(run).not.toHaveBeenCalled();
    frame(16);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('keeps only the newest callback, and stops counting frames once idle', () => {
    const pacer = new ScrollPacer();
    const first = jest.fn();
    const newest = jest.fn();
    pacer.afterIdle(first);
    pacer.afterIdle(newest);
    frame(16);
    expect(first).not.toHaveBeenCalled();
    expect(newest).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 20; i++) frame(16); // past the 300 ms it keeps counting after
    expect(callbacks).toHaveLength(0);
  });

  it('cancel drops a waiting callback', () => {
    const pacer = new ScrollPacer();
    const run = jest.fn();
    pacer.afterIdle(run);
    pacer.cancel();
    frame(16);
    expect(run).not.toHaveBeenCalled();
  });
});
