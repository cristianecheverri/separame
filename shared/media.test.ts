import { describe, expect, it } from 'vitest';
import { isMediaPath, sniffImageType } from './media';

describe('sniffImageType', () => {
  it('recognizes PNG, JPEG and WebP by their bytes only', () => {
    expect(sniffImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe('image/png');
    expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniffImageType(new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50]))).toBe('image/webp');
  });
  it('refuses anything else (SVG, GIF, HTML, empty)', () => {
    expect(sniffImageType(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
    expect(sniffImageType(new TextEncoder().encode('GIF89a'))).toBeNull();
    expect(sniffImageType(new TextEncoder().encode('<html>'))).toBeNull();
    expect(sniffImageType(new Uint8Array())).toBeNull();
  });
  it('only accepts the paths the API writes', () => {
    expect(isMediaPath('/media/pros/abc123/0123456789abcdef.webp')).toBe(true);
    expect(isMediaPath('/media/pros/abc123/../secret.webp')).toBe(false);
    expect(isMediaPath('https://evil.example/x.png')).toBe(false);
  });
});
