/** Links read from the guidance at most, so one rebuild stays inside its time limit. */
const MAX_LINKS = 5;

const LINK = /https?:\/\/[^\s<>"')\]]+/giu;

/**
 * Reads the links the Girhouse team put in a demo's guidance, in the order written.
 * @param guidance The guidance text.
 * @returns Up to `MAX_LINKS` distinct links, without trailing punctuation.
 */
export const extractLinks = (guidance: string | null) => {
  const links = [...(guidance?.matchAll(LINK) ?? [])].map((match) =>
    match[0].replace(/[.,;:!?]+$/u, ''),
  );

  return [...new Set(links)].slice(0, MAX_LINKS);
};
