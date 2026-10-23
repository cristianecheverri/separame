import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isStaleChunkError, reloadForStaleChunk } from './staleChunks';

const chrome = new TypeError('Failed to fetch dynamically imported module: https://separame.app/app/assets/AppointmentsPage-old.js');
const safari = new TypeError('Importing a module script failed.');
const firefox = new TypeError('error loading dynamically imported module: https://separame.app/app/assets/x.js');

beforeEach(() => sessionStorage.clear());

describe('isStaleChunkError', () => {
  it('recognizes failed lazy chunks in every browser', () => {
    expect([chrome, safari, firefox].every(isStaleChunkError)).toBe(true);
    expect(isStaleChunkError(new Error('Cannot read properties of undefined'))).toBe(false);
    expect(isStaleChunkError(new TypeError('Failed to fetch'))).toBe(false); // a plain network error
    expect(isStaleChunkError('Failed to fetch dynamically imported module')).toBe(false);
  });
});

describe('reloadForStaleChunk', () => {
  it('reloads once, then lets a repeated failure show the error', () => {
    const reload = vi.fn();
    expect(reloadForStaleChunk(chrome, 1_000_000, reload)).toBe(true);
    expect(reloadForStaleChunk(chrome, 1_010_000, reload)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(reloadForStaleChunk(chrome, 1_040_000, reload)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('never reloads for other errors', () => {
    const reload = vi.fn();
    expect(reloadForStaleChunk(new Error('boom'), 1_000_000, reload)).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});
