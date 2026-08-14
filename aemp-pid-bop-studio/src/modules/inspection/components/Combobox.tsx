// ============================================================================
//  Searchable combobox matching the reference system's control: a
//  role="combobox" trigger that opens a popover containing a `Search…` box and
//  a role="option" list with a check against the current selection.
// ============================================================================
import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';

export interface ComboOption { value: string; label: string }

interface Props {
  value: string;
  onChange: (value: string) => void;
  options: ComboOption[];
  /** Trigger text when nothing is selected, e.g. `Select unit…`. */
  placeholder: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  id?: string;
  /** Fills its grid cell; set false for toolbar-width triggers. */
  block?: boolean;
}

export default function Combobox({
  value, onChange, options, placeholder,
  searchPlaceholder = 'Search…', disabled, id, block = true,
}: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) { setQ(''); return undefined; }
    searchRef.current?.focus();
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const selected = options.find((o) => o.value === value);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((o) => o.label.toLowerCase().includes(needle));
  }, [options, q]);

  return (
    <div className={`insp-combo${block ? ' block' : ''}`} ref={wrapRef}>
      <button
        type="button" id={id} role="combobox" aria-expanded={open} aria-haspopup="dialog"
        className="insp-combo-trigger" disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={selected ? '' : 'ph'}>{selected?.label ?? placeholder}</span>
        <ChevronsUpDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <div className="insp-combo-pop" role="dialog" aria-label={placeholder}>
          <input
            ref={searchRef} className="insp-input" type="search" value={q}
            placeholder={searchPlaceholder} aria-label={searchPlaceholder}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="list" role="listbox">
            {shown.length === 0 && <div className="none">No results.</div>}
            {shown.map((o) => (
              <button
                key={o.value} type="button" role="option" aria-selected={o.value === value}
                onClick={() => { onChange(o.value); setOpen(false); }}
              >
                <span className="tick">
                  {o.value === value && <Check size={13} aria-hidden="true" />}
                </span>
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
