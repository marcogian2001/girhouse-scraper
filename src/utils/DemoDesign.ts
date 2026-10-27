/** Heading and body font pairs a demo landing can be set in, from formal to bold. */
export const DEMO_FONT_PAIRINGS = [
  'classic',
  'editorial',
  'refined',
  'warm',
  'modern',
  'friendly',
  'bold',
  'clinical',
] as const;

/** How the top of the landing is laid out. */
export const DEMO_HEROES = ['photo', 'split', 'centered', 'editorial'] as const;

/** How the services are listed. */
export const DEMO_SERVICE_LAYOUTS = ['cards', 'list', 'numbered'] as const;

/** The background of the alternate sections. */
export const DEMO_SURFACES = ['white', 'warm', 'tinted'] as const;

/** How round cards, photos and buttons are. */
export const DEMO_CORNERS = ['sharp', 'soft', 'round'] as const;

/** The sections between the hero and the review system, whose order a design picks. */
export const LANDING_BODY_SECTIONS = [
  'services',
  'highlights',
  'about',
  'steps',
  'reviews',
  'faq',
] as const;

export type DemoFontPairing = (typeof DEMO_FONT_PAIRINGS)[number];

export type LandingBodySection = (typeof LANDING_BODY_SECTIONS)[number];

/** The look the AI picks for a business's landing. */
export type DemoDesign = {
  fonts: DemoFontPairing;
  // Hex colour for details next to the primary one
  accentColor: string;
  surface: (typeof DEMO_SURFACES)[number];
  corners: (typeof DEMO_CORNERS)[number];
  hero: (typeof DEMO_HEROES)[number];
  services: (typeof DEMO_SERVICE_LAYOUTS)[number];
  sectionOrder: LandingBodySection[];
};

/** The order of the body sections in demos built before designs existed. */
export const DEFAULT_SECTION_ORDER: LandingBodySection[] = [
  'services',
  'highlights',
  'about',
  'steps',
  'reviews',
  'faq',
];

const SURFACES: Record<DemoDesign['surface'], string> = {
  white: '#ffffff',
  warm: '#faf6ef',
  tinted: 'color-mix(in oklab, var(--demo-primary) 7%, white)',
};

const RADII: Record<DemoDesign['corners'], string> = {
  sharp: '0.25rem',
  soft: '1rem',
  round: '1.75rem',
};

const PILL = '9999px';

/**
 * Builds the CSS variables a landing is styled with, besides its fonts.
 * A demo built before designs existed keeps its original look.
 * @param options The demo's colours and design.
 * @param options.primaryColor The business's colour.
 * @param options.design The design, if the demo has one.
 * @returns The accent, surface, card radius and button radius variables.
 */
export const demoThemeVariables = (options: {
  primaryColor: string;
  design: DemoDesign | null | undefined;
}): Record<string, string> => ({
  '--demo-accent': options.design?.accentColor ?? options.primaryColor,
  '--demo-surface': options.design ? SURFACES[options.design.surface] : '#fafafa',
  '--demo-radius': options.design ? RADII[options.design.corners] : RADII.soft,
  // Buttons stay pills unless the design is sharp
  '--demo-pill': options.design?.corners === 'sharp' ? RADII.sharp : PILL,
});
