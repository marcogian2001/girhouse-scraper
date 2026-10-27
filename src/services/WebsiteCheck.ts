import type { WebsiteCheck } from '@/validations/EnrichmentValidation';
import { fetchHtml, parseBrandHtml } from './WebsiteBrand';
import { fetchHomepage, findExtraPages } from './WebsiteContacts';

/** Pages read besides the homepage: the contact page comes first among the extra pages. */
const MAX_CONTACT_PAGES = 2;

/** Below this much visible text the page is built by scripts, so what its source lacks proves nothing. */
const MIN_VISIBLE_TEXT = 200;

/** Form builders and embeds that make a contact form, even when its fields are rendered by a script. */
const FORM_BUILDER =
  /wpcf7|gform_wrapper|elementor-form|wpforms|nf-form-cont|frm_forms|wixui-form|hs-form|hsforms\.net|jotform|typeform\.com|docs\.google\.com\/forms|forms\.gle|(?:leadconnectorhq|msgsndr)\.com\/widget\/(?:form|survey)/iu;

const WHATSAPP = /wa\.me\/|api\.whatsapp\.com|web\.whatsapp\.com|whatsapp:\/\/|joinchat/iu;

/** Booking platforms and plugins a page links to or embeds. */
const BOOKING =
  /calendly\.com|[/.]cal\.com\/|miodottore\.it|doctolib\.|booksy\.com|treatwell\.|fresha\.com|uala\.(?:it|com)|setmore\.com|simplybook\.|acuityscheduling\.com|youcanbook\.me|bookings\.zoho|thefork\.|quandoo\.|opentable\.|idoctors\.it|(?:leadconnectorhq|msgsndr)\.com\/widget\/(?:booking|group)|ameliabooking|bookly|bookingpress|calendar\.google\.com\/calendar\/appointments|calendar\.app\.google|tidycal\.com|zcal\.co|squareup\.com\/appointments|wix-?bookings|bookings-uou/iu;

/** Words that mark a link, button or form as a way to book. */
const BOOKING_WORDS =
  /prenot|appuntament|book(?:ing|[\s-]+now|[\s-]+online)|reservation|appointment/iu;

/** Date and time fields, which only a booking or reservation form asks for. */
const DATE_FIELD = /<input\b[^>]*type\s*=\s*["']?(?:date|time|datetime-local)\b/iu;

/** Fields a visitor fills in, leaving out hidden fields, buttons and ticks. */
const VISIBLE_FIELD =
  /<(?:input|select|textarea)\b(?![^>]*type\s*=\s*["']?(?:hidden|submit|button|reset|checkbox|radio|image)\b)[^>]*>/giu;

const PHONE_LINK = /href\s*=\s*["']\s*tel:/iu;

/**
 * Tells whether a form asks for a message or a way to call back. A newsletter
 * form has only an email field and a login form a password, so neither counts.
 * @param form The form source.
 * @returns Whether the form lets a visitor send an enquiry.
 */
const isEnquiryForm = (form: string) =>
  /<textarea\b/iu.test(form) ||
  (/type\s*=\s*["']?(?:email|tel)\b/iu.test(form) &&
    !/type\s*=\s*["']?password\b/iu.test(form) &&
    (form.match(VISIBLE_FIELD) ?? []).length >= 2);

/**
 * Tells whether a page lets a visitor book: a booking platform, a form with
 * date fields or named for bookings, or a link or button that talks about
 * booking. A "call to book" link counts too, since an email calling online
 * booking missing must never be wrong.
 * @param html The page source.
 * @param forms The page's forms.
 * @returns Whether the page offers a way to book.
 */
const offersBooking = (html: string, forms: string[]) =>
  BOOKING.test(html) ||
  forms.some(
    (form) => DATE_FIELD.test(form) || BOOKING_WORDS.test(form.slice(0, form.indexOf('>'))),
  ) ||
  (html.match(/<(?:a|button)\b[\s\S]*?<\/(?:a|button)>/giu) ?? []).some((action) =>
    BOOKING_WORDS.test(action),
  );

/**
 * Finds the ways a page lets a visitor get in touch. A newsletter or search
 * form asks for neither a message nor a phone number, so only an enquiry
 * form, or one built with a form plugin, counts as a contact form.
 * @param html The page source.
 * @returns Which contact channels the page offers.
 */
export const detectContactChannels = (html: string) => {
  const forms = html.match(/<form\b[\s\S]*?<\/form>/giu) ?? [];

  return {
    contactForm: forms.some(isEnquiryForm) || FORM_BUILDER.test(html),
    whatsapp: WHATSAPP.test(html),
    booking: offersBooking(html, forms),
    phone: PHONE_LINK.test(html),
  };
};

/**
 * Reads a business's homepage and contact pages to see which contact channels
 * it really offers, so an email never calls missing something the site has.
 * @param website The website as listed on Google Maps.
 * @returns The channels found, with `read` false when a missing channel cannot be trusted.
 */
export const checkWebsite = async (website: string): Promise<WebsiteCheck> => {
  const home = await fetchHomepage(website);

  if (!home) {
    return {
      read: false,
      pages: [],
      contactForm: false,
      whatsapp: false,
      booking: false,
      phone: false,
    };
  }

  const extraUrls = findExtraPages(home).slice(0, MAX_CONTACT_PAGES);
  const fetched = await Promise.all(extraUrls.map(fetchHtml));
  const extraPages = fetched.filter((page) => page !== null);
  const pages = [home, ...extraPages];
  const channels = pages.map((page) => detectContactChannels(page.html));

  return {
    // A contact page that would not load may hold the form the homepage lacks
    read:
      parseBrandHtml(home.html, home.url).text.length >= MIN_VISIBLE_TEXT &&
      (extraUrls.length === 0 || extraPages.length > 0),
    pages: pages.map((page) => page.url),
    contactForm: channels.some((found) => found.contactForm),
    whatsapp: channels.some((found) => found.whatsapp),
    booking: channels.some((found) => found.booking),
    phone: channels.some((found) => found.phone),
  };
};
