import { sectionIndexAt } from '../index';
import { labelPosition } from '../math';

describe('label helpers', () => {
  it('labelPosition reads the top at the start and the last pixel at the end', () => {
    expect(labelPosition(0, 1000, 100)).toBe(0);
    expect(labelPosition(450, 1000, 100)).toBe(500);
    expect(labelPosition(900, 1000, 100)).toBe(999);
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
