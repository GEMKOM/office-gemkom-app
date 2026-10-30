import {
  Checkbox,
  Menu,
  Popover,
  ScrollArea,
  Stack,
  TextInput,
  UnstyledButton,
} from '@mantine/core';
import { DatePicker } from '@mantine/dates';
import dayjs from 'dayjs';
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { FaIcon } from '../FaIcon';
import { Panel } from '../Panel';
import classes from '../ui.module.css';
import { isDateRange, type DateRange, type FilterValue, type FilterValues } from './useUrlFilters';

export interface FilterOption {
  value: string;
  label: string;
}

interface FilterBase<K extends string> {
  key: K;
  label?: ReactNode;
  placeholder?: string;
  /** Kept for the legacy colSize option; the pill row sizes itself. */
  span?: number;
}

export type FilterConfig<K extends string = string> =
  | (FilterBase<K> & { type: 'text'; inputType?: 'text' | 'number' | 'email' | 'search' })
  | (FilterBase<K> & { type: 'select'; options: FilterOption[]; searchable?: boolean })
  | (FilterBase<K> & { type: 'multiselect'; options: FilterOption[]; searchable?: boolean })
  | (FilterBase<K> & { type: 'date' })
  | (FilterBase<K> & { type: 'dateRange' })
  | (FilterBase<K> & { type: 'checkbox' });

export interface FilterBarProps<T extends FilterValues> {
  filters: FilterConfig<Extract<keyof T, string>>[];
  /** The applied values; the fields start from these and follow them when they change. */
  values: T;
  /** Called when a pill changes, on Enter in the search box, or 400ms after typing stops. */
  onApply: (values: T) => void;
  /** Temizle. Without it, Temizle applies emptied values. */
  onClear?: () => void;
  /** Heading of the panel when not inline. Default 'Filtreler'; null hides it. */
  title?: ReactNode;
  clearLabel?: ReactNode;
  /** Just the row, for a DataTable header (DataTable's `filters` slot). */
  inline?: boolean;
  /** Extra controls after the pills. */
  extra?: ReactNode;
}

const SEARCH_DELAY_MS = 400;

function emptyLike(value: FilterValue): FilterValue {
  if (isDateRange(value)) return { start: '', end: '' };
  if (Array.isArray(value)) return [];
  if (typeof value === 'boolean') return false;
  return '';
}

function isSet(value: FilterValue | undefined): boolean {
  if (value === undefined) return false;
  if (isDateRange(value)) return Boolean(value.start || value.end);
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'boolean') return value;
  return value !== '';
}

function asString(value: FilterValue | undefined): string {
  return typeof value === 'string' ? value : '';
}

const day = (value: string) => dayjs(value).format('DD.MM.YYYY');

function describe(filter: FilterConfig, value: FilterValue | undefined): ReactNode {
  switch (filter.type) {
    case 'select':
      return filter.options.find((o) => o.value === value)?.label ?? asString(value);
    case 'multiselect': {
      const picked = Array.isArray(value) ? value : [];
      const first = filter.options.find((o) => o.value === picked[0])?.label ?? picked[0];
      return picked.length > 1 ? `${first} +${picked.length - 1}` : first;
    }
    case 'date':
      return day(asString(value));
    case 'dateRange': {
      const range = isDateRange(value) ? value : { start: '', end: '' };
      return range.end && range.end !== range.start ? `${day(range.start)} – ${day(range.end)}` : day(range.start);
    }
    default:
      return asString(value);
  }
}

interface PillProps {
  label: ReactNode;
  set: boolean;
  summary?: ReactNode;
  onClear?: () => void;
  chevron?: boolean;
}

/** The pill face; spread onto a button that a Menu/Popover target clones. */
function PillFace({ label, set, summary, onClear, chevron = true }: PillProps) {
  return (
    <>
      <span>
        {label}
        {set && summary ? <>: {summary}</> : null}
      </span>
      {set && onClear ? (
        <span
          role="button"
          tabIndex={-1}
          aria-label="Filtreyi kaldır"
          className={classes.pillClear}
          onClick={(event) => {
            event.stopPropagation();
            onClear();
          }}
        >
          <i className="fas fa-times" aria-hidden />
        </span>
      ) : chevron ? (
        <i className={`fas fa-chevron-down ${classes.pillChevron}`} aria-hidden />
      ) : null}
    </>
  );
}

/**
 * Replaces components/filters/filters.js: a search box and one pill per
 * filter. Pills apply at once; the search applies on Enter or after a pause.
 * Pair it with useUrlFilters for URL-backed values.
 */
export function FilterBar<T extends FilterValues>({
  filters,
  values,
  onApply,
  onClear,
  title = 'Filtreler',
  clearLabel = 'Temizle',
  inline = false,
  extra,
}: FilterBarProps<T>) {
  const [draft, setDraft] = useState<T>(values);
  // Follow the applied values (URL back/forward, reset) without an effect.
  const valuesKey = JSON.stringify(values);
  const [syncedKey, setSyncedKey] = useState(valuesKey);
  if (syncedKey !== valuesKey) {
    setSyncedKey(valuesKey);
    setDraft(values);
  }

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelPending = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => cancelPending, []);

  const applyNow = (next: T) => {
    cancelPending();
    setDraft(next);
    onApply(next);
  };

  const setAndApply = (key: string, value: FilterValue) => applyNow({ ...draft, [key]: value });

  const typeSearch = (key: string, text: string) => {
    const next = { ...draft, [key]: text };
    setDraft(next);
    cancelPending();
    timer.current = setTimeout(() => {
      timer.current = null;
      onApply(next);
    }, SEARCH_DELAY_MS);
  };

  const onEnter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      applyNow(draft);
    }
  };

  const clear = () => {
    cancelPending();
    const emptied = Object.fromEntries(
      Object.entries(draft).map(([key, value]) => [key, emptyLike(value)]),
    ) as T;
    setDraft(emptied);
    if (onClear) onClear();
    else onApply(emptied);
  };

  const searchFilter = filters.find((f) => f.type === 'text');
  const anySet = filters.some((f) => isSet(draft[f.key]));

  const renderPill = (filter: FilterConfig<Extract<keyof T, string>>) => {
    const value = draft[filter.key];
    const set = isSet(value);
    const label = filter.label ?? filter.key;
    const clearOne = () => setAndApply(filter.key, emptyLike(value ?? ''));

    switch (filter.type) {
      case 'checkbox':
        return (
          <UnstyledButton
            key={filter.key}
            className={classes.pill}
            data-set={set || undefined}
            role="checkbox"
            aria-checked={set}
            aria-label={typeof label === 'string' ? label : undefined}
            onClick={() => setAndApply(filter.key, !set)}
          >
            <i className={set ? 'fas fa-check' : 'far fa-square'} aria-hidden style={{ fontSize: 12 }} />
            {label}
          </UnstyledButton>
        );
      case 'select':
        return (
          <Menu key={filter.key} position="bottom-start" offset={6} withinPortal>
            <Menu.Target>
              <UnstyledButton className={classes.pill} data-set={set || undefined}>
                <PillFace label={label} set={set} summary={describe(filter, value)} onClear={clearOne} />
              </UnstyledButton>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item onClick={clearOne} fw={set ? undefined : 600}>
                {filter.placeholder ?? 'Tümü'}
              </Menu.Item>
              {filter.options.map((option) => (
                <Menu.Item
                  key={option.value}
                  onClick={() => setAndApply(filter.key, option.value)}
                  fw={value === option.value ? 600 : undefined}
                  rightSection={value === option.value ? <i className="fas fa-check" aria-hidden /> : null}
                >
                  {option.label}
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>
        );
      default:
        return (
          <Popover key={filter.key} position="bottom-start" offset={6} withinPortal trapFocus>
            <Popover.Target>
              <UnstyledButton className={classes.pill} data-set={set || undefined}>
                <PillFace label={label} set={set} summary={describe(filter, value)} onClear={clearOne} />
              </UnstyledButton>
            </Popover.Target>
            <Popover.Dropdown p="sm">{renderEditor(filter, value)}</Popover.Dropdown>
          </Popover>
        );
    }
  };

  const renderEditor = (filter: FilterConfig<Extract<keyof T, string>>, value: FilterValue | undefined) => {
    switch (filter.type) {
      case 'multiselect': {
        const picked = Array.isArray(value) ? value : [];
        return (
          <ScrollArea.Autosize mah={280} type="auto">
            <Checkbox.Group value={picked} onChange={(next) => setAndApply(filter.key, next)}>
              <Stack gap={8} py={4} pr="sm">
                {filter.options.map((option) => (
                  <Checkbox key={option.value} value={option.value} label={option.label} />
                ))}
              </Stack>
            </Checkbox.Group>
          </ScrollArea.Autosize>
        );
      }
      case 'date':
        return (
          <DatePicker
            value={asString(value) || null}
            onChange={(next) => setAndApply(filter.key, next ?? '')}
          />
        );
      case 'dateRange': {
        const range: DateRange = isDateRange(value) ? value : { start: '', end: '' };
        return (
          <DatePicker
            type="range"
            allowSingleDateInRange
            value={[range.start || null, range.end || null]}
            onChange={([start, end]) => {
              // Apply once the range is complete; a lone first click only marks it.
              if (start && end) setAndApply(filter.key, { start, end });
              else setDraft((prev) => ({ ...prev, [filter.key]: { start: start ?? '', end: '' } }));
            }}
          />
        );
      }
      case 'text':
        return (
          <TextInput
            autoFocus
            w={240}
            label={filter.label}
            placeholder={filter.placeholder}
            type={filter.inputType ?? 'text'}
            value={asString(value)}
            onChange={(event) => setDraft((prev) => ({ ...prev, [filter.key]: event.currentTarget.value }))}
            onKeyDown={onEnter}
          />
        );
      default:
        return null;
    }
  };

  const row = (
    <div className={classes.filters}>
      {searchFilter ? (
        <TextInput
          className={classes.search}
          aria-label={typeof searchFilter.label === 'string' ? searchFilter.label : 'Arama'}
          placeholder={searchFilter.placeholder ?? 'Ara…'}
          type={searchFilter.inputType ?? 'search'}
          leftSection={<FaIcon icon="fas fa-search" style={{ fontSize: 13 }} />}
          value={asString(draft[searchFilter.key])}
          onChange={(event) => typeSearch(searchFilter.key, event.currentTarget.value)}
          onKeyDown={onEnter}
        />
      ) : null}
      {filters.filter((f) => f !== searchFilter).map(renderPill)}
      {anySet ? (
        <UnstyledButton className={classes.clearAll} onClick={clear}>
          {clearLabel}
        </UnstyledButton>
      ) : null}
      {extra}
    </div>
  );

  if (inline) return row;
  return (
    <Panel title={title ?? undefined} icon={title ? 'fas fa-filter' : undefined}>
      {row}
    </Panel>
  );
}
