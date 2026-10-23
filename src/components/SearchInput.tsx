import { Search, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';

/**
 * A text field with a leading search glyph and its own clear button, sized for a toolbar.
 * The browser's native clear control is hidden so every browser shows the same one.
 * @param props Component props.
 * @param props.value The current text.
 * @param props.onChange Receives the text as it is typed.
 * @param props.onClear Empties the search; the button shows only while there is text.
 * @param props.placeholder The field hint, also its accessible name.
 * @returns The search field.
 */
export const SearchInput = (props: {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
  placeholder: string;
}) => {
  const t = useTranslations('SearchInput');

  return (
    <div className="relative w-full sm:max-w-xs">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        value={props.value}
        onChange={(event) => {
          props.onChange(event.target.value);
        }}
        placeholder={props.placeholder}
        aria-label={props.placeholder}
        className="pr-9 pl-9 [&::-webkit-search-cancel-button]:appearance-none"
      />
      {props.value !== '' && (
        <button
          type="button"
          aria-label={t('label_clear')}
          onClick={props.onClear}
          className="absolute top-1/2 right-2 flex size-5 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
};
