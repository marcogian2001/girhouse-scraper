'use client';

import { XIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { MAX_SEARCH_TERM_LENGTH, MAX_SEARCH_TERMS } from '@/validations/LeadSearchValidation';

// A term only becomes part of the value once Enter confirms it, as a chip
export const SearchTermsInput = (props: {
  id: string;
  value: string[];
  onValueChange: (value: string[]) => void;
  placeholder?: string;
  invalid?: boolean;
}) => {
  const t = useTranslations('SearchTermsInput');
  const [draft, setDraft] = useState('');
  const isFull = props.value.length >= MAX_SEARCH_TERMS;

  const addDraft = () => {
    const term = draft.trim();

    if (!term || isFull) {
      return;
    }

    const isDuplicate = props.value.some((value) => value.toLowerCase() === term.toLowerCase());

    if (!isDuplicate) {
      props.onValueChange([...props.value, term]);
    }

    setDraft('');
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    // Enter while an IME is composing confirms the character, not the term
    if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
      // Adds the term instead of submitting the form
      event.preventDefault();
      addDraft();

      return;
    }

    if (event.key === 'Backspace' && !draft && props.value.length > 0) {
      props.onValueChange(props.value.slice(0, -1));
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Input
        id={props.id}
        autoComplete="off"
        enterKeyHint="enter"
        maxLength={MAX_SEARCH_TERM_LENGTH}
        disabled={isFull}
        aria-invalid={props.invalid}
        placeholder={isFull ? t('placeholder_full') : props.placeholder}
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
        }}
        onKeyDown={handleKeyDown}
      />

      {props.value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {props.value.map((term) => (
            <li key={term}>
              <Badge variant="secondary" className="h-6 pr-1 text-sm">
                {term}
                <button
                  type="button"
                  aria-label={t('remove', { term })}
                  className="rounded-full p-0.5 hover:bg-foreground/10"
                  onClick={() => {
                    props.onValueChange(props.value.filter((value) => value !== term));
                  }}
                >
                  <XIcon className="size-3" />
                </button>
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
