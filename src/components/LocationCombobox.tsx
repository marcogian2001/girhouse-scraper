'use client';

// The WAI-ARIA combobox pattern needs these roles: no native element suggests remote results
// oxlint-disable jsx-a11y/prefer-tag-over-role

import { cn } from 'cn';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import type { PlaceSuggestion } from '@/services/GooglePlaces';

const DEBOUNCE_MS = 250;

const MIN_INPUT_LENGTH = 2;

type Status = 'idle' | 'loading' | 'ready' | 'error';

// Only an area picked from the Google Maps suggestions becomes the value: typing clears it
export const LocationCombobox = (props: {
  id: string;
  value: string;
  onValueChange: (value: PlaceSuggestion | null) => void;
  placeholder?: string;
  invalid?: boolean;
}) => {
  const t = useTranslations('LocationCombobox');
  const [query, setQuery] = useState(props.value);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [status, setStatus] = useState<Status>('idle');
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const debounce = useRef(0);
  const latestRequest = useRef(0);
  const listId = `${props.id}-suggestions`;

  const search = async (input: string) => {
    latestRequest.current += 1;
    const request = latestRequest.current;

    const response = await fetch(`/api/places/autocomplete?${new URLSearchParams({ input })}`);
    const body: { suggestions: PlaceSuggestion[] } | null = response.ok
      ? await response.json()
      : null;

    // A slower, older request must not replace the suggestions for what is typed now
    if (request !== latestRequest.current) {
      return;
    }

    if (!body) {
      setStatus('error');

      return;
    }

    setSuggestions(body.suggestions);
    setActiveIndex(body.suggestions.length > 0 ? 0 : -1);
    setStatus('ready');
  };

  const handleChange = (value: string) => {
    setQuery(value);
    window.clearTimeout(debounce.current);

    if (props.value) {
      props.onValueChange(null);
    }

    if (value.trim().length < MIN_INPUT_LENGTH) {
      latestRequest.current += 1;
      setSuggestions([]);
      setStatus('idle');
      setIsOpen(false);

      return;
    }

    setStatus('loading');
    setIsOpen(true);
    debounce.current = window.setTimeout(async () => {
      await search(value.trim());
    }, DEBOUNCE_MS);
  };

  const select = (suggestion: PlaceSuggestion) => {
    setQuery(suggestion.label);
    setIsOpen(false);
    props.onValueChange(suggestion);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();

      if (suggestions.length === 0) {
        return;
      }

      const step = event.key === 'ArrowDown' ? 1 : -1;

      setIsOpen(true);
      setActiveIndex((index) => (index + step + suggestions.length) % suggestions.length);

      return;
    }

    const active = suggestions[activeIndex];

    if (event.key === 'Enter' && isOpen && active) {
      // Picks the suggestion instead of submitting the form
      event.preventDefault();
      select(active);

      return;
    }

    if (event.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const getMessage = () => {
    if (status === 'error') {
      return t('error_suggestions');
    }

    if (suggestions.length > 0) {
      return null;
    }

    return status === 'loading' ? t('searching') : t('no_results');
  };

  const message = getMessage();

  return (
    <div className="relative">
      <Input
        id={props.id}
        role="combobox"
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listId : undefined}
        aria-activedescendant={isOpen && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
        aria-invalid={props.invalid}
        placeholder={props.placeholder}
        value={query}
        onChange={(event) => {
          handleChange(event.target.value);
        }}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          setIsOpen(!props.value && suggestions.length > 0);
        }}
        onBlur={() => {
          setIsOpen(false);
        }}
      />

      {isOpen && (
        <div className="absolute top-full z-50 mt-1 w-full rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10">
          {message ? (
            <p className="px-1.5 py-1 text-sm text-muted-foreground">{message}</p>
          ) : (
            <div id={listId} role="listbox">
              {suggestions.map((suggestion, index) => (
                <div
                  key={suggestion.placeId}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  tabIndex={-1}
                  className={cn(
                    'cursor-pointer rounded-md px-1.5 py-1 text-sm',
                    index === activeIndex && 'bg-accent text-accent-foreground',
                  )}
                  // `mousedown` fires before the input blurs and closes the list
                  onMouseDown={(event) => {
                    event.preventDefault();
                    select(suggestion);
                  }}
                  onMouseEnter={() => {
                    setActiveIndex(index);
                  }}
                >
                  {suggestion.label}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
