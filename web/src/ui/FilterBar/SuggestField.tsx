import { Popover, ScrollArea, TextInput, UnstyledButton } from '@mantine/core';
import { useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useJobOrderOptions } from '@/api/reference/jobOrders';
import classes from '../ui.module.css';

export interface SuggestOption {
  value: string;
  label: string;
}

/** Fixed options, or a named list the field loads itself ('jobOrders': every job order). */
export type SuggestionSource = SuggestOption[] | 'jobOrders';

// Accents and case are ignored, so "sut" finds "Süt".
export const fold = (text: string) =>
  text.toLocaleLowerCase('tr').normalize('NFD').replace(/[̀-ͯ]/g, '');

const MAX_SHOWN = 50;

export interface SuggestFieldProps {
  /** The text in the box (the draft). */
  value: string;
  source: SuggestionSource;
  /** Typing only narrows the list; nothing is applied until a pick, Enter or leaving. */
  onType: (text: string) => void;
  /** A picked suggestion, Enter on the typed text, or leaving the box with changed text. */
  onApply: (text: string) => void;
  /** The applied value: leaving the box applies the text only when it differs. */
  applied: string;
  /** In a filter popover the list sits under the box; otherwise it drops down from it. */
  inline?: boolean;
  label?: ReactNode;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  leftSection?: ReactNode;
  autoFocus?: boolean;
  w?: number;
}

/** A text filter that lists matching values as you type; a pick filters on it. */
export function SuggestField({ source, ...props }: SuggestFieldProps) {
  if (source === 'jobOrders') return <JobOrderSuggestField {...props} />;
  return <SuggestFieldBase {...props} options={source} />;
}

function JobOrderSuggestField(props: Omit<SuggestFieldProps, 'source'>) {
  // Completed and cancelled ones too: lists filter their history by job no.
  const jobs = useJobOrderOptions({ includeAll: true });
  const options = useMemo(
    () =>
      (jobs.data ?? []).map((j) => ({
        value: j.job_no,
        label: j.title ? `${j.job_no} — ${j.title}` : j.job_no,
      })),
    [jobs.data],
  );
  return <SuggestFieldBase {...props} options={options} />;
}

function SuggestFieldBase({
  value,
  options,
  onType,
  onApply,
  applied,
  inline = false,
  label,
  placeholder,
  ariaLabel,
  className,
  leftSection,
  autoFocus,
  w,
}: Omit<SuggestFieldProps, 'source'> & { options: SuggestOption[] }) {
  const [active, setActive] = useState(-1);
  const [open, setOpen] = useState(false);

  const needle = fold(value.trim());
  const matches = useMemo(() => {
    if (!needle) return [];
    const out: SuggestOption[] = [];
    for (const option of options) {
      if (fold(option.label).includes(needle) || fold(option.value).includes(needle)) {
        out.push(option);
        if (out.length === MAX_SHOWN) break;
      }
    }
    return out;
  }, [needle, options]);

  const pick = (picked: string) => {
    setActive(-1);
    setOpen(false);
    onApply(picked);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' && matches.length) {
      event.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, matches.length - 1));
    } else if (event.key === 'ArrowUp' && matches.length) {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const highlighted = active >= 0 ? matches[active] : undefined;
      // No highlighted suggestion: filter on what was typed (e.g. "254" for all of 254-xx).
      pick(highlighted ? highlighted.value : value.trim());
    } else if (event.key === 'Escape' && !inline && open) {
      event.stopPropagation();
      setOpen(false);
    }
  };

  const list = (
    <ScrollArea.Autosize mah={280} type="auto">
      <div role="listbox" aria-label="Eşleşenler" className={classes.suggestions}>
        {matches.map((option, i) => (
          <UnstyledButton
            key={option.value}
            role="option"
            aria-selected={i === active}
            data-active={i === active || undefined}
            className={classes.suggestion}
            title={option.label}
            // Keep the focus in the box, so picking is not also "leaving".
            onMouseDown={(event) => event.preventDefault()}
            onMouseEnter={() => setActive(i)}
            onClick={() => pick(option.value)}
          >
            {option.label}
          </UnstyledButton>
        ))}
      </div>
    </ScrollArea.Autosize>
  );

  const input = (
    <TextInput
      className={className}
      w={w}
      label={label}
      aria-label={ariaLabel}
      placeholder={placeholder}
      leftSection={leftSection}
      autoFocus={autoFocus}
      autoComplete="off"
      value={value}
      onChange={(event) => {
        const text = event.currentTarget.value;
        setActive(-1);
        setOpen(true);
        onType(text);
        // Emptying the box clears the filter at once.
        if (!text.trim() && applied) onApply('');
      }}
      onFocus={() => setOpen(true)}
      onBlur={() => {
        setOpen(false);
        if (value.trim() !== applied) onApply(value.trim());
      }}
      onKeyDown={onKeyDown}
    />
  );

  if (inline) {
    return (
      <div style={w ? { width: w } : undefined}>
        {input}
        {matches.length ? <div className={classes.suggestionsInline}>{list}</div> : null}
      </div>
    );
  }
  return (
    <Popover
      opened={open && matches.length > 0}
      onChange={setOpen}
      position="bottom-start"
      offset={4}
      withinPortal
      trapFocus={false}
      returnFocus={false}
      width="target"
    >
      <Popover.Target>{input}</Popover.Target>
      <Popover.Dropdown p={4}>{list}</Popover.Dropdown>
    </Popover>
  );
}
