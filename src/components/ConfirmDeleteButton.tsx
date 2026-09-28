'use client';

import { Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

export const ConfirmDeleteButton = (props: {
  label: string;
  title: string;
  description: string;
  onConfirm: () => Promise<void>;
}) => {
  const t = useTranslations('ConfirmDeleteButton');
  const [isOpen, setIsOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  return (
    <AlertDialog
      open={isOpen}
      onOpenChange={(open) => {
        // Escape or an outside click must not close the dialog mid-deletion
        if (!isDeleting) {
          setIsOpen(open);
        }
      }}
    >
      <AlertDialogTrigger asChild>
        <Button type="button" variant="outline">
          <Trash2 />
          {props.label}
        </Button>
      </AlertDialogTrigger>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{props.title}</AlertDialogTitle>
          <AlertDialogDescription>{props.description}</AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>{t('button_cancel')}</AlertDialogCancel>

          <AlertDialogAction
            variant="destructive"
            disabled={isDeleting}
            onClick={async (event) => {
              // Keeps the dialog open while the deletion runs
              event.preventDefault();
              setIsDeleting(true);
              await props.onConfirm();
              setIsDeleting(false);
              setIsOpen(false);
            }}
          >
            {isDeleting ? <Spinner /> : <Trash2 />}
            {props.label}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
