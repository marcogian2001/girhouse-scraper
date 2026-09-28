'use client';

// The suggestions follow the WAI-ARIA listbox pattern: no native element offers inline mentions
// oxlint-disable jsx-a11y/prefer-tag-over-role

import { cn } from 'cn';
import { useTranslations } from 'next-intl';
import { Fragment, useRef, useState } from 'react';
import { FieldDescription } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import {
  findActiveMention,
  insertMention,
  removeMentionAt,
  splitMentions,
} from '@/utils/KnowledgeMentions';

/** Matches the `w-64` on the menu, so it can be kept inside the field. */
const MENU_WIDTH_PX = 256;

// Everything that decides where a line of text wraps and how tall it is
const MIRRORED_STYLES = [
  'boxSizing',
  'width',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'fontFamily',
  'fontSize',
  'fontStyle',
  'fontWeight',
  'letterSpacing',
  'lineHeight',
  'textTransform',
  'tabSize',
] as const;

type Mention = { start: number; query: string; top: number; left: number };

/**
 * Measures where a character sits inside a textarea, by laying the text out
 * again in a hidden copy of the field.
 * @param textarea The field to measure.
 * @param position The character offset to locate.
 * @returns The offset from the field's top-left corner of the line below the character.
 */
const measureBelowCharacter = (textarea: HTMLTextAreaElement, position: number) => {
  const computed = window.getComputedStyle(textarea);
  const mirror = document.createElement('div');

  for (const property of MIRRORED_STYLES) {
    mirror.style[property] = computed[property];
  }

  mirror.style.position = 'absolute';
  mirror.style.visibility = 'hidden';
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.overflowWrap = 'break-word';
  mirror.textContent = textarea.value.slice(0, position);

  const marker = document.createElement('span');
  // A non-empty marker, so it has a height on an empty trailing line
  marker.textContent = textarea.value.slice(position) || '.';
  mirror.append(marker);
  document.body.append(mirror);

  // A computed line height is in pixels, or `normal` when none is set
  const lineHeight = Number(computed.lineHeight.replace('px', '')) || marker.offsetHeight;
  // Offsets start inside the border, while the menu is placed from the field's outer edge
  const top = marker.offsetTop + textarea.clientTop - textarea.scrollTop + lineHeight;
  const left = marker.offsetLeft + textarea.clientLeft - textarea.scrollLeft;

  mirror.remove();

  return {
    top,
    left: Math.max(0, Math.min(left, textarea.clientWidth - MENU_WIDTH_PX)),
  };
};

// Typing `@` lists the knowledge documents; picking one inserts `@[name]`,
// which guarantees the document reaches the model
export const KnowledgeMentionTextarea = (props: {
  id: string;
  value: string;
  onValueChange: (value: string) => void;
  documents: { id: string; name: string }[];
  rows?: number;
  className?: string;
}) => {
  const t = useTranslations('KnowledgeMentionTextarea');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const [mention, setMention] = useState<Mention | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const listId = `${props.id}-mentions`;

  // Only mentions of an existing document become chips; the rest stays plain text
  const documentNames = new Set(props.documents.map((document) => document.name));

  const matches = mention
    ? props.documents.filter((document) =>
        document.name.toLowerCase().includes(mention.query.toLowerCase()),
      )
    : [];

  const isOpen = mention !== null && props.documents.length > 0;

  const updateMention = (textarea: HTMLTextAreaElement) => {
    const next = findActiveMention({ text: textarea.value, caret: textarea.selectionStart });

    if (next?.query !== mention?.query || next?.start !== mention?.start) {
      setActiveIndex(0);
    }

    // Anchored to the `@` rather than the caret, so the menu stays put while the name is typed
    setMention(next ? { ...next, ...measureBelowCharacter(textarea, next.start) } : null);
  };

  const applyEdit = (next: { text: string; caret: number }) => {
    const textarea = textareaRef.current;

    if (!textarea) {
      return;
    }

    // Written to the field first, so the caret is placed before the next keystroke
    // lands; React then renders the same value and leaves the caret alone
    textarea.value = next.text;
    textarea.setSelectionRange(next.caret, next.caret);
    props.onValueChange(next.text);
    setMention(null);
  };

  const select = (name: string) => {
    const textarea = textareaRef.current;

    if (!mention || !textarea) {
      return;
    }

    applyEdit(
      insertMention({
        text: props.value,
        start: mention.start,
        caret: textarea.selectionStart,
        name,
      }),
    );
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const textarea = event.currentTarget;

    if (
      (event.key === 'Backspace' || event.key === 'Delete') &&
      textarea.selectionStart === textarea.selectionEnd
    ) {
      const removed = removeMentionAt({
        text: props.value,
        caret: textarea.selectionStart,
        key: event.key,
      });

      // A chip goes in one keystroke, like a single character
      if (removed && documentNames.has(removed.name)) {
        event.preventDefault();
        applyEdit(removed);

        return;
      }
    }

    if (!isOpen) {
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      setMention(null);

      return;
    }

    if (matches.length === 0) {
      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex((index) => (index + step + matches.length) % matches.length);

      return;
    }

    const active = matches[activeIndex];

    if ((event.key === 'Enter' || event.key === 'Tab') && active) {
      // Picks the document instead of adding a new line or leaving the field
      event.preventDefault();
      select(active.name);
    }
  };

  return (
    <div className="space-y-2">
      <div className="relative">
        {/* Draws the text behind the transparent field, with mentions as chips. Same box,
            font and wrapping as the field, and chips add no width, so every glyph lines up */}
        <div
          ref={backdropRef}
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-hidden rounded-lg border border-transparent px-2.5 py-2 text-base wrap-break-word whitespace-pre-wrap md:text-sm dark:bg-input/30"
        >
          {splitMentions(props.value).map((segment) =>
            segment.type === 'mention' && documentNames.has(segment.name) ? (
              <span
                key={segment.start}
                className="rounded-sm bg-primary/15 text-primary ring-1 ring-primary/30"
              >
                @<span className="text-transparent">[</span>
                {segment.name}
                <span className="text-transparent">]</span>
              </span>
            ) : (
              <Fragment key={segment.start}>
                {segment.type === 'text' ? segment.value : segment.raw}
              </Fragment>
            ),
          )}
          {/* Keeps a trailing new line from collapsing */}​
        </div>

        <Textarea
          ref={textareaRef}
          id={props.id}
          rows={props.rows}
          className={cn(
            'relative text-transparent caret-foreground selection:bg-primary/25 dark:bg-transparent',
            props.className,
          )}
          aria-autocomplete="list"
          aria-controls={isOpen ? listId : undefined}
          aria-activedescendant={
            isOpen && matches.length > 0 ? `${listId}-${activeIndex}` : undefined
          }
          value={props.value}
          onChange={(event) => {
            props.onValueChange(event.target.value);
            updateMention(event.target);
          }}
          onSelect={(event) => {
            updateMention(event.currentTarget);
          }}
          onKeyDown={handleKeyDown}
          onScroll={(event) => {
            if (backdropRef.current) {
              backdropRef.current.scrollTop = event.currentTarget.scrollTop;
            }

            if (mention) {
              updateMention(event.currentTarget);
            }
          }}
          onBlur={() => {
            setMention(null);
          }}
        />

        {isOpen && (
          <div
            className="absolute z-50 mt-1 w-64 max-w-full rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10"
            style={{ top: mention.top, left: mention.left }}
          >
            {matches.length === 0 ? (
              <p className="px-1.5 py-1 text-sm text-muted-foreground">{t('no_results')}</p>
            ) : (
              <div id={listId} role="listbox">
                {matches.map((document, index) => (
                  <div
                    key={document.id}
                    id={`${listId}-${index}`}
                    role="option"
                    aria-selected={index === activeIndex}
                    tabIndex={-1}
                    className={cn(
                      'cursor-pointer truncate rounded-md px-1.5 py-1 text-sm',
                      index === activeIndex && 'bg-accent text-accent-foreground',
                    )}
                    // `mousedown` fires before the textarea blurs and closes the list
                    onMouseDown={(event) => {
                      event.preventDefault();
                      select(document.name);
                    }}
                    onMouseEnter={() => {
                      setActiveIndex(index);
                    }}
                  >
                    {document.name}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {props.documents.length > 0 && <FieldDescription>{t('hint')}</FieldDescription>}
    </div>
  );
};
