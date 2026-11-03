'use client';

import {
  AE,
  AL,
  AR,
  AT,
  AU,
  BE,
  BG,
  BR,
  CA,
  CH,
  CZ,
  DE,
  DK,
  EG,
  ES,
  FI,
  FR,
  GB,
  GR,
  HR,
  HU,
  IE,
  IT,
  LU,
  MA,
  MC,
  MT,
  NL,
  NO,
  PL,
  PT,
  RO,
  RS,
  SE,
  SI,
  SK,
  SM,
  TN,
  TR,
  UA,
  US,
  VA,
} from 'country-flag-icons/react/3x2';
import { ChevronDown, Search } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import type { PhonePrefix } from './PhonePrefix';
import { PHONE_PREFIXES, searchPrefixes } from './PhonePrefix';

/** Each country's flag, drawn as SVG so it looks the same on every device. */
const FLAGS = {
  AE,
  AL,
  AR,
  AT,
  AU,
  BE,
  BG,
  BR,
  CA,
  CH,
  CZ,
  DE,
  DK,
  EG,
  ES,
  FI,
  FR,
  GB,
  GR,
  HR,
  HU,
  IE,
  IT,
  LU,
  MA,
  MC,
  MT,
  NL,
  NO,
  PL,
  PT,
  RO,
  RS,
  SE,
  SI,
  SK,
  SM,
  TN,
  TR,
  UA,
  US,
  VA,
} satisfies Record<PhonePrefix['country'], unknown>;

/**
 * A country's flag.
 * @param props Component props.
 * @param props.country The country code.
 * @returns The flag.
 */
const Flag = (props: { country: PhonePrefix['country'] }) => {
  const Svg = FLAGS[props.country];

  return (
    <Svg
      aria-hidden
      className="h-3.5 w-5 shrink-0 rounded-[2px] shadow-[0_0_0_1px_rgba(0,0,0,0.08)]"
    />
  );
};

/**
 * The country code picker of the WhatsApp field: the chosen flag and prefix, opening a list
 * to search by country or by prefix.
 * @param props Component props.
 * @param props.dial The chosen prefix.
 * @param props.label The picker's name, for screen readers.
 * @param props.onChange Picks another prefix.
 * @returns The picker.
 */
export const PrefixPicker = (props: {
  dial: string;
  label: string;
  onChange: (dial: string) => void;
}) => {
  const t = useTranslations('DemoPage');
  const locale = useLocale();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const names = new Intl.DisplayNames([locale], { type: 'region' });
  const nameOf = (country: PhonePrefix['country']) => names.of(country) ?? country;
  const chosen = PHONE_PREFIXES.find((prefix) => prefix.dial === props.dial) ?? PHONE_PREFIXES[0];
  const results = searchPrefixes({ query, nameOf });

  const close = () => {
    setIsOpen(false);
    setQuery('');
  };

  return (
    <div className="relative flex border-r border-neutral-200 bg-neutral-50">
      <button
        type="button"
        aria-label={props.label}
        aria-expanded={isOpen}
        onClick={() => {
          setIsOpen(!isOpen);
        }}
        className="flex h-full items-center gap-2 px-3 text-base text-neutral-800"
      >
        <Flag country={chosen.country} />
        {chosen.dial}
        <ChevronDown className="size-4 text-neutral-400" />
      </button>

      {isOpen && (
        <>
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={close}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div className="absolute top-full left-0 z-50 mt-2 w-72 max-w-[calc(100vw-3rem)] overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-neutral-200">
            <label className="flex items-center gap-2 border-b border-neutral-100 px-3">
              <Search className="size-4 shrink-0 text-neutral-400" />
              <input
                autoFocus
                value={query}
                placeholder={t('video_prefix_search')}
                onChange={(event) => {
                  setQuery(event.target.value);
                }}
                className="h-11 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-neutral-400"
              />
            </label>
            <ul aria-label={props.label} className="max-h-64 overflow-y-auto py-1">
              {results.map((prefix) => (
                <li key={prefix.country}>
                  <button
                    type="button"
                    aria-pressed={prefix.country === chosen.country}
                    onClick={() => {
                      props.onChange(prefix.dial);
                      close();
                    }}
                    className={`flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-neutral-50 ${prefix.country === chosen.country ? 'font-semibold text-(--demo-primary)' : 'text-neutral-800'}`}
                  >
                    <Flag country={prefix.country} />
                    <span className="min-w-0 flex-1 truncate">{nameOf(prefix.country)}</span>
                    <span className="text-neutral-500 tabular-nums">{prefix.dial}</span>
                  </button>
                </li>
              ))}
              {results.length === 0 && (
                <li className="px-3 py-4 text-center text-sm text-neutral-500">
                  {t('video_prefix_empty')}
                </li>
              )}
            </ul>
          </div>
        </>
      )}
    </div>
  );
};
