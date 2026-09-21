'use client';

import { LogOut } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { signOut } from '@/libs/AuthClient';
import { useRouter } from '@/libs/I18nNavigation';

/**
 * Sign-out entry of the account dropdown in the sidebar footer.
 * @returns A menu item that ends the session and returns to sign-in.
 */
export const SignOutButton = () => {
  const t = useTranslations('AppSidebar');
  const router = useRouter();

  return (
    <DropdownMenuItem
      onSelect={async () => {
        await signOut();
        router.push('/sign-in');
        router.refresh();
      }}
    >
      <LogOut />
      {t('sign_out')}
    </DropdownMenuItem>
  );
};
