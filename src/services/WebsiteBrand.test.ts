import { describe, expect, it } from 'vitest';
import { parseBrandHtml } from './WebsiteBrand';

const html = `<!doctype html><html><head>
<title>Pizzeria Da Mario &amp; Figli</title>
<meta name="description" content="Pizza napoletana a Bologna dal 1985">
<meta name="theme-color" content="#C0392B">
<link rel="icon" href="/favicon-32.png" sizes="32x32">
<link rel="icon" href="/icon-192.png" sizes="192x192">
<link rel="apple-touch-icon" href="/apple.png" sizes="180x180">
<style>.x { color: red }</style>
<script>var tracking = true;</script>
</head><body><nav>Menu</nav><h1>Pizze al forno a legna</h1><p>Asporto e consegna&nbsp;a domicilio.</p></body></html>`;

describe('WebsiteBrand', () => {
  const brand = parseBrandHtml(html, 'https://www.damario.it/home');

  it('prefers the apple touch icon as logo', () => {
    expect(brand.logoUrl).toBe('https://www.damario.it/apple.png');
  });

  it('reads the theme colour, title and description', () => {
    expect(brand.themeColor).toBe('#c0392b');
    expect(brand.title).toBe('Pizzeria Da Mario & Figli');
    expect(brand.description).toBe('Pizza napoletana a Bologna dal 1985');
  });

  it('keeps visible text without scripts or styles', () => {
    expect(brand.text).toContain('Pizze al forno a legna Asporto e consegna a domicilio.');
    expect(brand.text).not.toContain('tracking');
    expect(brand.text).not.toContain('color: red');
  });

  it('collects the sharing image and large photos, skipping logos and icons', () => {
    const page = parseBrandHtml(
      `<meta property="og:image" content="/cover.jpg">
      <img src="/logo.png"><img src="/thumb.jpg" width="80">
      <img data-src="/studio.jpg" src="data:image/gif;base64,R0lG"><img src="/cover.jpg">`,
      'https://www.studio.it/',
    );

    expect(page.images).toStrictEqual([
      'https://www.studio.it/cover.jpg',
      'https://www.studio.it/studio.jpg',
    ]);
  });

  it('ignores a site that only has a tiny favicon', () => {
    const tiny = parseBrandHtml('<link rel="icon" href="/favicon.ico">', 'https://example.com/');

    expect(tiny.logoUrl).toBeNull();
    expect(tiny.themeColor).toBeNull();
  });
});
