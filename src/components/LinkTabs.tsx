'use client';

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Link } from '@/libs/I18nNavigation';

/**
 * Tabs that switch views through links, so the active view lives in the URL.
 * A client component on purpose: `TabsTrigger asChild` must slot onto a real element, and a
 * `Link` rendered by a server page reaches the client as a lazy reference that it rejects,
 * crashing the page on client-side navigation.
 * @param props Component props.
 * @param props.value The value of the tab to show as active.
 * @param props.tabs Each tab's value, target and label.
 * @returns The tab list.
 */
export const LinkTabs = (props: {
  value: string;
  tabs: { value: string; href: string; label: string }[];
}) => (
  <Tabs value={props.value}>
    <TabsList>
      {props.tabs.map((tab) => (
        <TabsTrigger key={tab.value} value={tab.value} asChild>
          <Link href={tab.href}>{tab.label}</Link>
        </TabsTrigger>
      ))}
    </TabsList>
  </Tabs>
);
