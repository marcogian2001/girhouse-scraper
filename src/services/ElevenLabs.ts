import { Env } from '@/libs/Env';
import { requireEnv } from '@/utils/Helpers';
import { HOST_VOICE_SAMPLE_RATE } from '@/utils/HostVoice';

const ELEVENLABS_API_URL = 'https://api.elevenlabs.io';

/** Speaks Italian naturally, with the cloned voice's own accent. */
const MODEL = 'eleven_multilingual_v2';

const CALL_TIMEOUT_MS = 60_000;

/**
 * Says a line in Gianmarco's cloned voice.
 * @param text What he says.
 * @returns The voice, as 16-bit mono samples at `HOST_VOICE_SAMPLE_RATE`.
 * @throws {Error} When the key or the voice is missing, or ElevenLabs refuses the line.
 */
export const speakAsHost = async (text: string) => {
  const voiceId = requireEnv('ELEVENLABS_VOICE_ID', Env.ELEVENLABS_VOICE_ID);
  const response = await fetch(
    `${ELEVENLABS_API_URL}/v1/text-to-speech/${voiceId}?output_format=pcm_${HOST_VOICE_SAMPLE_RATE}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': requireEnv('ELEVENLABS_API_KEY', Env.ELEVENLABS_API_KEY),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text, model_id: MODEL }),
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    },
  );

  if (!response.ok) {
    throw new Error(`ElevenLabs answered ${response.status}: ${await response.text()}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());

  // Copied so the samples start on an even byte, as Int16Array needs
  return new Int16Array(Uint8Array.from(bytes).buffer, 0, Math.floor(bytes.length / 2));
};
