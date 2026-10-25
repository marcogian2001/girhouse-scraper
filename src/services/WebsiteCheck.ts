import type { WebsiteCheck } from '@/validations/EnrichmentValidation';
import { fetchHtml, parseBrandHtml } from './WebsiteBrand';
import { fetchHomepage, findExtraPages } from './WebsiteContacts';

/** Pages read besides the homepage: the contact page comes first among the extra pages. */
const MAX_CONTACT_PAGES = 2;

/** Below this much visible text the page is built by scripts, so what its source lacks proves nothing. */
const MIN_VISIBLE_TEXT = 200;

/** Form builders and embeds that make a contact form, even when its fields are rendered by a script. */
const FORM_BUILDER =
  /wpcf7|gform_wrapper|elementor-form|wpforms|nf-form-cont|frm_forms|wixui-form|hs-form|hsforms\.net|jotform|typeform\.com|docs\.google\.com\/forms|forms\.gle/iu;

const WHATSAPP = /wa\.me\/|api\.whatsapp\.com|web\.whatsapp\.com|whatsapp:\/\/|joinchat/iu;

/** Booking platforms a page links to or embeds. */
const BOOKING =
  /calendly\.com|[/.]cal\.com\/|miodottore\.it|doctolib\.|booksy\.com|treatwell\.|fresha\.com|uala\.(?:it|com)|setmore\.com|simplybook\.|acuityscheduling\.com|youcanbook\.me|bookings\.zoho/iu;

const PHONE_LINK = /href\s*=\s*["']\s*tel:/iu;

/**
 * Finds the ways a page lets a visitor get in touch. A newsletter or search
 * form has no message field, so only a form with a textarea, or one built with
 * a form plugin, counts as a contact form.
 * @param html The page source.
 * @returns Which contact channels the page offers.
 */
export const detectContactChannels = (html: string) => ({
  contactForm:
    (html.match(/<form\b[\s\S]*?<\/form>/giu) ?? []).some((form) => /<textarea\b/iu.test(form)) ||
    FORM_BUILDER.test(html),
  whatsapp: WHATSAPP.test(html),
  booking: BOOKING.test(html),
  phone: PHONE_LINK.test(html),
});

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
