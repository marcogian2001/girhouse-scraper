import { normalizeHex } from '@/utils/Colors';

const FETCH_TIMEOUT_MS = 8000;

const MAX_HTML_BYTES = 1_500_000;

const MAX_TEXT_LENGTH = 6000;

/** What a business's own website says about it. */
export type WebsiteBrand = {
  logoUrl: string | null;
  themeColor: string | null;
  title: string | null;
  description: string | null;
  // Visible text, for the AI to read services from
  text: string;
};

/**
 * Reads an attribute out of one HTML tag.
 * @param tag The tag source.
 * @param name The attribute name.
 * @returns The attribute value, or undefined when it is missing.
 */
const readAttribute = (tag: string, name: string) =>
  tag.match(new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`, 'iu'))?.[1]?.trim();

/**
 * Decodes the HTML entities websites commonly use in text.
 * @param text The raw text.
 * @returns The text with entities decoded.
 */
const decodeEntities = (text: string) =>
  text
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll(/&#39;|&apos;/gu, "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll(/&#(\d+);/gu, (_match, code: string) => String.fromCodePoint(Number(code)));

/**
 * Resolves a link found on a page.
 * @param href The link as written.
 * @param baseUrl The page it was found on.
 * @returns The absolute https or http URL, or null when it cannot be one.
 */
const resolveUrl = (href: string | undefined, baseUrl: string) => {
  if (!href || !URL.canParse(href, baseUrl)) {
    return null;
  }

  const url = new URL(href, baseUrl);

  return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
};

/**
 * Finds the largest square size an icon link declares.
 * @param tag The link tag.
 * @returns The size in pixels, 0 when none is declared.
 */
const iconSize = (tag: string) =>
  Math.max(
    0,
    ...(readAttribute(tag, 'sizes') ?? '')
      .split(/\s+/u)
      // Sizes read like "192x192"
      .map((size) => Number(size.split('x')[0]))
      .filter(Number.isFinite),
  );

/**
 * Picks a logo good enough to show large: an apple touch icon, an SVG icon or an icon of at least 96px.
 * @param links The link tags of the page.
 * @param baseUrl The page URL.
 * @returns The logo URL, or null when the site only has a tiny favicon.
 */
const findLogo = (links: string[], baseUrl: string) => {
  const icons = links.flatMap((tag) => {
    const rel = readAttribute(tag, 'rel')?.toLowerCase() ?? '';
    const href = readAttribute(tag, 'href');

    if (rel.includes('apple-touch-icon')) {
      return [{ href, score: 1000 + iconSize(tag) }];
    }

    const isSvg =
      /\.svg(?:$|\?)/iu.test(href ?? '') || readAttribute(tag, 'type') === 'image/svg+xml';

    if (rel.split(/\s+/u).includes('icon') && (isSvg || iconSize(tag) >= 96)) {
      return [{ href, score: isSvg ? 900 : iconSize(tag) }];
    }

    return [];
  });

  const best = icons.toSorted((a, b) => b.score - a.score).at(0);

  return resolveUrl(best?.href, baseUrl);
};

/**
 * Extracts a business's brand from its homepage HTML.
 * @param html The page source.
 * @param baseUrl The page URL, to resolve relative links.
 * @returns The logo, theme colour, title, description and visible text.
 */
export const parseBrandHtml = (html: string, baseUrl: string): WebsiteBrand => {
  const metas = html.match(/<meta\b[^>]*>/giu) ?? [];
  const links = html.match(/<link\b[^>]*>/giu) ?? [];

  const meta = (key: string) =>
    metas
      .find(
        (tag) =>
          readAttribute(tag, 'name')?.toLowerCase() === key ||
          readAttribute(tag, 'property')?.toLowerCase() === key,
      )
      ?.match(/\scontent\s*=\s*["']([^"']*)["']/iu)?.[1]
      ?.trim();

  const title = html.match(/<title[^>]*>([^<]*)<\/title>/iu)?.[1];

  const text = decodeEntities(
    html
      .replaceAll(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/giu, ' ')
      .replaceAll(/<!--[\s\S]*?-->/gu, ' ')
      .replaceAll(/<[^>]+>/gu, ' '),
  )
    .replaceAll(/\s+/gu, ' ')
    .trim()
    .slice(0, MAX_TEXT_LENGTH);

  const description = meta('description') ?? meta('og:description');

  return {
    logoUrl: findLogo(links, baseUrl),
    themeColor: normalizeHex(meta('theme-color')),
    title: title ? decodeEntities(title).trim() || null : null,
    description: description ? decodeEntities(description) : null,
    text,
  };
};

/**
 * Downloads a business's homepage and reads its brand.
 * A site that is down, slow or not HTML is simply skipped.
 * @param url The website URL.
 * @returns The brand, or null when the page could not be read.
 */
export const fetchWebsiteBrand = async (url: string) => {
  const response = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GirhouseDemo/1.0)', Accept: 'text/html' },
  }).catch(() => null);

  if (!response?.ok || !response.headers.get('content-type')?.includes('text/html')) {
    return null;
  }

  if (Number(response.headers.get('content-length') ?? 0) > MAX_HTML_BYTES) {
    return null;
  }

  const text = await response.text().catch(() => '');
  const html = text.slice(0, MAX_HTML_BYTES);

  return html ? parseBrandHtml(html, response.url === '' ? url : response.url) : null;
};
