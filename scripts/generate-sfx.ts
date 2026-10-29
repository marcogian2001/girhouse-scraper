/**
 * Synthesizes the sounds version B plays on cue, with ffmpeg, so no sample needs a licence:
 *
 *   npx tsx scripts/generate-sfx.ts
 *
 * Writes `public/demo/sfx/{sound}.mp3`.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import type { VslSound } from '@/utils/VslMusic';

const SOUNDS: Record<VslSound, { source: string; filter: string }> = {
  // Two double rings, the way a phone rings
  ring: {
    source:
      "aevalsrc='0.25*(sin(2*PI*440*t)+sin(2*PI*480*t))*(0.5+0.5*sin(2*PI*20*t))*(between(t,0,0.45)+between(t,0.65,1.1)+between(t,2.2,2.65)+between(t,2.85,3.3))':s=44100:d=3.5",
    filter: 'afade=t=out:st=3.3:d=0.2',
  },
  // A rising two-note chime, like a message arriving
  ping: {
    source:
      "aevalsrc='0.45*sin(2*PI*1046.5*t)*exp(-9*t)*lt(t,0.13)+0.45*sin(2*PI*1568*(t-0.13))*exp(-5*(t-0.13))*gte(t,0.13)':s=44100:d=0.9",
    filter: 'anull',
  },
  bell: {
    source:
      "aevalsrc='(0.35*sin(2*PI*880*t)+0.2*sin(2*PI*2217*t)+0.12*sin(2*PI*3520*t)+0.06*sin(2*PI*4980*t))*exp(-2.6*t)':s=44100:d=2",
    filter: 'afade=t=out:st=1.7:d=0.3',
  },
  // Air rushing past, between chapters
  whoosh: {
    source: 'anoisesrc=d=0.9:c=pink:a=0.6',
    filter: 'highpass=f=300,lowpass=f=5000,afade=t=in:curve=exp:d=0.55,afade=t=out:st=0.55:d=0.35',
  },
  // A low falling boom, under a problem
  hit: {
    source:
      "aevalsrc='0.8*sin(2*PI*(60-25*t)*t)*exp(-4.5*t)+0.15*sin(2*PI*120*t)*exp(-9*t)':s=44100:d=1.3",
    filter: 'lowpass=f=400,afade=t=out:st=1.1:d=0.2',
  },
  pop: {
    source: "aevalsrc='0.4*sin(2*PI*(700+500*t)*t)*exp(-28*t)':s=44100:d=0.18",
    filter: 'anull',
  },
};

mkdirSync('public/demo/sfx', { recursive: true });

for (const [sound, { source, filter }] of Object.entries(SOUNDS)) {
  execFileSync('ffmpeg', [
    '-y',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    source,
    '-af',
    filter,
    '-ac',
    '1',
    '-ar',
    '44100',
    '-b:a',
    '64k',
    `public/demo/sfx/${sound}.mp3`,
  ]);
}
