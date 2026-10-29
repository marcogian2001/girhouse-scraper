import type { automationSettingsSchema } from '@/models/Schema';

export type AutomationSettings = typeof automationSettingsSchema.$inferSelect;

/**
 * Describes the Girhouse offer from the organization's settings. Every generated
 * text is grounded in this, so prices and scarcity are never hard-coded in a prompt.
 * @param settings The organization's automation settings.
 * @returns The offer, in Italian, as the AI should understand it.
 */
export const buildOfferBrief = (settings: AutomationSettings) =>
  [
    "Girhouse rifà la landing page dell'attività e configura Go High Level: telefono, WhatsApp ed email collegati in un unico posto, risposta automatica e follow-up automatici a chi non risponde. Numeri e account restano del cliente.",
    `Prezzo: ${settings.monthlyPrice}€/mese, zero costi di attivazione, nessun vincolo, assistenza italiana inclusa.`,
    'Garanzia soddisfatti o rimborsati: se dopo 30 giorni non è soddisfatto, gli rimborsiamo quanto ha pagato. Non esiste una prova o una settimana gratuita: non va mai promessa.',
    `Il prezzo va presentato come quasi un regalo per quello che include, mai come una promozione a tempo: nei messaggi non si citano scadenze né aumenti di prezzo.`,
    `Scarcity reale, l'unica che si può usare: prendiamo solo ${settings.onboardingSlotsPerMonth} nuove attività al mese.`,
  ].join('\n');
