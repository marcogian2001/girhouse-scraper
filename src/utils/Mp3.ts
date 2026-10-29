import { Mp3Encoder } from '@breezystack/lamejs';

/** Plenty for one voice, and a few kilobytes a second. */
const VOICE_KBPS = 48;

/** lame encodes in blocks of this many samples. */
const BLOCK = 1152;

/**
 * Finds the format and the samples of a WAV file, walking its chunks.
 * @param wav The file.
 * @returns The sample rate, the channels and where the samples are.
 * @throws {Error} When the file is not 16-bit PCM WAV.
 */
const readWav = (wav: Buffer) => {
  if (wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('Not a WAV file');
  }

  let offset = 12;
  let format: { channels: number; sampleRate: number; bits: number } | null = null;

  while (offset + 8 <= wav.length) {
    const id = wav.toString('ascii', offset, offset + 4);
    const size = wav.readUInt32LE(offset + 4);

    if (id === 'fmt ') {
      format = {
        channels: wav.readUInt16LE(offset + 10),
        sampleRate: wav.readUInt32LE(offset + 12),
        bits: wav.readUInt16LE(offset + 22),
      };
    }

    if (id === 'data' && format?.bits === 16) {
      // Streamed files may claim more data than they hold
      const end = Math.min(offset + 8 + size, wav.length);

      return { ...format, start: offset + 8, end };
    }

    // Chunks are padded to an even size
    offset += 8 + size + (size % 2);
  }

  throw new Error('Not a 16-bit PCM WAV file');
};

/**
 * Reads what lame hands back as plain bytes: signed ones, whatever its types say.
 * @param part An encoded block.
 * @returns The same bytes.
 */
const toBytes = (part: ArrayBufferView) =>
  Buffer.from(part.buffer, part.byteOffset, part.byteLength);

/**
 * Encodes a WAV voice as MP3, keeping one channel.
 * @param wav The 16-bit PCM WAV file.
 * @returns The MP3 and its length in seconds.
 */
export const wavToMp3 = (wav: Buffer) => {
  const { channels, sampleRate, start, end } = readWav(wav);
  const frames = Math.floor((end - start) / (2 * channels));
  const samples = new Int16Array(frames);

  // A stereo file keeps its left channel: a voice is the same on both
  for (let frame = 0; frame < frames; frame += 1) {
    samples[frame] = wav.readInt16LE(start + frame * 2 * channels);
  }

  const encoder = new Mp3Encoder(1, sampleRate, VOICE_KBPS);
  const parts: Buffer[] = [];

  for (let index = 0; index < frames; index += BLOCK) {
    parts.push(toBytes(encoder.encodeBuffer(samples.subarray(index, index + BLOCK))));
  }

  parts.push(toBytes(encoder.flush()));

  return { data: Buffer.concat(parts), seconds: frames / sampleRate };
};
