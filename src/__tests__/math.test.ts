import { sectionIndexAt } from '../index';
import { labelPosition, scrollBelowBar, snapTarget } from '../math';

describe('label helpers', () => {
  it('labelPosition reads the top at the start and the last pixel at the end', () => {
    expect(labelPosition(0, 1000, 100)).toBe(0);
    expect(labelPosition(450, 1000, 100)).toBe(500);
    expect(labelPosition(900, 1000, 100)).toBe(999);
  });

  it('labelPosition with the top covered (a top bar) reads the rows below it', () => {
    expect(labelPosition(0, 1000, 100, 20)).toBe(20);
    expect(labelPosition(450, 1000, 100, 20)).toBe(450 + 20 + 40); // halfway down the 80 uncovered
    expect(labelPosition(900, 1000, 100, 20)).toBe(999);
  });

  it('sectionIndexAt finds the section containing an offset', () => {
    const starts = [0, 100, 250, 900];
    expect(sectionIndexAt(starts, 0)).toBe(0);
    expect(sectionIndexAt(starts, 99)).toBe(0);
    expect(sectionIndexAt(starts, 100)).toBe(1);
    expect(sectionIndexAt(starts, 899.6)).toBe(3); // half-pixel rounding
    expect(sectionIndexAt(starts, 5000)).toBe(3);
    expect(sectionIndexAt([], 10)).toBe(0);
  });
});

describe('scrollBelowBar', () => {
  const bar = (hidden: number, fixed = false) => ({ height: 100, hidden, fixed });

  it('without a bar, scrolls to the offset itself, clamped to the list', () => {
    const none = { height: 0, hidden: 0, fixed: false };
    expect(scrollBelowBar(500, 0, none, 1400)).toEqual({ scroll: 500, cover: 0 });
    expect(scrollBelowBar(5000, 0, none, 1400)).toEqual({ scroll: 1400, cover: 0 });
  });

  it('going down, the bar hides: the offset lands at the very top', () => {
    expect(scrollBelowBar(500, 0, bar(0), 1400)).toEqual({ scroll: 500, cover: 0 });
  });

  it('going up, the bar shows in full: the offset lands below it', () => {
    expect(scrollBelowBar(500, 800, bar(100), 1400)).toEqual({ scroll: 400, cover: 100 });
    // Near the top: the list can't scroll past 0, where the bar shows in full
    expect(scrollBelowBar(50, 800, bar(100), 1400)).toEqual({ scroll: 0, cover: 100 });
  });

  it('already just below the bar, stays', () => {
    expect(scrollBelowBar(500, 450, bar(50), 1400)).toEqual({ scroll: 450, cover: 50 });
  });

  it('at the end of the list, the bar is as far as the scroll took it', () => {
    // From 1300 with half the bar hidden, the list can only go 100 further: the bar hides the rest
    expect(scrollBelowBar(5000, 1300, bar(50), 1400)).toEqual({ scroll: 1400, cover: 0 });
    expect(scrollBelowBar(5000, 1350, bar(0), 1400)).toEqual({ scroll: 1400, cover: 50 });
  });

  it('a fixed bar stays as it is', () => {
    expect(scrollBelowBar(500, 0, bar(0, true), 1400)).toEqual({ scroll: 400, cover: 100 });
  });

  it('pull-to-refresh (a negative offset) counts as the top', () => {
    expect(scrollBelowBar(500, -40, bar(0), 1400)).toEqual({ scroll: 500, cover: 0 });
  });
});

describe('snapTarget', () => {
  // A 100 bar; the list scrolls up to 1,400
  it('shows a bar less than half hidden: scrolling up by what is hidden', () => {
    expect(snapTarget(100, 40, 240, 1400)).toBe(200);
    expect(snapTarget(100, 30, 30, 1400)).toBe(0); // near the top: back to the very top
  });
  it('hides a bar half hidden or more: scrolling down by what shows', () => {
    expect(snapTarget(100, 70, 270, 1400)).toBe(300);
    expect(snapTarget(100, 50, 250, 1400)).toBe(300);
  });
  it("shows it instead when the list can't scroll far enough to hide it", () => {
    expect(snapTarget(100, 70, 1390, 1400)).toBe(1320);
  });
  it('leaves a bar shown or hidden in full', () => {
    expect(snapTarget(100, 0, 500, 1400)).toBeUndefined();
    expect(snapTarget(100, 100, 500, 1400)).toBeUndefined();
  });
});
