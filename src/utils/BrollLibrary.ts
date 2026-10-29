/**
 * The b-roll version B cuts to while the problems are told: silent stock clips from Pexels
 * (free for commercial use, no attribution needed), picked once and kept in
 * `public/demo/broll/{sector}/{scene}.mp4` at 720p with their poster. Where each one comes
 * from is listed in `docs/AUTOMAZIONE_RISPOSTE.md`.
 */
const BROLL_SECTORS = [
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

/** Scenes every sector has, each in its own setting. */
const SECTOR_BROLL_SCENES = ['busy', 'dream'] as const;

/** Scenes that look the same whatever the sector, kept under `shared`. */
const SHARED_BROLL_SCENES = ['evening', 'noshow', 'lost', 'review'] as const;

export type BrollScene =
  | (typeof SECTOR_BROLL_SCENES)[number]
  | (typeof SHARED_BROLL_SCENES)[number];

const SHARED = new Set<string>(SHARED_BROLL_SCENES);

/**
 * Finds the file of a b-roll clip.
 * @param sector The lead's sector.
 * @param scene The scene.
 * @returns The clip's path, without its extension: `.mp4` is the clip, `.jpg` its poster.
 */
export const brollPath = (sector: BrollSector, scene: BrollScene) =>
  `/demo/broll/${SHARED.has(scene) ? 'shared' : sector}/${scene}`;
