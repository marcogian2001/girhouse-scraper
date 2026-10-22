'use client';

import { CalendarIcon } from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { enUS, it } from 'react-day-picker/locale';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/u;

/**
 * Reads a `YYYY-MM-DD` value as its year, month and day.
 * @param value The value.
 * @returns The parts, month from 0, or null when the value is not a day.
 */
const toParts = (value: string) => {
  const match = DAY_PATTERN.exec(value);

  return match
    ? { year: Number(match[1]), month: Number(match[2]) - 1, day: Number(match[3]) }
    : null;
};

/**
 * Writes a day picked in the calendar as `YYYY-MM-DD`.
 * @param date The day, at local midnight.
 * @returns The value.
 */
const toValue = (date: Date) =>
  [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');

/**
 * Tells whether a calendar day is before today.
 * @param date The day, at local midnight.
 * @returns True for a past day.
 */
const isPastDay = (date: Date) => toValue(date) < toValue(new Date());

/**
 * Turns a day into the instant its label is written from: noon UTC, so no time zone shifts it.
 * @param parts The day.
 * @param parts.year The year.
 * @param parts.month The month, from 0.
 * @param parts.day The day of the month.
 * @returns The instant.
 */
const toLabelInstant = (parts: { year: number; month: number; day: number }) =>
  new Date(Date.UTC(parts.year, parts.month, parts.day, 12));

/**
 * A shadcn date picker holding a `YYYY-MM-DD` value. Controlled through `value`, or
 * uncontrolled with `defaultValue`; with `name` it also submits the value with its form.
 * @param props Component props.
 * @returns The picker.
 */
export const DatePicker = (props: {
  id: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  disablePast?: boolean;
}) => {
  const t = useTranslations('DatePicker');
  const format = useFormatter();
  const locale = useLocale();
  const [isOpen, setIsOpen] = useState(false);
  const [innerValue, setInnerValue] = useState(props.defaultValue ?? '');
  const value = props.value ?? innerValue;
  const parts = toParts(value);
  // The calendar works in local days
  const selected = parts ? new Date(parts.year, parts.month, parts.day) : undefined;
  const label = parts
    ? format.dateTime(toLabelInstant(parts), {
        dateStyle: 'medium',
        timeZone: 'UTC',
      })
    : null;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          id={props.id}
          type="button"
          variant="outline"
          className="w-full justify-start font-normal sm:w-44"
        >
          <CalendarIcon />
          {label ?? <span className="text-muted-foreground">{t('placeholder')}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          locale={locale === 'it' ? it : enUS}
          selected={selected}
          defaultMonth={selected}
          disabled={props.disablePast ? isPastDay : undefined}
          onSelect={(date) => {
            const next = date ? toValue(date) : '';

            setInnerValue(next);
            props.onValueChange?.(next);
            setIsOpen(false);
          }}
        />
      </PopoverContent>
      {props.name && <input type="hidden" name={props.name} value={value} />}
    </Popover>
  );
};
