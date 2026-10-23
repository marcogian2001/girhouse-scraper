'use client';

import { ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  DASHBOARD_HIDDEN_PAGES,
  DASHBOARD_NAV,
  isNavActive,
  stripTrailingSlash,
} from '@/components/DashboardNav';
import { Link, usePathname } from '@/libs/I18nNavigation';

/** Sub-routes with a fixed name; anything else under a page is a record's detail view. */
const CHILD_CRUMB_KEYS: Record<string, 'crumb_new' | 'crumb_import'> = {
  new: 'crumb_new',
  import: 'crumb_import',
};

/**
 * Names the current dashboard page as "Group › Page › Sub-page" in the top bar.
 * The page crumb links back to its list whenever a nested route is open.
 * @returns The breadcrumb trail, or nothing outside known dashboard sections.
 */
export const DashboardBreadcrumb = () => {
  const t = useTranslations('AppSidebar');
  const current = stripTrailingSlash(usePathname());

  const pages = [
    ...DASHBOARD_NAV.flatMap((section) =>
      section.items.map((item) => ({ ...item, groupKey: section.groupKey })),
    ),
    ...DASHBOARD_HIDDEN_PAGES.map((page) => ({ ...page, exact: false, groupKey: null })),
  ];
  const page = pages.find((item) => isNavActive({ current, href: item.href, exact: item.exact }));

  if (!page) {
    return null;
  }

  const rest = current.slice(stripTrailingSlash(page.href).length).split('/').filter(Boolean);
  const childKey = CHILD_CRUMB_KEYS[rest[0] ?? ''] ?? 'crumb_detail';

  return (
    <nav aria-label={t('label_breadcrumb')} className="min-w-0">
      <ol className="flex items-center gap-1.5 text-sm text-muted-foreground">
        {page.groupKey && (
          <li className="hidden items-center gap-1.5 sm:flex">
            {t(page.groupKey)}
            <ChevronRight className="size-3.5" />
          </li>
        )}

        <li className="truncate">
          {rest.length > 0 ? (
            <Link href={page.href} className="transition-colors hover:text-foreground">
              {t(page.labelKey)}
            </Link>
          ) : (
            <span aria-current="page" className="font-medium text-foreground">
              {t(page.labelKey)}
            </span>
          )}
        </li>

        {rest.length > 0 && (
          <li aria-current="page" className="flex items-center gap-1.5 font-medium text-foreground">
            <ChevronRight className="size-3.5 text-muted-foreground" />
            {t(childKey)}
          </li>
        )}
      </ol>
    </nav>
  );
};
