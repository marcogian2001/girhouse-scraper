import { NextIntlClientProvider } from 'next-intl';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-react';
import { page, userEvent } from 'vitest/browser';
import { KnowledgeMentionTextarea } from '@/components/KnowledgeMentionTextarea';
import messages from '@/locales/en.json';
// The menu is placed with Tailwind classes, so the positions need the real styles
import '@/styles/global.css';

const DOCUMENTS = [
  { id: 'document-1', name: 'Price list.pdf' },
  { id: 'document-2', name: 'Case study.md' },
];

/**
 * Holds the value the way a form does, so typing updates the field.
 * @returns The labelled field.
 */
const Harness = () => {
  const [value, setValue] = useState('');

  return (
    <div className="w-120">
      <label htmlFor="content">Content</label>
      <KnowledgeMentionTextarea
        id="content"
        rows={6}
        documents={DOCUMENTS}
        value={value}
        onValueChange={setValue}
      />
    </div>
  );
};

/**
 * Mounts the field with the translations it needs.
 * @returns The rendered result.
 */
const renderField = async () =>
  await render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <Harness />
    </NextIntlClientProvider>,
  );

const getField = () => page.getByRole('textbox', { name: 'Content' });

/**
 * Reads where the open menu sits inside the field.
 * @returns The menu's offset from the field's top-left corner.
 */
const getMenuOffset = () => {
  const menu = page.getByRole('listbox').element().parentElement;

  return { top: menu?.offsetTop ?? 0, left: menu?.offsetLeft ?? 0 };
};

describe('Knowledge mention textarea', () => {
  describe('Menu position', () => {
    it('opens the menu below the line being typed', async () => {
      await renderField();
      await userEvent.type(getField(), '@');
      const firstLine = getMenuOffset();

      await userEvent.clear(getField());
      await userEvent.type(getField(), 'one{Enter}two{Enter}three @');
      const fourthLine = getMenuOffset();

      expect(fourthLine.top).toBeGreaterThan(firstLine.top);
      expect(fourthLine.left).toBeGreaterThan(firstLine.left);
    });

    it('keeps the menu still while the name is typed', async () => {
      await renderField();
      await userEvent.type(getField(), 'Read @');
      const atSign = getMenuOffset();

      await userEvent.type(getField(), 'Pri');

      expect(getMenuOffset()).toStrictEqual(atSign);
    });
  });

  describe('Picking', () => {
    it('filters the documents by what follows the @', async () => {
      await renderField();
      await userEvent.type(getField(), '@case');

      await expect.element(page.getByRole('option', { name: 'Case study.md' })).toBeVisible();
      expect(page.getByRole('option').elements()).toHaveLength(1);
    });

    it('inserts the picked document as a mention', async () => {
      await renderField();
      await userEvent.type(getField(), 'Read @pri{Enter}');

      await expect.element(getField()).toHaveValue('Read @[Price list.pdf] ');
      expect(page.getByRole('listbox').elements()).toHaveLength(0);
    });

    it('keeps text typed right after a pick in place', async () => {
      await renderField();
      await userEvent.type(getField(), 'Quote @pri{Enter}for prices.{Enter}Cite @cas{Enter}too');

      await expect
        .element(getField())
        .toHaveValue('Quote @[Price list.pdf] for prices.\nCite @[Case study.md] too');
    });
  });

  describe('Chips', () => {
    it('draws a picked document as a chip with its name', async () => {
      await renderField();
      await userEvent.type(getField(), 'Read @pri{Enter}');

      const chip = document.querySelector('[aria-hidden] span');

      expect(chip?.textContent).toBe('@[Price list.pdf]');
      expect(chip?.className).toContain('rounded-sm');
    });

    it('leaves a mention of an unknown document as plain text', async () => {
      await renderField();
      await userEvent.type(getField(), 'Read @[[Old file.pdf]');

      expect(document.querySelector('[aria-hidden] span')).toBeNull();
    });

    it('removes the whole chip with one Backspace', async () => {
      await renderField();
      await userEvent.type(getField(), 'Read @pri{Enter}');
      await userEvent.keyboard('{Backspace}{Backspace}');

      await expect.element(getField()).toHaveValue('Read ');
    });
  });
});
