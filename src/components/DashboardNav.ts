import {
  BarChart3,
  BookOpen,
  FlaskConical,
  Inbox,
  LayoutDashboard,
  Map as MapIcon,
  MessageSquareWarning,
  Search,
  Send,
  SlidersHorizontal,
  Vote,
} from 'lucide-react';

/**
 * The dashboard sections, shared by the sidebar and the top bar breadcrumb.
 * Labels are `AppSidebar` message keys. Home has no group: it sits above the
 * sections as the entry point.
 */
export const DASHBOARD_NAV = [
  {
    groupKey: null,
    items: [{ href: '/dashboard/', labelKey: 'nav_home', icon: LayoutDashboard, exact: true }],
  },
  {
    groupKey: 'group_prospecting',
    items: [
      { href: '/dashboard/leads/', labelKey: 'nav_leads', icon: Search, exact: false },
      { href: '/dashboard/coverage/', labelKey: 'nav_coverage', icon: MapIcon, exact: false },
    ],
  },
  {
    groupKey: 'group_outreach',
    items: [
      { href: '/dashboard/campaigns/', labelKey: 'nav_campaigns', icon: Send, exact: false },
      { href: '/dashboard/tests/', labelKey: 'nav_tests', icon: FlaskConical, exact: false },
      { href: '/dashboard/email-polls/', labelKey: 'nav_email_polls', icon: Vote, exact: false },
    ],
  },
  {
    groupKey: 'group_conversations',
    items: [
      { href: '/dashboard/replies/', labelKey: 'nav_replies', icon: Inbox, exact: false },
      { href: '/dashboard/metrics/', labelKey: 'nav_metrics', icon: BarChart3, exact: false },
    ],
  },
  {
    groupKey: 'group_ai_setup',
    items: [
      {
        href: '/dashboard/automation/',
        labelKey: 'nav_automation',
        icon: SlidersHorizontal,
        exact: false,
      },
      {
        href: '/dashboard/objections/',
        labelKey: 'nav_objections',
        icon: MessageSquareWarning,
        exact: false,
      },
      { href: '/dashboard/knowledge/', labelKey: 'nav_knowledge', icon: BookOpen, exact: false },
    ],
  },
] as const;

/** Pages reached from elsewhere than the sidebar, still named in the breadcrumb. */
export const DASHBOARD_HIDDEN_PAGES = [
  { href: '/dashboard/usage/', labelKey: 'nav_usage' },
  { href: '/dashboard/organizations/', labelKey: 'nav_organizations' },
] as const;

/**
 * Normalizes a path for comparison, since hrefs in this app carry a trailing slash.
 * @param path The path to normalize.
 * @returns The path without any trailing slash, or the root path.
 */
export const stripTrailingSlash = (path: string) => path.replace(/\/+$/u, '') || '/';

/**
 * Tells whether a nav entry is the current page or one of its children.
 * @param options The current path and the entry to test.
 * @param options.current The current path, without trailing slash.
 * @param options.href The entry's href.
 * @param options.exact Whether only the entry itself counts, not its children.
 * @returns True when the entry should show as active.
 */
export const isNavActive = (options: { current: string; href: string; exact: boolean }) => {
  const target = stripTrailingSlash(options.href);

  return options.exact
    ? options.current === target
    : options.current === target || options.current.startsWith(`${target}/`);
};
