/** Google place id of Italy, which a search splits into regions. */
export const ITALY_PLACE_ID = 'ChIJA9KNRIL-1BIRb15jJFz1LOI';

/** The 20 Italian regions, named as the provinces name them, from north to south. */
export const ITALIAN_REGION_NAMES = [
  'Piemonte',
  "Valle d'Aosta",
  'Lombardia',
  'Trentino-Alto Adige',
  'Veneto',
  'Friuli-Venezia Giulia',
  'Liguria',
  'Emilia-Romagna',
  'Toscana',
  'Umbria',
  'Marche',
  'Lazio',
  'Abruzzo',
  'Molise',
  'Campania',
  'Puglia',
  'Basilicata',
  'Calabria',
  'Sicilia',
  'Sardegna',
] as const;

export type ItalianRegionName = (typeof ITALIAN_REGION_NAMES)[number];

/** Google place id of each region, so a regional search resumes the same grid. */
export const ITALIAN_REGION_PLACE_IDS: Record<ItalianRegionName, string> = {
  Piemonte: 'ChIJZ7GdATt0h0cR_zsS8u24x7w',
  "Valle d'Aosta": 'ChIJp_WvxdbeiEcRm9WceXyYJVY',
  Lombardia: 'ChIJf4M-GsNEgUcR1JMVKCIm8qY',
  'Trentino-Alto Adige': 'ChIJ5bTpZ5F5eEcRYHyQFYcJBwE',
  Veneto: 'ChIJd7cEzPHXeEcRcHyQFYcJBwE',
  'Friuli-Venezia Giulia': 'ChIJ67q-XqQzekcRgHyQFYcJBwE',
  Liguria: 'ChIJtU8s2GUS0xIRkHw8R33mBQE',
  'Emilia-Romagna': 'ChIJ3YXzRny1KhMRoHy6_AubBwE',
  Toscana: 'ChIJezSAEFMr1BIRq1kgW7rDxro',
  Umbria: 'ChIJff2Ab86ZLhMRgmK_suBHCJw',
  Marche: 'ChIJPX4ilLt_LRMR0WA6TId0Fks',
  Lazio: 'ChIJNWU6NebuJBMRKYWj8WSQSm8',
  Abruzzo: 'ChIJI6qUuHc1MBMR8Hw4sppPCQE',
  Molise: 'ChIJU9hGRqSQMBMRn54iK3OMYRw',
  Campania: 'ChIJ35Zq01gTOxMRzUO1VBRFAs0',
  Puglia: 'ChIJ3ZO5jSvkNhMRj3wk-HC6bzk',
  Basilicata: 'ChIJgyyNBTHqOBMRjbbjVk3MQQI',
  Calabria: 'ChIJCxVihNKQPxMRcSMmPSQdpJE',
  Sicilia: 'ChIJs1lT0GhiEBMRUH22ZykECwE',
  Sardegna: 'ChIJHeK-0hzF3RIRYH0OyxW-CAE',
};

/**
 * Finds the region a Google place id stands for.
 * @param placeId The place id of a search area.
 * @returns The region name, or undefined when the place is not a region.
 */
export const findRegionByPlaceId = (placeId: string | null) =>
  ITALIAN_REGION_NAMES.find((name) => ITALIAN_REGION_PLACE_IDS[name] === placeId);
