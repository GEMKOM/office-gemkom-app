import { Button, NativeSelect, Textarea, TextInput } from '@mantine/core';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useEffect, useState, type MouseEvent } from 'react';
import {
  cancelAction,
  confirmAction,
  type NeoAction,
  type NeoActionField,
} from '@/api/assistant';
import { isApiError } from '@/api/client';
import { AppLink } from '@/shell/AppLink';
import { FaIcon } from '@/ui/FaIcon';
import classes from './neo.module.css';
import { closeNeo, setItemAction } from './neoStore';
import { neoKeys } from './queries';

// A write Neo proposed. Nothing is saved until Onayla: the card shows what
// will be written, lets the user fix the editable fields, and only then calls
// the confirm endpoint, which runs the normal create under the user's rights.

const ICONS: Record<string, string> = {
  discussion_topic: 'fas fa-comments',
  discussion_comment: 'fas fa-comment',
  report: 'fas fa-bug',
  leave_request: 'fas fa-umbrella-beach',
};

/** What a confirmed action changes, so open pages show it without a reload. */
const INVALIDATES: Record<string, QueryKey[]> = {
  discussion_topic: [['discussionTopics'], ['myDiscussions']],
  discussion_comment: [['discussionTopics'], ['myDiscussions']],
  report: [neoKeys.reports, ['feedbackReports']],
  leave_request: [['vacationRequests'], ['vacation']],
};

const CLOSED_TEXT: Record<string, string> = {
  cancelled: 'Vazgeçildi; hiçbir şey kaydedilmedi.',
  expired: "Bu önerinin süresi doldu. Gerekirse Neo'dan yeniden isteyin.",
};

const asText = (value: string | number | null | undefined) => (value == null ? '' : String(value));

function shownValue(field: NeoActionField, value: string) {
  if (field.display) return field.display;
  const option = field.options?.find((o) => o.value === value);
  return option?.label ?? value;
}

/** On phones the panel covers the page: following the result's link closes it. */
function onLinkClick(event: MouseEvent<HTMLAnchorElement>) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
  try {
    if (window.matchMedia('(max-width: 47.99em)').matches) closeNeo();
  } catch {
    // No matchMedia (tests).
  }
}

function FieldInput({
  field,
  value,
  disabled,
  onChange,
}: {
  field: NeoActionField;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const common = { label: field.label, size: 'xs' as const, disabled, required: field.required };
  if (field.type === 'textarea') {
    return (
      <Textarea
        {...common}
        rows={3}
        resize="vertical"
        maxLength={8000}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    );
  }
  if (field.type === 'select') {
    return (
      <NativeSelect
        {...common}
        data={field.options ?? []}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    );
  }
  return (
    <TextInput
      {...common}
      type={field.type === 'date' ? 'date' : field.type === 'time' ? 'time' : 'text'}
      value={value}
      onChange={(event) => onChange(event.currentTarget.value)}
    />
  );
}

export function ActionCard({ action, itemId }: { action: NeoAction; itemId: string }) {
  const queryClient = useQueryClient();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(action.fields.map((f) => [f.key, asText(f.value)])),
  );
  const [busy, setBusy] = useState<'confirm' | 'cancel' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const expiresAt = Date.parse(action.expires_at);
  const [expired, setExpired] = useState(() => expiresAt <= Date.now());

  // The card turns into "expired" by itself when its 30 minutes run out.
  useEffect(() => {
    if (action.status !== 'pending' || expired || !Number.isFinite(expiresAt)) return;
    const timer = window.setTimeout(() => setExpired(true), Math.max(0, expiresAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [action.status, expired, expiresAt]);

  const status = action.status === 'pending' && expired ? 'expired' : action.status;
  const open = status === 'pending';
  const missing = action.fields.some((f) => f.editable && f.required && !values[f.key]?.trim());

  const run = async (kind: 'confirm' | 'cancel') => {
    setBusy(kind);
    setError(null);
    try {
      const edits = Object.fromEntries(
        action.fields
          .filter((f) => f.editable && values[f.key] !== asText(f.value))
          .map((f) => [f.key, values[f.key] ?? '']),
      );
      const next = kind === 'confirm' ? await confirmAction(action.id, edits) : await cancelAction(action.id);
      setItemAction(itemId, next);
      if (next.status === 'confirmed') {
        for (const queryKey of INVALIDATES[next.kind] ?? []) void queryClient.invalidateQueries({ queryKey });
      }
    } catch (err) {
      setError(isApiError(err) && err.message ? err.message : 'İşlem tamamlanamadı, tekrar deneyin.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className={classes.action} data-status={status} aria-label={action.label}>
      <header className={classes.actionHead}>
        <FaIcon icon={ICONS[action.kind] ?? 'fas fa-pen'} />
        <span className={classes.actionTitle}>{action.label}</span>
        {open ? <span className={classes.actionBadge}>Onay bekliyor</span> : null}
      </header>

      {open ? (
        <div className={classes.actionFields}>
          {action.fields.map((field) =>
            field.editable ? (
              <FieldInput
                key={field.key}
                field={field}
                value={values[field.key] ?? ''}
                disabled={busy !== null}
                onChange={(value) => setValues((prev) => ({ ...prev, [field.key]: value }))}
              />
            ) : (
              <div key={field.key} className={classes.actionRow}>
                <span className={classes.actionLabel}>{field.label}</span>
                <span>{shownValue(field, asText(field.value))}</span>
              </div>
            ),
          )}
        </div>
      ) : (
        <dl className={classes.actionSummary}>
          {action.fields
            .filter((field) => asText(field.value))
            .map((field) => (
              <div key={field.key} className={classes.actionRow}>
                <dt className={classes.actionLabel}>{field.label}</dt>
                <dd>{shownValue(field, asText(field.value))}</dd>
              </div>
            ))}
        </dl>
      )}

      {error ? (
        <p className={classes.actionError} role="alert">
          {error}
        </p>
      ) : null}

      {open ? (
        <>
          <div className={classes.actionButtons}>
            <Button
              size="xs"
              onClick={() => void run('confirm')}
              loading={busy === 'confirm'}
              disabled={busy !== null || missing}
              leftSection={<FaIcon icon="fas fa-check" />}
            >
              Onayla
            </Button>
            <Button size="xs" variant="default" onClick={() => void run('cancel')} disabled={busy !== null}>
              Vazgeç
            </Button>
          </div>
          <p className={classes.actionNote}>Onaylayana kadar hiçbir şey kaydedilmez.</p>
        </>
      ) : status === 'confirmed' ? (
        <p className={classes.actionDone}>
          <FaIcon icon="fas fa-circle-check" />
          {action.result?.label ?? 'Kayıt'} oluşturuldu.
          {action.result?.url ? (
            <AppLink to={action.result.url} onClick={onLinkClick}>
              Aç
            </AppLink>
          ) : null}
        </p>
      ) : status === 'failed' ? (
        <p className={classes.actionError}>
          Kaydedilemedi{action.error ? `: ${action.error}` : '.'}
        </p>
      ) : (
        <p className={classes.actionNote}>{CLOSED_TEXT[status] ?? ''}</p>
      )}
    </section>
  );
}
