/** An image larger than this is not worth keeping for a demo page. */
const MAX_IMAGE_BYTES = 2_000_000;

const DOWNLOAD_TIMEOUT_MS = 10_000;

/**
 * Downloads an image to keep a copy of it.
 * @param url The image link.
 * @returns The content type and the base64-encoded file, or null when it is not a usable image.
 * @throws {Error} When the download fails or times out.
 */
export const downloadImage = async (url: string) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  const contentType = response.headers.get('content-type') ?? '';

  if (!response.ok || !contentType.startsWith('image/')) {
    return null;
  }

  const bytes = Buffer.from(await response.arrayBuffer());

  return bytes.length <= MAX_IMAGE_BYTES ? { contentType, data: bytes.toString('base64') } : null;
};
