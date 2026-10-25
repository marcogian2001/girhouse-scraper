import { describe, expect, it } from 'vitest';
import { detectContactChannels } from './WebsiteCheck';

describe('Website check', () => {
  describe('Contact form', () => {
    it('finds a form with a message field', () => {
      const html =
        '<form action="/send"><input name="email"><textarea name="msg"></textarea></form>';

      expect(detectContactChannels(html).contactForm).toBeTruthy();
    });

    it('ignores a newsletter form without a message field', () => {
      const html = '<form action="/subscribe"><input type="email" name="email"></form>';

      expect(detectContactChannels(html).contactForm).toBeFalsy();
    });

    it('finds a Contact Form 7 form rendered without a textarea', () => {
      const html = '<div class="wpcf7 js" id="wpcf7-f12"><form class="wpcf7-form"></form></div>';

      expect(detectContactChannels(html).contactForm).toBeTruthy();
    });

    it('finds an embedded Google Form', () => {
      const html = '<iframe src="https://docs.google.com/forms/d/e/abc/viewform"></iframe>';

      expect(detectContactChannels(html).contactForm).toBeTruthy();
    });
  });

  describe('Other channels', () => {
    it('finds a WhatsApp link', () => {
      expect(
        detectContactChannels('<a href="https://wa.me/393331234567">Chat</a>').whatsapp,
      ).toBeTruthy();
    });

    it('finds an embedded Calendly booking page', () => {
      const html = '<iframe src="https://calendly.com/studio/visita"></iframe>';

      expect(detectContactChannels(html).booking).toBeTruthy();
    });

    it('does not mistake a domain ending in cal.com for a booking page', () => {
      expect(
        detectContactChannels('<a href="https://tropical.com/menu">Menu</a>').booking,
      ).toBeFalsy();
    });

    it('finds a clickable phone number', () => {
      expect(detectContactChannels('<a href="tel:+390612345678">Chiama</a>').phone).toBeTruthy();
    });

    it('finds nothing on a page with only text', () => {
      expect(detectContactChannels('<p>Via Roma 1, Roma. Tel 06 1234567</p>')).toStrictEqual({
        contactForm: false,
        whatsapp: false,
        booking: false,
        phone: false,
      });
    });
  });
});
