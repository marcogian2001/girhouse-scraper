import { setRequestLocale } from 'next-intl/server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/libs/Auth';
import { getI18nPath } from '@/utils/Helpers';

export default async function HomePage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);

  // The app has no public landing page: signed-in visitors go straight to work
  const session = await auth.api.getSession({ headers: await headers() });

  redirect(getI18nPath(session ? '/dashboard' : '/sign-in', locale));
}
