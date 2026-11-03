import { useState, type ClipboardEvent, type InputHTMLAttributes, type KeyboardEvent } from 'react';

export interface DraftInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'onInput' | 'onKeyDown' | 'onPaste' | 'onBlur'
> {
  /** What the plan holds, shown while the user is not typing. */
  value: string;
  /** Every keystroke (legacy `input`). */
  onInput?: (text: string) => void;
  /** Blur or Enter after typing (legacy `change`). */
  onCommit?: (text: string) => void;
  /** `text` is what was typed, or null when nothing was. preventDefault() drops the typed text. */
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>, text: string | null) => void;
  /** preventDefault() drops the typed text, so the cell shows the plan again. */
  onPaste?: (event: ClipboardEvent<HTMLInputElement>) => void;
  onBlur?: () => void;
}

/**
 * A cell that keeps what is being typed until it is committed, the way the
 * legacy inputs did: the plan may read "4510,20" as the saved 4510,2 (and
 * drop the edit) without the caret jumping or the typed zero vanishing.
 */
export function DraftInput({
  value,
  onInput,
  onCommit,
  onKeyDown,
  onPaste,
  onBlur,
  ...rest
}: DraftInputProps) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      type="text"
      autoComplete="off"
      {...rest}
      value={draft ?? value}
      onChange={(event) => {
        setDraft(event.target.value);
        onInput?.(event.target.value);
      }}
      onBlur={() => {
        if (draft !== null) {
          setDraft(null);
          onCommit?.(draft);
        }
        onBlur?.();
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event, draft);
        if (event.defaultPrevented) {
          setDraft(null);
          return;
        }
        if (event.key === 'Enter' && draft !== null) {
          setDraft(null);
          onCommit?.(draft);
        }
      }}
      onPaste={(event) => {
        onPaste?.(event);
        if (event.defaultPrevented) setDraft(null);
      }}
    />
  );
}
