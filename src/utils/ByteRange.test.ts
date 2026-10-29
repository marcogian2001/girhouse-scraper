import { describe, expect, it } from 'vitest';
import { parseByteRange } from './ByteRange';

describe('ByteRange', () => {
  it('reads a closed range', () => {
    expect(parseByteRange('bytes=0-1', 100)).toStrictEqual({ start: 0, end: 1 });
  });

  it('reads an open range to the end of the file', () => {
    expect(parseByteRange('bytes=40-', 100)).toStrictEqual({ start: 40, end: 99 });
  });

  it('reads the last bytes of the file', () => {
    expect(parseByteRange('bytes=-10', 100)).toStrictEqual({ start: 90, end: 99 });
  });

  it('stops a range at the end of the file', () => {
    expect(parseByteRange('bytes=90-500', 100)).toStrictEqual({ start: 90, end: 99 });
  });

  it('sends the whole file without a usable range', () => {
    expect(parseByteRange(null, 100)).toBeNull();
    expect(parseByteRange('bytes=200-300', 100)).toBeNull();
    expect(parseByteRange('bytes=0-1,5-6', 100)).toBeNull();
  });
});
