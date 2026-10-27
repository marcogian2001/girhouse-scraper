import { isUsableBrandColor, normalizeHex } from '@/utils/Colors';

const FETCH_TIMEOUT_MS = 8000;

const MAX_HTML_BYTES = 1_500_000;

const MAX_TEXT_LENGTH = 6000;

/** Photos a page can lend a demo at most. */
const MAX_IMAGES = 6;

/** An image declared narrower than this is an icon or a thumbnail, not a photo. */
const MIN_IMAGE_WIDTH_PX = 300;

/** Stylesheets of the site read for its colours and fonts. */
const MAX_STYLESHEETS = 2;

const MAX_CSS_BYTES = 400_000;

/** Colours and fonts a site uses at most, the most frequent first. */
const MAX_BRAND_TOKENS = 3;

/** Fonts that say nothing about a brand: generic families, system fonts and icon fonts. */
const PLAIN_FONT =
  /^(?:inherit|initial|unset|serif|sans-serif|monospace|cursive|system-ui|-apple-system|blinkmacsystemfont|ui-\w+|arial|helvetica(?: neue)?|times(?: new roman)?|georgia|verdana|tahoma|segoe ui|roboto|apple color emoji|segoe ui emoji|.*(?:awesome|icon|dashicons|eicons|glyph).*)$/iu;

/** Image files that are logos, icons or decoration rather than photos of the business. */
const DECORATION =
  /logo|icon|favicon|sprite|avatar|placeholder|badge|\.svg(?:$|\?)|\.gif(?:$|\?)/iu;

/** What a business's own website says about it. */
export type WebsiteBrand = {
  logoUrl: string | null;
  themeColor: string | null;
  // Colours with presence the site's styles use, the most frequent first
  colors: string[];
  // Font families the site loads or declares, the most frequent first
  fonts: string[];
  title: string | null;
  description: string | null;
  // Visible text, for the AI to read services from
  text: string;
  // Photos the page shows, the sharing image first
  images: string[];
};

/**
 * Reads an attribute out of one HTML tag.
 * @param tag The tag source.
 * @param name The attribute name.
 * @returns The attribute value, or undefined when it is missing.
 */
export const readAttribute = (tag: string, name: string) =>
  tag.match(new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`, 'iu'))?.[1]?.trim();

/**
 * Decodes the HTML entities websites commonly use in text.
 * @param text The raw text.
 * @returns The text with entities decoded.
 */
export const decodeEntities = (text: string) =>
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
export const resolveUrl = (href: string | undefined, baseUrl: string) => {
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
 * Picks the photos a page shows: its sharing image, then its large inline images.
 * @param options The page parts.
 * @param options.sharingImage The `og:image` of the page, if any.
 * @param options.html The page source.
 * @param options.baseUrl The page URL.
 * @returns Up to `MAX_IMAGES` absolute photo URLs.
 */
const findImages = (options: { sharingImage?: string; html: string; baseUrl: string }) => {
  const inline = (options.html.match(/<img\b[^>]*>/giu) ?? []).flatMap((tag) => {
    const width = Number(readAttribute(tag, 'width') ?? 0);

    return width > 0 && width < MIN_IMAGE_WIDTH_PX
      ? []
      : [readAttribute(tag, 'data-src') ?? readAttribute(tag, 'src')];
  });

  const images = [options.sharingImage, ...inline]
    .map((href) => resolveUrl(href, options.baseUrl))
    .filter((url): url is string => url !== null && !DECORATION.test(url));

  return [...new Set(images)].slice(0, MAX_IMAGES);
};

/**
 * Lists values by how often they appear, the most frequent first.
 * @param values The values, repeated as often as they appear.
 * @returns Up to `MAX_BRAND_TOKENS` distinct values.
 */
const mostFrequent = (values: string[]) => {
  const counts = new Map<string, number>();

  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return [...counts.entries()]
    .toSorted((a, b) => b[1] - a[1])
    .slice(0, MAX_BRAND_TOKENS)
    .map(([value]) => value);
};

/**
 * Finds the colours with presence a site's styles use, leaving out whites, blacks and greys.
 * @param css The site's styles.
 * @returns The colours as lowercase six-digit hex, the most frequent first.
 */
const findColors = (css: string) =>
  mostFrequent(
    [...css.matchAll(/#(?:[0-9a-f]{6}|[0-9a-f]{3})(?![0-9a-f])/giu)]
      .map((match) => normalizeHex(match[0]))
      .filter((hex): hex is string => hex !== null && isUsableBrandColor(hex)),
  );

/**
 * Finds the font families a site loads from Google Fonts or declares in its styles.
 * @param options The page parts.
 * @param options.links The link tags of the page.
 * @param options.css The site's styles.
 * @returns The families, the most frequent first, generic and icon fonts left out.
 */
const findFonts = (options: { links: string[]; css: string }) => {
  const loaded = options.links.flatMap((tag) => {
    const href = decodeEntities(readAttribute(tag, 'href') ?? '');

    return href.includes('fonts.googleapis.com')
      ? [...href.matchAll(/family=([^&:]+)/gu)].map((match) =>
          decodeURIComponent(match[1] ?? '').replaceAll('+', ' '),
        )
      : [];
  });

  const declared = [...options.css.matchAll(/font-family\s*:\s*([^;}{!]+)/giu)].map(
    (match) => match[1]?.split(',')[0]?.trim().replaceAll(/["']/gu, '') ?? '',
  );

  return mostFrequent(
    [...loaded, ...declared].filter(
      (font) => font && !font.startsWith('var(') && !PLAIN_FONT.test(font),
    ),
  );
};

/**
 * Extracts a business's brand from its homepage HTML.
 * @param html The page source.
 * @param baseUrl The page URL, to resolve relative links.
 * @param stylesheets The site's stylesheets, when they were downloaded.
 * @returns The logo, theme colour, colours, fonts, title, description, visible text and photos.
 */
export const parseBrandHtml = (html: string, baseUrl: string, stylesheets = ''): WebsiteBrand => {
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
  const css = [
    ...[...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/giu)].map((match) => match[1]),
    ...[...html.matchAll(/\sstyle\s*=\s*"([^"]*)"/giu)].map((match) => match[1]),
    stylesheets,
  ].join('\n');

  return {
    logoUrl: findLogo(links, baseUrl),
    themeColor: normalizeHex(meta('theme-color')),
    colors: findColors(css),
    fonts: findFonts({ links, css }),
    title: title ? decodeEntities(title).trim() || null : null,
    description: description ? decodeEntities(description) : null,
    text,
    images: findImages({ sharingImage: meta('og:image'), html, baseUrl }),
  };
};

/**
 * Downloads one page of a business's website.
 * A site that is down, slow or not HTML is simply skipped.
 * @param url The page URL.
 * @returns The page source and the URL it ended up at after redirects, or null when it could not be read.
 */
export const fetchHtml = async (url: string) => {
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

  return html ? { html, url: response.url === '' ? url : response.url } : null;
};

/**
 * Downloads the first stylesheets a page links from its own host, where most sites keep their colours.
 * A stylesheet that cannot be read is simply skipped.
 * @param html The page source.
 * @param baseUrl The page URL.
 * @returns The stylesheets' text, joined.
 */
const fetchStylesheets = async (html: string, baseUrl: string) => {
  const host = new URL(baseUrl).hostname;
  const urls = (html.match(/<link\b[^>]*>/giu) ?? [])
    .filter((tag) => readAttribute(tag, 'rel')?.toLowerCase().split(/\s+/u).includes('stylesheet'))
    .map((tag) => resolveUrl(readAttribute(tag, 'href'), baseUrl))
    .filter((url): url is string => url !== null && new URL(url).hostname === host)
    .slice(0, MAX_STYLESHEETS);

  const sheets = await Promise.all(
    urls.map(async (url) => {
      const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }).catch(
        () => null,
      );
      const text = response?.ok ? await response.text().catch(() => '') : '';

      return text.slice(0, MAX_CSS_BYTES);
    }),
  );

  return sheets.join('\n');
};

/**
 * Downloads a business's homepage, with its own stylesheets, and reads its brand.
 * @param url The website URL.
 * @returns The brand, or null when the page could not be read.
 */
export const fetchWebsiteBrand = async (url: string) => {
  const page = await fetchHtml(url);

  if (!page) {
    return null;
  }

  return parseBrandHtml(page.html, page.url, await fetchStylesheets(page.html, page.url));
};
