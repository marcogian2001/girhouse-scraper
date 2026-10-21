import { describe, expect, it } from 'vitest';
import { extractEmails, findContactLinks, rankEmails } from './WebsiteContacts';

describe('WebsiteContacts', () => {
  describe('Email extraction', () => {
    it('finds mailto links and plain text addresses', () => {
      const html =
        '<a href="mailto:Info@Rossi.it?subject=Ciao">Scrivici</a><p>Segreteria: segreteria@rossi.it</p>';

      expect(extractEmails(html)).toStrictEqual(['info@rossi.it', 'segreteria@rossi.it']);
    });

    it('decodes addresses hidden by Cloudflare', () => {
      const html =
        '<a href="/cdn-cgi/l/email-protection" data-cfemail="2a43444c456a584559594304435e">[email&#160;protected]</a>';

      expect(extractEmails(html)).toStrictEqual(['info@rossi.it']);
    });

    it('reads addresses written to dodge scrapers', () => {
      expect(extractEmails('<p>info [at] rossi [dot] it</p>')).toStrictEqual(['info@rossi.it']);
      expect(extractEmails('<p>info chiocciola rossi.it</p>')).toStrictEqual(['info@rossi.it']);
      expect(extractEmails('<p>info&#64;rossi.it</p>')).toStrictEqual(['info@rossi.it']);
    });

    it('reads the address in structured data', () => {
      const html = '<script type="application/ld+json">{"email":"studio@rossi.it"}</script>';

      expect(extractEmails(html)).toStrictEqual(['studio@rossi.it']);
    });

    it('skips image names, placeholders, tracking scripts and PEC addresses', () => {
      const html = [
        '<img src="logo@2x.png">',
        'nome@example.com',
        'abc123@o1.ingest.sentry.io',
        'rossi@pec.it',
        'latuaemail@email.it',
        'mario.rossi@gmail.com',
      ].join(' ');

      expect(extractEmails(html)).toStrictEqual([]);
    });
  });

  describe('Contact links', () => {
    it('picks same-site contact pages before privacy pages', () => {
      const html = [
        '<a href="/privacy-policy">Privacy</a>',
        '<a href="https://www.rossi.it/contatti/">Contatti</a>',
        '<a href="https://facebook.com/contact">Facebook</a>',
        '<a href="/servizi">Servizi</a>',
      ].join('');

      expect(findContactLinks(html, 'https://www.rossi.it/')).toStrictEqual([
        'https://www.rossi.it/contatti/',
        'https://www.rossi.it/privacy-policy',
      ]);
    });

    it('ignores contact lenses on an optician site', () => {
      const html = '<a href="/categoria/lenti-a-contatto/">Lenti a contatto</a>';

      expect(findContactLinks(html, 'https://ottica.it/')).toStrictEqual([]);
    });

    it('matches a link by its text', () => {
      const html = '<a href="/pagina-3"><span>Chi siamo</span></a>';

      expect(findContactLinks(html, 'https://rossi.it/')).toStrictEqual([
        'https://rossi.it/pagina-3',
      ]);
    });
  });

  describe('Email ranking', () => {
    it('puts the business domain first and webmail next', () => {
      expect(
        rankEmails({ emails: ['mario@gmail.com', 'info@rossi.it'], domain: 'rossi.it' }),
      ).toStrictEqual(['info@rossi.it', 'mario@gmail.com']);
    });

    it('drops another custom domain on the business site, likely its web agency', () => {
      expect(
        rankEmails({ emails: ['info@webagency.it', 'info@rossi.it'], domain: 'rossi.it' }),
      ).toStrictEqual(['info@rossi.it']);
    });

    it('keeps every address on a page builder', () => {
      expect(
        rankEmails({ emails: ['info@rossistudio.com', 'mario@gmail.com'], domain: null }),
      ).toStrictEqual(['mario@gmail.com', 'info@rossistudio.com']);
    });
  });
});
