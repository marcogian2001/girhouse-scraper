import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';

/**
 * A text field with a leading search glyph, sized for a toolbar.
 * @param props The native input props; `placeholder` doubles as the accessible name.
 * @returns The search field.
 */
export const SearchInput = (props: Omit<React.ComponentProps<typeof Input>, 'type'>) => (
  <div className="relative w-full sm:max-w-xs">
    <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
    <Input type="search" aria-label={props.placeholder} {...props} className="pl-9" />
  </div>
);
