import { Avatar, Input } from '@mantine/core';
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { useTeams, useUsers } from '@/api/reference/users';
import { FaIcon } from '../FaIcon';
import {
  applyAutoFormat,
  caretAtLineStart,
  commandState,
  currentRange,
  enclosingWrap,
  fixListCaret,
  focusKeepingSelection,
  insertHtmlAtCaret,
  insertMention,
  insertTextAtCaret,
  lockBadges,
  mentionQueryAtCaret,
  removeSpacerBeforeCaret,
  runCommand,
  serializeToMarkdown,
  toggleWrap,
  type MentionAnchor,
  type WrapKind,
} from './editorDom';
import { GroupMembersPopover } from './GroupMembersPopover';
import {
  RICH_TEXT_HINT,
  renderRichText,
  type MentionedGroup,
  type MentionedUser,
} from './renderRichText';
import classes from './RichText.module.css';

/**
 * One toolbar button. `command` runs through execCommand (native undo, native
 * "toggle the typing state"); `wrap` is one of our own inline marks.
 */
type ToolItem = {
  id: string;
  icon: string;
  label: string;
  command?: string;
  wrap?: WrapKind;
  key?: string;
  tone?: string;
};

const TOOLBAR: (ToolItem | 'sep')[] = [
  { id: 'bold', icon: 'fas fa-bold', label: 'Kalın', command: 'bold', key: 'B' },
  { id: 'italic', icon: 'fas fa-italic', label: 'İtalik', command: 'italic', key: 'I' },
  { id: 'strike', icon: 'fas fa-strikethrough', label: 'Üstü çizili', command: 'strikeThrough' },
  { id: 'code', icon: 'fas fa-code', label: 'Kod', wrap: 'code' },
  'sep',
  {
    id: 'critical',
    icon: 'fas fa-triangle-exclamation',
    label: 'Kritik (kırmızı)',
    wrap: 'critical',
    tone: 'critical',
  },
  {
    id: 'positive',
    icon: 'fas fa-circle-check',
    label: 'Olumlu (yeşil)',
    wrap: 'positive',
    tone: 'positive',
  },
  'sep',
  { id: 'ul', icon: 'fas fa-list-ul', label: 'Madde listesi', command: 'insertUnorderedList' },
  { id: 'ol', icon: 'fas fa-list-ol', label: 'Numaralı liste', command: 'insertOrderedList' },
  'sep',
  { id: 'mention', icon: 'fas fa-at', label: 'Kişi veya grup etiketle' },
];
const TOOL_ITEMS = TOOLBAR.filter((item): item is ToolItem => item !== 'sep');
/** Position of each button in the toolbar's arrow-key order. */
const TOOL_INDEX: Record<string, number> = Object.fromEntries(
  [...TOOL_ITEMS.map((item) => item.id), 'source', 'help'].map((id, index) => [id, index]),
);

interface ToolButtonProps {
  icon: string;
  label: string;
  title: string;
  pressed?: boolean;
  tone?: string;
  /** The toolbar's single tab stop. */
  tabbable: boolean;
  disabled: boolean;
  onFocus: () => void;
  onClick: () => void;
}

function ToolButton({
  icon,
  label,
  title,
  pressed,
  tone,
  tabbable,
  disabled,
  onFocus,
  onClick,
}: ToolButtonProps) {
  return (
    <button
      type="button"
      className={classes.tool}
      data-tone={tone}
      data-active={pressed || undefined}
      aria-label={label}
      aria-pressed={pressed}
      title={title}
      tabIndex={tabbable ? 0 : -1}
      disabled={disabled}
      // Keep the selection: a click would otherwise blur the surface first.
      onMouseDown={(event) => event.preventDefault()}
      onFocus={onFocus}
      onClick={onClick}
    >
      <FaIcon icon={icon} />
    </button>
  );
}

/** Room a group preview needs beside the @ list: its width plus a margin. */
const PREVIEW_CLEARANCE = 240;
const MAX_SUGGESTIONS = 10;

interface Suggestion {
  type: 'user' | 'group';
  token: string;
  fullName: string;
  id?: number | string;
  memberCount?: number;
}

export interface RichTextEditorProps {
  /** Markdown-lite, the stored format. */
  value: string;
  onChange: (value: string) => void;
  label?: ReactNode;
  description?: ReactNode;
  error?: ReactNode;
  withAsterisk?: boolean;
  placeholder?: string;
  /** Minimum height in text lines. Default 3. */
  rows?: number;
  /** @mention suggestions for people and groups. Default true. */
  mentions?: boolean;
  /** Resolve badges in text that already exists (an edit form). */
  mentionedUsers?: readonly MentionedUser[] | null;
  mentionedGroups?: readonly MentionedGroup[] | null;
  disabled?: boolean;
  autoFocus?: boolean;
  id?: string;
  'aria-label'?: string;
  onBlur?: () => void;
  onFocus?: () => void;
}

/**
 * WYSIWYG box for comments and discussion text (legacy utils/richTextEditor.js).
 * What you type is what the comment will look like, but the value going in and
 * out is markdown-lite: `**kalın**`, `!!acil!!`, `@kullanıcı`. Typed markers
 * still work ("**kalın**" turns bold as you close it), the `</>` button shows
 * the raw text, and pasted HTML goes through the serializer and the renderer,
 * which is the sanitiser.
 */
export function RichTextEditor({
  value,
  onChange,
  label,
  description,
  error,
  withAsterisk,
  placeholder,
  rows = 3,
  mentions = true,
  mentionedUsers,
  mentionedGroups,
  disabled = false,
  autoFocus = false,
  id,
  'aria-label': ariaLabel,
  onBlur,
  onFocus,
}: RichTextEditorProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const surfaceRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const toolbarRef = useRef<HTMLDivElement>(null);
  // The value this surface last showed or emitted: a different `value` prop
  // means someone else wrote it (a reset after posting), so redraw.
  const shown = useRef<string | null>(null);
  const formatting = useRef(false);
  const anchorRef = useRef<MentionAnchor | null>(null);
  const onChangeRef = useRef(onChange);
  useLayoutEffect(() => {
    onChangeRef.current = onChange;
  });

  const [source, setSource] = useState(false);
  const [active, setActive] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selected, setSelected] = useState(0);
  // The group whose members are previewed, with the row and list it stands beside.
  const [preview, setPreview] = useState<{
    item: Suggestion;
    row: HTMLElement;
    list: HTMLElement;
  } | null>(null);

  const users = useUsers({}, { enabled: mentions });
  const teams = useTeams({ enabled: mentions });
  const mentionData = useRef({ users: users.data, teams: teams.data });
  useLayoutEffect(() => {
    mentionData.current = { users: users.data, teams: teams.data };
  });

  const renderOptions = useRef({ mentionedUsers, mentionedGroups });
  useLayoutEffect(() => {
    renderOptions.current = { mentionedUsers, mentionedGroups };
  });

  const drawSurface = useCallback((markdown: string) => {
    const surface = surfaceRef.current;
    if (!surface) return;
    surface.innerHTML = renderRichText(markdown, renderOptions.current);
    lockBadges(surface);
    shown.current = markdown;
  }, []);

  // Leaving the raw-text view always redraws: the text may have been edited there.
  const wasSource = useRef(false);
  useLayoutEffect(() => {
    if (source) {
      wasSource.current = true;
      return;
    }
    if (wasSource.current || value !== shown.current) {
      wasSource.current = false;
      drawSurface(value);
    }
  }, [value, source, drawSurface]);

  useEffect(() => {
    if (autoFocus) surfaceRef.current?.focus();
  }, [autoFocus]);

  /** Read the surface back and report it if it changed. */
  const sync = useCallback(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const markdown = serializeToMarkdown(surface);
    if (markdown !== shown.current) {
      shown.current = markdown;
      onChangeRef.current(markdown);
    }
  }, []);

  // ---- @mentions ----
  const hideSuggestions = useCallback(() => {
    anchorRef.current = null;
    setSuggestions((prev) => (prev.length ? [] : prev));
    setPreview(null);
  }, []);

  const refreshSuggestions = useCallback(() => {
    const surface = surfaceRef.current;
    if (!mentions || !surface) return;
    const anchor = mentionQueryAtCaret(surface);
    anchorRef.current = anchor;
    if (!anchor) {
      hideSuggestions();
      return;
    }
    const query = anchor.query;
    const lower = (text: unknown) => String(text ?? '').toLocaleLowerCase('tr');
    const people: Suggestion[] = (mentionData.current.users ?? [])
      .filter((user) => {
        const fullName =
          user.full_name || `${user.first_name || ''} ${user.last_name || ''}`.trim();
        return lower(user.username).includes(query) || lower(fullName).includes(query);
      })
      .map((user) => ({
        type: 'user' as const,
        token: user.username || '',
        fullName: user.full_name || user.username || '',
      }))
      .filter((item) => item.token);
    const groups: Suggestion[] = (mentionData.current.teams ?? [])
      .filter(
        (group) =>
          lower(group.name || group.value).includes(query) ||
          lower(group.display_name || group.label).includes(query),
      )
      .map((group) => ({
        type: 'group' as const,
        id: group.id,
        token: group.name || group.value || '',
        fullName: group.display_name || group.label || group.name || '',
        memberCount: typeof group.member_count === 'number' ? group.member_count : undefined,
      }))
      .filter((item) => item.token);
    const next = [...people, ...groups].slice(0, MAX_SUGGESTIONS);
    if (!next.length) {
      hideSuggestions();
      return;
    }
    setSuggestions(next);
    setSelected(0);
  }, [mentions, hideSuggestions]);

  const pick = (suggestion: Suggestion | undefined) => {
    const anchor = anchorRef.current;
    if (!suggestion || !anchor) return;
    insertMention(anchor, suggestion);
    hideSuggestions();
    sync();
  };

  // Show who a highlighted group would notify, a moment after it is highlighted
  // (the list is rebuilt on every keystroke; a popover per character would strobe).
  const highlighted = suggestions[selected];
  useEffect(() => {
    if (highlighted?.type !== 'group' || highlighted.id === undefined) return undefined;
    const timer = window.setTimeout(() => {
      const list = listRef.current;
      const row = rowRefs.current[selected];
      const box = list?.getBoundingClientRect();
      // On a phone neither side has room, and a preview over the list would
      // hide the choices it is meant to inform.
      const fits =
        box &&
        (window.innerWidth - box.right >= PREVIEW_CLEARANCE || box.left >= PREVIEW_CLEARANCE);
      setPreview(fits && list && row ? { item: highlighted, row, list } : null);
    }, 140);
    return () => window.clearTimeout(timer);
  }, [highlighted, selected]);
  // Only while that group is still the highlighted row.
  const groupPreview = preview && preview.item === highlighted ? preview : null;

  // ---- toolbar state follows the caret ----
  const updateActive = useCallback(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const range = currentRange(surface);
    const on = range
      ? TOOL_ITEMS.filter((item) =>
          item.command
            ? commandState(item.command)
            : item.wrap
              ? Boolean(enclosingWrap(range, item.wrap))
              : false,
        )
          .map((item) => item.id)
          .join(' ')
      : '';
    setActive((prev) => (prev === on ? prev : on));
  }, []);

  useEffect(() => {
    const onSelection = () => {
      const node = document.getSelection()?.anchorNode;
      if (node && surfaceRef.current?.contains(node)) updateActive();
    };
    document.addEventListener('selectionchange', onSelection);
    return () => document.removeEventListener('selectionchange', onSelection);
  }, [updateActive]);

  // ---- events ----
  const onInput = () => {
    sync();
    refreshSuggestions();
    if (formatting.current) return;
    // After the input event, not inside it: Chrome ignores edits made from
    // inside an input handler. The guard stops the edit re-scheduling itself.
    window.setTimeout(() => {
      const surface = surfaceRef.current;
      if (!surface) return;
      formatting.current = true;
      try {
        if (applyAutoFormat(surface)) sync();
      } finally {
        formatting.current = false;
      }
    }, 0);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (suggestions.length) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSelected((index) => Math.min(index + 1, suggestions.length - 1));
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSelected((index) => Math.max(index - 1, 0));
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        pick(suggestions[selected]);
        return;
      }
      if (event.key === 'Escape') {
        // Close the list, not the modal around the editor.
        event.preventDefault();
        event.stopPropagation();
        hideSuggestions();
        return;
      }
    }
    if (event.key === 'Backspace') removeSpacerBeforeCaret();
  };

  const onKeyUp = (event: KeyboardEvent<HTMLDivElement>) => {
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) refreshSuggestions();
  };

  const onPaste = (event: ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    const surface = surfaceRef.current;
    const data = event.clipboardData;
    if (!surface || !data) return;
    const html = data.getData('text/html');
    let markdown: string;
    if (html) {
      // Parsed in an inert document: nothing in it loads or runs.
      const scratch = new DOMParser().parseFromString(html, 'text/html').body;
      markdown = serializeToMarkdown(scratch);
    } else {
      markdown = data.getData('text/plain');
    }
    if (markdown && insertHtmlAtCaret(surface, renderRichText(markdown))) sync();
  };

  const runTool = (item: ToolItem) => {
    const surface = surfaceRef.current;
    if (!surface || disabled) return;
    focusKeepingSelection(surface);
    if (item.command) {
      const wasAtLineStart = caretAtLineStart();
      runCommand(item.command);
      fixListCaret(wasAtLineStart);
    } else if (item.wrap) {
      toggleWrap(surface, item.wrap);
    } else if (item.id === 'mention') {
      insertTextAtCaret(surface, '@');
      refreshSuggestions();
    }
    sync();
    updateActive();
  };

  const toggleSource = () => {
    hideSuggestions();
    setSource((on) => !on);
  };

  // One tab stop for the whole toolbar; arrows move within it (ARIA toolbar).
  const [focusIndex, setFocusIndex] = useState(0);
  const onToolbarKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const step = event.key === 'ArrowRight' ? 1 : -1;
    const count = Object.keys(TOOL_INDEX).length;
    const next = (focusIndex + step + count) % count;
    setFocusIndex(next);
    toolbarRef.current?.querySelectorAll<HTMLButtonElement>('button')[next]?.focus();
  };

  const activeIds = new Set(active.split(' '));

  return (
    <Input.Wrapper
      label={label}
      description={description}
      error={error}
      withAsterisk={withAsterisk}
      id={inputId}
      labelProps={{ htmlFor: inputId, onClick: () => surfaceRef.current?.focus() }}
    >
      <div
        className={classes.editor}
        data-empty={!value.trim() || undefined}
        data-error={error ? true : undefined}
        data-disabled={disabled || undefined}
      >
        <div
          ref={toolbarRef}
          className={classes.toolbar}
          role="toolbar"
          aria-label="Metin biçimlendirme"
          onKeyDown={onToolbarKeyDown}
        >
          {TOOLBAR.map((item, index) =>
            item === 'sep' ? (
              <span key={`sep-${index}`} className={classes.sep} aria-hidden="true" />
            ) : (
              <ToolButton
                key={item.id}
                icon={item.icon}
                label={item.label}
                title={item.key ? `${item.label} (Ctrl+${item.key})` : item.label}
                pressed={item.command || item.wrap ? activeIds.has(item.id) : undefined}
                tone={item.tone}
                tabbable={TOOL_INDEX[item.id] === focusIndex}
                disabled={disabled}
                onFocus={() => setFocusIndex(TOOL_INDEX[item.id] ?? 0)}
                onClick={() => runTool(item)}
              />
            ),
          )}
          <span className={classes.spacer} />
          <ToolButton
            icon="fas fa-file-code"
            label="Ham metni göster"
            title={source ? 'Biçimlendirilmiş görünüme dön' : 'Ham metni göster'}
            pressed={source}
            tabbable={TOOL_INDEX.source === focusIndex}
            disabled={disabled}
            onFocus={() => setFocusIndex(TOOL_INDEX.source ?? 0)}
            onClick={toggleSource}
          />
          <ToolButton
            icon="fas fa-question"
            label="Yazım kısayolları"
            title={`Yazarken de biçimlendirebilirsiniz:
${RICH_TEXT_HINT}`}
            tabbable={TOOL_INDEX.help === focusIndex}
            disabled={disabled}
            onFocus={() => setFocusIndex(TOOL_INDEX.help ?? 0)}
            onClick={() => {}}
          />
        </div>

        <div
          ref={surfaceRef}
          id={source ? undefined : inputId}
          className={classes.surface}
          contentEditable={!disabled}
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-label={ariaLabel ?? (typeof label === 'string' ? label : undefined)}
          aria-invalid={error ? true : undefined}
          aria-hidden={source || undefined}
          hidden={source}
          data-placeholder={placeholder}
          style={{ minHeight: `${Math.max(3, rows) * 1.5}em` }}
          onInput={onInput}
          onKeyDown={onKeyDown}
          onKeyUp={onKeyUp}
          onPaste={onPaste}
          onFocus={onFocus}
          onBlur={() => {
            hideSuggestions();
            onBlur?.();
          }}
        />
        {source ? (
          <textarea
            id={inputId}
            className={classes.source}
            value={value}
            rows={Math.max(3, rows)}
            placeholder={placeholder}
            aria-label={ariaLabel ?? (typeof label === 'string' ? label : undefined)}
            disabled={disabled}
            autoFocus
            onChange={(event) => onChange(event.currentTarget.value)}
            onBlur={onBlur}
          />
        ) : null}

        {suggestions.length ? (
          <div
            ref={listRef}
            className={classes.suggestions}
            role="listbox"
            aria-label="Etiketlenecek kişi veya grup"
          >
            {suggestions.map((item, index) => (
              <div
                key={`${item.type}-${item.token}`}
                ref={(el) => {
                  rowRefs.current[index] = el;
                }}
                role="option"
                aria-selected={index === selected}
                className={classes.suggestion}
                data-selected={index === selected || undefined}
                onMouseDown={(event) => {
                  event.preventDefault(); // do not blur the surface
                  pick(item);
                }}
                onMouseEnter={() => setSelected(index)}
              >
                <Avatar size={24} radius="xl" name={item.fullName || item.token} color="initials" />
                <div className={classes.suggestionText}>
                  <div className={classes.suggestionName}>
                    {item.fullName || item.token}
                    {item.type === 'group' ? <span className={classes.groupTag}>Grup</span> : null}
                  </div>
                  <div className={classes.suggestionToken}>
                    @{item.token}
                    {item.type === 'group' && item.memberCount !== undefined
                      ? ` · ${item.memberCount} kişi`
                      : ''}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {groupPreview?.item.id !== undefined ? (
          <GroupMembersPopover
            key={String(groupPreview.item.id)}
            anchor={groupPreview.row}
            group={{ id: groupPreview.item.id, name: groupPreview.item.token }}
            placement="side"
            avoid={groupPreview.list}
            preview
            onClose={() => setPreview(null)}
          />
        ) : null}
      </div>
    </Input.Wrapper>
  );
}
