/**
 * The b-roll version B cuts to while the problems are told: short silent clips of a
 * business like the lead's, made once per sector by `scripts/generate-broll.ts` and kept
 * in `public/demo/broll/{sector}/{scene}.mp4`.
 */
export const BROLL_SECTORS = [
  'physio',
  'mechanic',
  'legal',
  'nutrition',
  'realestate',
  'medical',
  'beauty',
  'generic',
] as const;

export type BrollSector = (typeof BROLL_SECTORS)[number];

/** Scenes every sector has, each told in its own setting. */
export const BROLL_SCENES = ['busy', 'evening', 'noshow', 'lost', 'dream'] as const;

/** Scenes that look the same whatever the sector, kept under `shared`. */
export const SHARED_BROLL_SCENES = ['review', 'happy'] as const;

export type BrollScene = (typeof BROLL_SCENES)[number] | (typeof SHARED_BROLL_SCENES)[number];

const SHARED = new Set<string>(SHARED_BROLL_SCENES);

/**
 * Finds the file of a b-roll clip.
 * @param sector The lead's sector.
 * @param scene The scene.
 * @returns The clip's path, without its extension: `.mp4` is the clip, `.jpg` its poster.
 */
export const brollPath = (sector: BrollSector, scene: BrollScene) =>
  `/demo/broll/${SHARED.has(scene) ? 'shared' : sector}/${scene}`;

/** Who works where, in each sector, for the clip prompts. */
const BROLL_SETTINGS: Record<
  BrollSector,
  { place: string; worker: string; client: string; seat: string }
> = {
  physio: {
    place: 'a bright Italian physiotherapy studio',
    worker: 'a physiotherapist in a white polo shirt',
    client: 'a patient lying on a treatment bed',
    seat: 'treatment bed',
  },
  mechanic: {
    place: 'a tidy Italian car repair workshop',
    worker: 'a mechanic in dark blue overalls',
    client: 'a customer standing next to their car',
    seat: 'car lift with no car on it',
  },
  legal: {
    place: 'an elegant Italian law office with bookshelves',
    worker: 'a lawyer in a suit',
    client: 'a client sitting across the desk',
    seat: 'client chair in front of the desk',
  },
  nutrition: {
    place: 'a bright Italian nutritionist studio with fresh fruit on the desk',
    worker: 'a nutritionist in a light coat',
    client: 'a patient sitting across the desk',
    seat: 'patient chair in front of the desk',
  },
  realestate: {
    place: 'a modern Italian real estate agency with house photos on the wall',
    worker: 'a real estate agent in a blazer',
    client: 'a couple looking at an apartment',
    seat: 'client chair in front of the desk',
  },
  medical: {
    place: 'a clean Italian dental clinic',
    worker: 'a dentist in scrubs and gloves',
    client: 'a patient in the dental chair',
    seat: 'dental chair',
  },
  beauty: {
    place: 'a stylish Italian hair salon',
    worker: 'a hairdresser with scissors and comb',
    client: 'a client sitting in the salon chair',
    seat: 'salon chair',
  },
  generic: {
    place: 'a small Italian business office',
    worker: 'a small business owner',
    client: 'a client sitting across the desk',
    seat: 'client chair in front of the desk',
  },
};

const STYLE =
  'Realistic documentary b-roll, natural light, shallow depth of field, slow gentle camera movement, cinematic color grade. No text, no subtitles, no logos, no watermarks.';

/**
 * Writes the prompt of one b-roll clip.
 * @param sector The sector.
 * @param scene The scene.
 * @returns The prompt for the video model.
 */
export const brollPrompt = (sector: BrollSector, scene: BrollScene) => {
  const { place, worker, client, seat } = BROLL_SETTINGS[sector];
  const scenes: Record<BrollScene, string> = {
    busy: `In ${place}, ${worker} is fully focused working with ${client}, hands busy. In the foreground a smartphone on the desk lights up and vibrates with an incoming call that nobody can answer.`,
    evening: `Late evening in ${place}, empty and dim, lit by a single desk lamp. ${worker} sits alone, tired, scrolling through a long list of unread messages on a smartphone.`,
    noshow: `In ${place}, ${worker} waits next to an empty ${seat}, glances at the wall clock and then at the phone: the appointment did not show up.`,
    lost: `In ${place}, ${worker} sits at a desk covered in sticky notes and papers, a smartphone buzzing with notifications, rubbing their forehead, overwhelmed.`,
    dream: `In ${place}, full of warm light, ${worker} smiles, relaxed and confident, greeting ${client}; the day flows calmly and the business is thriving.`,
    review:
      'Close-up of the hands of a person sitting on a sofa at home, typing a short angry review on a smartphone, then tapping one star.',
    happy:
      'Close-up of a smiling woman in her kitchen who reads a message that just arrived on her smartphone, relieved and happy, and replies with her thumb.',
  };

  return `${scenes[scene]} ${STYLE}`;
};
