import {
  Bricolage_Grotesque,
  Cormorant_Garamond,
  DM_Sans,
  Fraunces,
  Inter,
  Lora,
  Manrope,
  Nunito,
  Outfit,
  Playfair_Display,
  Plus_Jakarta_Sans,
  Source_Sans_3,
} from 'next/font/google';
import type { DemoFontPairing } from '@/utils/DemoDesign';

// Not preloaded: a demo shows one pair, so the others are never downloaded
const playfair = Playfair_Display({ subsets: ['latin'], preload: false });
const sourceSans = Source_Sans_3({ subsets: ['latin'], preload: false });
const fraunces = Fraunces({ subsets: ['latin'], preload: false });
const inter = Inter({ subsets: ['latin'], preload: false });
const cormorant = Cormorant_Garamond({ subsets: ['latin'], weight: 'variable', preload: false });
const manrope = Manrope({ subsets: ['latin'], preload: false });
const lora = Lora({ subsets: ['latin'], preload: false });
const nunito = Nunito({ subsets: ['latin'], preload: false });
const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], preload: false });
const bricolage = Bricolage_Grotesque({ subsets: ['latin'], preload: false });
const dmSans = DM_Sans({ subsets: ['latin'], preload: false });
const outfit = Outfit({ subsets: ['latin'], preload: false });

type NextFont = typeof inter;

const PAIRINGS: Record<DemoFontPairing, { heading: NextFont; body: NextFont }> = {
  classic: { heading: playfair, body: sourceSans },
  editorial: { heading: fraunces, body: inter },
  refined: { heading: cormorant, body: manrope },
  warm: { heading: lora, body: nunito },
  modern: { heading: jakarta, body: jakarta },
  friendly: { heading: nunito, body: nunito },
  bold: { heading: bricolage, body: dmSans },
  clinical: { heading: outfit, body: inter },
};

/**
 * Builds the font variables a landing is set in.
 * @param pairing The pair the design picked, if the demo has a design.
 * @returns The heading and body font variables; the app's font for demos without a design.
 */
export const demoFontVariables = (pairing: DemoFontPairing | undefined): Record<string, string> =>
  pairing
    ? {
        '--demo-heading': PAIRINGS[pairing].heading.style.fontFamily,
        '--demo-body': PAIRINGS[pairing].body.style.fontFamily,
      }
    : { '--demo-heading': 'var(--font-sans)', '--demo-body': 'var(--font-sans)' };
