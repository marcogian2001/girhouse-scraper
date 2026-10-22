import { describe, expect, it } from 'vitest';
import { guessMioDottoreUrl, isMioDottoreUrl, parseMioDottoreProfile } from './MioDottore';

const ld = {
  '@context': 'https://schema.org',
  '@type': 'Physician',
  name: 'Dott.ssa Giada Todisco',
  aggregateRating: { '@type': 'AggregateRating', ratingValue: 5, reviewCount: 616 },
  review: [
    {
      '@type': 'Review',
      author: { '@type': 'Person', name: 'LL' },
      datePublished: '2026-10-21T19:07:37+02:00',
      reviewRating: { '@type': 'Rating', ratingValue: 3 },
      reviewBody: 'La dottoressa non è venuta',
    },
    {
      '@type': 'Review',
      author: { '@type': 'Person', name: 'A.P.' },
      datePublished: '2026-10-15T10:20:06+02:00',
      reviewRating: { '@type': 'Rating', ratingValue: 5 },
      reviewBody: 'Solare, empatica e aperta nell&#39;ascolto.',
    },
  ],
};

const html = `<html><head>
<script type="application/ld+json">{"@type":"BreadcrumbList","itemListElement":[]}</script>
<script type="application/ld+json">${JSON.stringify(ld)}</script>
<script type="application/ld+json">{"@type":"Organization","name":"MioDottore"}</script>
<meta property="og:image" content="//pixel-p2.s3.eu-central-1.amazonaws.com/doctor/avatar/a2/a2-b3_small_square.jpg"/>
</head><body>
<img src="//pixel-p2.s3.eu-central-1.amazonaws.com/doctor/avatar/a2/a2-b3_large.jpg">
<div data-photos="[&quot;//pixel-p2.s3.eu-central-1.amazonaws.com/doctor/photos/f1/f1-aa_large.jpg&quot;,&quot;//pixel-p2.s3.eu-central-1.amazonaws.com/doctor/photos/f2/f2-bb_large.jpg&quot;]"></div>
<img src="//pixel-p2.s3.eu-central-1.amazonaws.com/doctor/photos/f1/f1-aa_large.jpg">
<div class="about-description" data-test-id="about-description">
<p>Sono <strong>Giada Todisco</strong>, biologa nutrizionista.</p><ul><li><p>Dieta Mediterranea</p></li></ul>
</div>
<h4><span data-test-id="address-info-street">Via Giovanni Gastaldi 42,</span>
  piano -1, <a href="/nutrizionista/roma" title="Roma">Roma</a> 00144</h4>
<ul>
<li data-test-id="address-service-item"><a href="/servizi/prima-visita/roma">Prima Visita</a>
  <span><button><span>(descrizione)</span></button></span>
  <span data-id="service-price">&bullet; 100 €</span></li>
<li data-test-id="address-service-item"><a href="/servizi/prima-visita/sora">Prima Visita</a>
  <span data-id="service-price">&bullet; 90 €</span></li>
<li data-test-id="address-service-item"><a href="/servizi/controllo-peso">Controllo peso</a></li>
</ul>
</body></html>`;

describe('MioDottore', () => {
  const profile = parseMioDottoreProfile(html, 'https://www.miodottore.it/profilo/giada-todisco');

  it('reads the name, rating and review count from the structured data', () => {
    expect(profile?.name).toBe('Dott.ssa Giada Todisco');
    expect(profile?.rating).toBe(5);
    expect(profile?.reviewsCount).toBe(616);
  });

  it('keeps only good reviews with their date and decoded text', () => {
    expect(profile?.reviews).toStrictEqual([
      {
        author: 'A.P.',
        rating: 5,
        when: '2026-10-15',
        text: "Solare, empatica e aperta nell'ascolto.",
      },
    ]);
  });

  it('finds the large portrait and the studio photos once each', () => {
    expect(profile?.portraitUrl).toBe(
      'https://pixel-p2.s3.eu-central-1.amazonaws.com/doctor/avatar/a2/a2-b3_large.jpg',
    );
    expect(profile?.photos).toStrictEqual([
      'https://pixel-p2.s3.eu-central-1.amazonaws.com/doctor/photos/f1/f1-aa_large.jpg',
      'https://pixel-p2.s3.eu-central-1.amazonaws.com/doctor/photos/f2/f2-bb_large.jpg',
    ]);
  });

  it('reads the presentation with its list items on their own lines', () => {
    expect(profile?.about).toBe('Sono Giada Todisco, biologa nutrizionista.\n- Dieta Mediterranea');
  });

  it('lists each service once with its first price', () => {
    expect(profile?.services).toStrictEqual([
      { name: 'Prima Visita', price: '100 €' },
      { name: 'Controllo peso', price: null },
    ]);
  });

  it('reads the addresses as one line each', () => {
    expect(profile?.addresses).toStrictEqual(['Via Giovanni Gastaldi 42, piano -1, Roma 00144']);
  });

  it('returns null for a page that is not a profile', () => {
    expect(
      parseMioDottoreProfile('<html></html>', 'https://www.miodottore.it/dentista/roma'),
    ).toBeNull();
  });

  it('guesses the profile link from a name with accents and spaces', () => {
    expect(guessMioDottoreUrl({ firstName: 'Niccolò', lastName: 'De Santis' })).toBe(
      'https://www.miodottore.it/profilo/niccolo-de-santis',
    );
  });

  it('recognises MioDottore links only', () => {
    expect(
      isMioDottoreUrl('https://www.miodottore.it/giada-todisco/nutrizionista/roma'),
    ).toBeTruthy();
    expect(isMioDottoreUrl('https://giadatodisco.it')).toBeFalsy();
  });
});
