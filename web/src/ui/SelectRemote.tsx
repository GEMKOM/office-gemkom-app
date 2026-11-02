import { Loader, MultiSelect, Select, type ComboboxItem, type OptionsFilter } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useId, useMemo, useState, type ReactNode } from 'react';

export interface RemoteOption {
  value: string;
  label: string;
}

interface SelectRemoteBase {
  /** Fetches options for a query; pass `signal` to fetch so stale searches abort. */
  search: (query: string, signal: AbortSignal) => Promise<RemoteOption[]>;
  /** Cache namespace, e.g. ['users-search']. Default: per component instance. */
  queryKey?: readonly unknown[];
  /** Characters before searching. Default 3, as legacy ModernDropdown. */
  minSearchLength?: number;
  /** Default 300 ms. */
  debounceMs?: number;
  /** Labels for values that are selected before any search (e.g. when editing). */
  initialOptions?: RemoteOption[];
  label?: ReactNode;
  description?: ReactNode;
  placeholder?: string;
  error?: ReactNode;
  required?: boolean;
  disabled?: boolean;
  clearable?: boolean;
}

export type SelectRemoteProps = SelectRemoteBase &
  (
    | {
        multiple?: false;
        value: string | null;
        onChange: (value: string | null, option: RemoteOption | null) => void;
      }
    | {
        multiple: true;
        value: string[];
        onChange: (value: string[], options: RemoteOption[]) => void;
      }
  );

const NO_OPTIONS: RemoteOption[] = [];

// The server already filtered; Mantine must not filter again by label.
const passThrough: OptionsFilter = ({ options }) => options;

/**
 * Replaces the remote mode of components/dropdown (ModernDropdown with
 * `remoteSearch`): a searchable single or multi select whose options come
 * from `search`, debounced and cached through TanStack Query.
 */
export function SelectRemote(props: SelectRemoteProps) {
  const {
    search,
    queryKey,
    minSearchLength = 3,
    debounceMs = 300,
    initialOptions,
    label,
    description,
    placeholder,
    error,
    required,
    disabled,
    clearable = true,
  } = props;

  const instanceId = useId();
  const [query, setQuery] = useState('');
  const [debounced] = useDebouncedValue(query.trim(), debounceMs);
  // Options the user picked, so selected values keep their label after the
  // result list moves on to another query.
  const [picked, setPicked] = useState<RemoteOption[]>([]);

  const pickedLabels = useMemo(() => {
    const map = new Map<string, string>();
    for (const option of initialOptions ?? []) map.set(option.value, option.label);
    for (const option of picked) map.set(option.value, option.label);
    return map;
  }, [initialOptions, picked]);

  const selectedKey = props.multiple ? props.value.join('\u0000') : (props.value ?? '');
  const selectedLabel = !props.multiple && props.value ? pickedLabels.get(props.value) : undefined;

  // Picking an option in single mode puts its label into the search box; that is not a search.
  const effectiveQuery = debounced === selectedLabel ? '' : debounced;
  const enabled = effectiveQuery.length >= minSearchLength;

  const result = useQuery({
    queryKey: [...(queryKey ?? ['select-remote', instanceId]), effectiveQuery],
    // TanStack Query aborts `signal` when this query loses its observer, i.e.
    // as soon as the user types on and the key changes.
    queryFn: ({ signal }) => search(effectiveQuery, signal),
    enabled,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
  const results = enabled ? (result.data ?? NO_OPTIONS) : NO_OPTIONS;

  const labels = useMemo(() => {
    const map = new Map(pickedLabels);
    for (const option of results) map.set(option.value, option.label);
    return map;
  }, [pickedLabels, results]);

  const data: ComboboxItem[] = useMemo(() => {
    const seen = new Set<string>();
    const items: ComboboxItem[] = [];
    const add = (value: string) => {
      if (!value || seen.has(value)) return;
      seen.add(value);
      items.push({ value, label: labels.get(value) ?? value });
    };
    results.forEach((option) => add(option.value));
    // Selected values stay in the list, or Mantine could not show their label.
    selectedKey.split('\u0000').forEach(add);
    return items;
  }, [results, selectedKey, labels]);

  const nothingFound = !enabled
    ? `En az ${minSearchLength} karakter yazın`
    : result.isFetching
      ? 'Aranıyor...'
      : 'Sonuç bulunamadı';

  const common = {
    label,
    description,
    placeholder: placeholder ?? 'Aramak için yazın...',
    error,
    required,
    disabled,
    clearable,
    searchable: true,
    data,
    filter: passThrough,
    nothingFoundMessage: nothingFound,
    rightSection: result.isFetching ? <Loader size="xs" /> : undefined,
  };

  const toOption = (value: string): RemoteOption => ({ value, label: labels.get(value) ?? value });

  if (props.multiple) {
    const { onChange } = props;
    return (
      <MultiSelect
        {...common}
        value={props.value}
        searchValue={query}
        onSearchChange={setQuery}
        onChange={(values) => {
          const options = values.map(toOption);
          setPicked(options);
          onChange(values, options);
        }}
      />
    );
  }

  const { onChange } = props;
  return (
    <Select
      {...common}
      value={props.value}
      searchValue={query}
      onSearchChange={setQuery}
      onChange={(value) => {
        const option = value ? toOption(value) : null;
        setPicked(option ? [option] : []);
        onChange(value, option);
      }}
    />
  );
}
