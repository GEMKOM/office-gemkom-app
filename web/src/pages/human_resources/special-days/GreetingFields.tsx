import { Alert, Stack, Text, TextInput, Textarea } from '@mantine/core';
import { useRef, useState, type ReactNode } from 'react';
import type { OccasionTheme } from '@/api/general/specialDays';
import { THEME_TONE } from '@/shell/occasion/occasionModel';
import { FaIcon } from '@/ui';
import css from './SpecialDaysPreviewPage.module.css';
import { renderTemplate, unknownPlaceholders, type Placeholder } from './specialDayText';

type Field = 'title' | 'body';

export interface GreetingFieldsProps {
  title: string;
  body: string;
  onChange: (field: Field, value: string) => void;
  titleError?: ReactNode;
  bodyError?: ReactNode;
  titleLabel?: string;
  bodyLabel?: string;
  /** The title used when the field is left empty (a special day falls back to its name). */
  titleFallback?: string;
  placeholders: Placeholder[];
  sample: Record<string, string | number>;
  theme: OccasionTheme;
}

/**
 * The welcome's title and text, the placeholders the kind fills (a click puts
 * one where the cursor is) and a live preview with a sample colleague.
 */
export function GreetingFields({
  title,
  body,
  onChange,
  titleError,
  bodyError,
  titleLabel = 'Başlık',
  bodyLabel = 'Metin',
  titleFallback,
  placeholders,
  sample,
  theme,
}: GreetingFieldsProps) {
  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [lastField, setLastField] = useState<Field>('body');

  const insert = (token: string) => {
    const el = lastField === 'title' ? titleRef.current : bodyRef.current;
    const current = lastField === 'title' ? title : body;
    const start = el?.selectionStart ?? current.length;
    const end = el?.selectionEnd ?? current.length;
    const next = current.slice(0, start) + token + current.slice(end);
    onChange(lastField, next);
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const shownTitle = renderTemplate(title.trim() ? title : (titleFallback ?? ''), sample);
  const shownBody = renderTemplate(body, sample);
  const unknown = unknownPlaceholders(`${title}\n${body}`, placeholders);

  return (
    <Stack gap="sm">
      <TextInput
        ref={titleRef}
        label={titleLabel}
        value={title}
        placeholder={titleFallback ? `Boş bırakılırsa: ${titleFallback}` : undefined}
        description={
          titleFallback !== undefined ? 'Boş bırakılırsa günün adı başlık olur.' : undefined
        }
        onChange={(event) => onChange('title', event.currentTarget.value)}
        onFocus={() => setLastField('title')}
        error={titleError}
        maxLength={200}
      />
      <Textarea
        ref={bodyRef}
        label={bodyLabel}
        value={body}
        onChange={(event) => onChange('body', event.currentTarget.value)}
        onFocus={() => setLastField('body')}
        error={bodyError}
        rows={4}
        resize="vertical"
      />
      <div>
        <Text size="xs" c="var(--gk-muted)" mb={6}>
          Değişkenler: tıklayınca imlecin olduğu yere eklenir.
        </Text>
        <div className={css.chips}>
          {placeholders.map((p) => (
            <button
              key={p.token}
              type="button"
              className={css.chip}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => insert(p.token)}
              aria-label={`${p.token} ekle`}
            >
              <code>{p.token}</code>
              <span>{p.label}</span>
            </button>
          ))}
        </div>
      </div>
      {unknown.length > 0 ? (
        <Alert color="yellow" variant="light" icon={<FaIcon icon="fas fa-circle-info" />} p="xs">
          Bu metinde karşılığı olmayan değişken var, boş görünür: {unknown.join(', ')}
        </Alert>
      ) : null}
      <div>
        <Text size="xs" c="var(--gk-muted)" mb={6}>
          Önizleme ({String(sample.full_name ?? '')} için)
        </Text>
        <div
          className={css.greeting}
          style={{ background: THEME_TONE[theme] }}
          data-testid="greeting-preview"
        >
          <p className={css.greetingTitle}>{shownTitle || ' '}</p>
          {shownBody ? <p className={css.greetingBody}>{shownBody}</p> : null}
        </div>
      </div>
    </Stack>
  );
}
