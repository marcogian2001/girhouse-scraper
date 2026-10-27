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

    it('finds a request form that asks for a phone number instead of a message', () => {
      const html =
        '<form action="/richiesta"><input name="nome"><input type="tel" name="tel"><button type="submit">Invia</button></form>';

      expect(detectContactChannels(html).contactForm).toBeTruthy();
    });

    it('ignores a login form', () => {
      const html =
        '<form action="/login"><input type="email" name="email"><input type="password" name="pwd"></form>';

      expect(detectContactChannels(html).contactForm).toBeFalsy();
    });
  });

  describe('Booking', () => {
    it('finds a "Prenota ora" button', () => {
      expect(
        detectContactChannels('<a class="btn" href="/servizi">Prenota ora</a>').booking,
      ).toBeTruthy();
    });

    it('finds a link to a booking page', () => {
      expect(detectContactChannels('<a href="/prenotazioni/">Orari</a>').booking).toBeTruthy();
    });

    it('finds a form with a date field', () => {
      const html =
        '<form action="/send"><input name="nome"><input type="date" name="giorno"></form>';

      expect(detectContactChannels(html).booking).toBeTruthy();
    });

    it('finds a form named for bookings', () => {
      const html = '<form id="form-prenotazione"><input name="nome"></form>';

      expect(detectContactChannels(html).booking).toBeTruthy();
    });

    it('finds an embedded TheFork widget', () => {
      const html = '<script src="https://widget.thefork.com/abc.js"></script>';

      expect(detectContactChannels(html).booking).toBeTruthy();
    });

    it('finds the Amelia booking plugin', () => {
      const html = '<link href="/wp-content/plugins/ameliabooking/public/css/amelia.css">';

      expect(detectContactChannels(html).booking).toBeTruthy();
    });

    it('finds a Wix Bookings site', () => {
      expect(
        detectContactChannels('<script>{"artifactId":"bookings-uou"}</script>').booking,
      ).toBeTruthy();
    });

    it('counts a phone link that offers to book', () => {
      expect(
        detectContactChannels('<a href="tel:+390612345678">Chiama per prenotare</a>').booking,
      ).toBeTruthy();
    });

    it('ignores a Facebook link', () => {
      expect(
        detectContactChannels('<a href="https://facebook.com/studio">Facebook</a>').booking,
      ).toBeFalsy();
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
