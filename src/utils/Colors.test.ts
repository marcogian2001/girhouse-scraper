import { describe, expect, it } from 'vitest';
import { isUsableBrandColor, normalizeHex, readableTextColor, rgbToHex } from './Colors';

describe('Colors', () => {
  it('normalises short and upper-case hex colours', () => {
    expect(normalizeHex('#ABC')).toBe('#aabbcc');
    expect(normalizeHex(' #1A2b3C ')).toBe('#1a2b3c');
    expect(normalizeHex('red')).toBeNull();
  });

  it('writes channels as hex', () => {
    expect(rgbToHex({ r: 36, g: 51, b: 107 })).toBe('#24336b');
  });

  it('rejects white, black and grey as brand colours', () => {
    expect(isUsableBrandColor('#ffffff')).toBeFalsy();
    expect(isUsableBrandColor('#050505')).toBeFalsy();
    expect(isUsableBrandColor('#808080')).toBeFalsy();
    expect(isUsableBrandColor('#c0392b')).toBeTruthy();
  });

  it('picks white text on dark colours and dark text on light ones', () => {
    expect(readableTextColor('#24336b')).toBe('#ffffff');
    expect(readableTextColor('#f4d03f')).toBe('#111827');
  });
});
