/**
 * Reads the single byte range a browser asks for, such as `bytes=0-1` or `bytes=500-`.
 * @param header The `Range` header, if any.
 * @param size The file size.
 * @returns The first and last byte, inclusive, or null to send the whole file.
 */
export const parseByteRange = (header: string | null, size: number) => {
  const match = header?.match(/^bytes=(\d*)-(\d*)$/u);

  if (!match || size === 0 || (!match[1] && !match[2])) {
    return null;
  }

  // `bytes=-500` asks for the last 500 bytes
  const start = match[1] ? Number(match[1]) : Math.max(size - Number(match[2]), 0);
  const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;

  return start <= end && start < size ? { start, end } : null;
};
