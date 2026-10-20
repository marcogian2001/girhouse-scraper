import { normalizeForMatching } from './ReplyText';

/**
 * Phrases that always mean "never contact me again", matched on normalised text.
 * Deliberately broad: a false stop costs one lead, a missed one costs the domain.
 */
const STOP_PATTERNS = [
  /\bnon (?:mi|ci) (?:scriv|contatt|mand|disturb|cerc)/u,
  /\bnon (?:scrivete|scrivetemi|scriveteci|contattatemi|contattateci|mandatemi|mandateci|disturbatemi)\b/u,
  /\b(?:cancell|rimuov|togl|elimin)(?:atemi|etemi|ietemi|ateci|eteci|ieteci|armi|arci|ermi|erci|iermi|ierci)\b/u,
  /\b(?:cancellate|rimuovete|togliete|eliminate) (?:il mio|la mia|i miei|il nostro|la nostra|questo indirizzo|questa email|questa mail)/u,
  /\b(?:cancellami|cancellaci|rimuovimi|rimuovici|toglimi|toglici|eliminami|eliminaci)\b/u,
  /\bnon (?:inviate|inviatemi|inviateci|inviarmi|inviarci|mandarmi|mandarci|scrivermi|scriverci|contattarmi|contattarci)\b/u,
  /\brevoc\w* (?:\w+ ){0,4}consenso\b/u,
  /\bconsenso al trattamento\b/u,
  /\bdisiscriv/u,
  /\bunsubscribe\b/u,
  /\bnon (?:voglio|vogliamo) (?:piu )?ricevere\b/u,
  /\bbasta (?:con )?(?:le )?(?:email|mail|messaggi|scrivere)\b/u,
  /\bsmettete(?:la)?\b/u,
  /\blasciatemi in pace\b/u,
  /\bspam\b/u,
  /\bgarante\b/u,
  /\b(?:denunc|diffid|querel)/u,
  /\b(?:vi|ti) segnal(?:o|ero|eremo) (?:al|alla|alle|come|per)\b/u,
  /^stop[.!]*$/u,
];

/**
 * Tells whether a reply asks to stop all contact, before any AI reads it.
 * @param reply The lead's own words, without the quoted thread.
 * @returns True when the reply is a stop request.
 */
export const isStopRequest = (reply: string) => {
  const text = normalizeForMatching(reply);

  return STOP_PATTERNS.some((pattern) => pattern.test(text));
};
