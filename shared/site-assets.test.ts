import { describe, expect, it } from 'vitest';
import { APP_ASSETS as APP, BOOKING_ASSETS as BOOKING, assetListOf, parseAssetList, staleAssetKeys } from './site-assets';

const NOW = new Date('2026-10-23T12:00:00.000Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000);

describe('assetListOf', () => {
  it('keeps only the hashed files of the directory, as bucket keys, with a stable build id', () => {
    const list = assetListOf(['index.html', 'assets/b.js', 'assets/a.css', 'sw.js', 'assets/b.js'], APP, 'app/');
    expect(list.files).toEqual(['app/assets/a.css', 'app/assets/b.js']);
    expect(assetListOf(['assets/a.css', 'assets/b.js'], APP, 'app/').build).toBe(list.build);
    expect(assetListOf(['assets/c.js'], APP, 'app/').build).not.toBe(list.build);
    expect(assetListOf(['b/assets/x.js', 'b/booking.js', 'index.html'], BOOKING).files).toEqual(['b/assets/x.js']);
  });
});

describe('parseAssetList', () => {
  it('rejects anything that could make the cleanup delete too much', () => {
    expect(parseAssetList('{"build":"x","files":["app/assets/a.js"]}', APP)).toEqual({ build: 'x', files: ['app/assets/a.js'] });
    expect(parseAssetList('{"build":"x","files":[]}', APP)).toBeNull();
    expect(parseAssetList('{"build":"x","files":["b/assets/a.js"]}', APP)).toBeNull();
    expect(parseAssetList('<html>', APP)).toBeNull();
  });
});

describe('staleAssetKeys', () => {
  const current = { build: 'v3', files: ['app/assets/live.js'] };

  it('never deletes what the live build uses, however old', () => {
    expect(staleAssetKeys([{ key: 'app/assets/live.js', lastModified: daysAgo(90) }], current, {}, NOW)).toEqual([]);
  });

  it('keeps files a build used within the last 7 days, even if uploaded long ago', () => {
    const objects = [{ key: 'app/assets/prev.js', lastModified: daysAgo(60) }];
    expect(staleAssetKeys(objects, current, { 'app/assets/prev.js': daysAgo(2).toISOString() }, NOW)).toEqual([]);
    expect(staleAssetKeys(objects, current, { 'app/assets/prev.js': daysAgo(8).toISOString() }, NOW)).toEqual(['app/assets/prev.js']);
  });

  it('files never seen in a build wait 7 days from their upload', () => {
    expect(staleAssetKeys([{ key: 'app/assets/new.js', lastModified: daysAgo(1) }], current, {}, NOW)).toEqual([]);
    expect(staleAssetKeys([{ key: 'app/assets/old.js', lastModified: daysAgo(30) }], current, {}, NOW)).toEqual(['app/assets/old.js']);
  });
});
