import { describe, expect, it } from 'vitest';
import { fitOf } from './image';

describe('fitOf', () => {
  it('near-square images (photos) fill the square, centered', () => {
    expect(fitOf(1200, 1000)).toEqual({ sx: 100, sy: 0, sw: 1000, sh: 1000, dx: 0, dy: 0, dw: 256, dh: 256 });
  });
  it('wide or tall logos fit inside it on white, nothing cut', () => {
    expect(fitOf(1000, 250)).toEqual({ sx: 0, sy: 0, sw: 1000, sh: 250, dx: 0, dy: 96, dw: 256, dh: 64 });
    expect(fitOf(200, 800)).toMatchObject({ dw: 64, dh: 256, dx: 96, dy: 0 });
  });
});
