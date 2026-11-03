import { Button, Loader, Textarea, TextInput } from '@mantine/core';
import { useState, type KeyboardEvent } from 'react';
import { DATE_ENTRY_PLACEHOLDER, formatDMY, maskDateInput, parseDMY } from '@/features/plan-sheet/dateEntry';
import {
  headerValues,
  type HeaderDateKey,
  type HeaderTextKey,
  type HeaderWdKey,
} from '@/features/plan-sheet/editing';
import type { HeaderOverrides, PlanSheet } from '@/features/plan-sheet/types';
import { confirm } from '@/ui/confirm';
import { FaIcon } from '@/ui/FaIcon';
import classes from './PlanSheetPage.module.css';

export interface SaveStatus {
  state: 'saving' | 'saved' | 'error' | null;
  error?: string;
  savedAt?: string;
}

const HEADER_TEXTS: [HeaderTextKey, string][] = [
  ['job_no', 'İş emri no'],
  ['title', 'İş adı'],
  ['customer_name', 'Müşteri'],
];
const HEADER_DATES: [HeaderDateKey, string][] = [
  ['start', 'Başlangıç'],
  ['termin', 'Termin'],
  ['plan_end', 'Plan bitişi'],
  ['projected_end', 'Öngörülen'],
];
const HEADER_WDS: [HeaderWdKey, string][] = [
  ['plan_vs_termin_wd', 'Plan bitişi − Termin'],
  ['deviation_wd', 'Öngörülen − Plan bitişi'],
  ['termin_gap_wd', 'Öngörülen − Termin'],
];

const hasOwn = (obj: object, key: string) => Object.prototype.hasOwnProperty.call(obj, key);

function StatusText({ status, hasEdits }: { status: SaveStatus; hasEdits: boolean }) {
  if (status.state === 'saving') {
    return (
      <>
        <Loader size={12} color="currentColor" /> Kaydediliyor…
      </>
    );
  }
  if (status.state === 'error') {
    return (
      <span className={classes.editErr}>
        <FaIcon icon="fas fa-triangle-exclamation" /> {status.error || 'Kaydedilemedi'}
      </span>
    );
  }
  if (status.state === 'saved') {
    return (
      <>
        <FaIcon icon="fas fa-check" /> Kaydedildi {status.savedAt || ''}
      </>
    );
  }
  return <>{hasEdits ? 'Değişiklikler kayıtlı' : 'Henüz değişiklik yok'}</>;
}

// Inputs commit like a native "change": on leaving the field or on Enter.
const commitOnEnter = (e: KeyboardEvent<HTMLInputElement>) => {
  if (e.key === 'Enter') e.currentTarget.blur();
};

/**
 * An editable link's banner and header form (the sales team's controls, in
 * Turkish whatever the sheet's language). The edits are kept on the link,
 * never on the plan.
 */
export function EditPanel({
  sheet,
  view,
  header,
  status,
  hasEdits,
  onHeaderChange,
  onReset,
}: {
  /** The computed sheet ("edited back to the original" checks). */
  sheet: PlanSheet;
  /** The sheet as shown, header edits laid over. */
  view: PlanSheet;
  header: HeaderOverrides;
  status: SaveStatus;
  hasEdits: boolean;
  onHeaderChange: (next: HeaderOverrides) => void;
  onReset: () => void;
}) {
  const computed = headerValues(sheet);
  const current = headerValues(view);
  const [invalid, setInvalid] = useState<Set<string>>(new Set());
  const editedClass = (key: string) => (hasOwn(header, key) ? classes.editedInput : undefined);

  // A text or date field: writing the computed value back drops the edit.
  const commitValue = (key: HeaderTextKey | HeaderDateKey, raw: string, isDate: boolean) => {
    let value: string | null;
    if (isDate) {
      const parsed = parseDMY(raw);
      setInvalid((s) => {
        const next = new Set(s);
        if (parsed === null) next.add(key);
        else next.delete(key);
        return next;
      });
      if (parsed === null) return;
      value = parsed || null;
    } else {
      value = raw.trim();
    }
    if (String(value ?? '') === String(computed[key] ?? '')) {
      if (!hasOwn(header, key)) return;
      const next = { ...header };
      delete next[key];
      onHeaderChange(next);
    } else if (header[key] !== value) {
      onHeaderChange({ ...header, [key]: value });
    }
  };

  const commitWd = (key: HeaderWdKey, raw: string) => {
    if (raw === '') {
      if (!hasOwn(header, key)) return;
      const next = { ...header };
      delete next[key];
      onHeaderChange(next);
      return;
    }
    const n = Number(raw);
    if (Number.isNaN(n) || header[key] === n) return;
    onHeaderChange({ ...header, [key]: n });
  };

  const commitNote = (raw: string) => {
    const next = { ...header };
    if (raw.trim()) next.note = raw;
    else delete next.note;
    if (next.note !== header.note) onHeaderChange(next);
  };

  const reset = async () => {
    if (!(await confirm({ message: 'Bu bağlantıdaki tüm değişiklikler silinsin mi?', danger: true }))) return;
    setInvalid(new Set());
    onReset();
  };

  return (
    <section className={classes.printHide}>
      <div className={classes.editBanner}>
        <FaIcon icon="fas fa-pen-to-square" className={classes.editIcon} />
        <div className={classes.editText}>
          <strong>Düzenlenebilir bağlantı.</strong> Tablodaki her hücreye tıklayıp değiştirebilir, üst bilgileri
          aşağıdan düzenleyebilirsiniz. Değişiklikler yalnızca bu bağlantıda saklanır; gerçek plan değişmez.
          Bitince <b>Yazdır / PDF</b> ile indirin. Bu bağlantıyı müşteriye göndermeyin: açan herkes değerleri
          değiştirebilir.
        </div>
        <span className={classes.editStatus} role="status">
          <StatusText status={status} hasEdits={hasEdits} />
        </span>
      </div>
      <details className={classes.editPanel}>
        <summary>Üst bilgiler ve not</summary>
        <div className={classes.editGrid}>
          {HEADER_TEXTS.map(([key, label]) => (
            <TextInput
              key={`${key}:${current[key] ?? ''}`}
              size="xs"
              label={label}
              defaultValue={current[key] || ''}
              classNames={{ input: editedClass(key) }}
              onBlur={(e) => commitValue(key, e.currentTarget.value, false)}
              onKeyDown={commitOnEnter}
            />
          ))}
          {HEADER_DATES.map(([key, label]) => (
            <TextInput
              key={`${key}:${current[key] ?? ''}`}
              size="xs"
              label={label}
              inputMode="numeric"
              maxLength={10}
              placeholder={DATE_ENTRY_PLACEHOLDER}
              defaultValue={formatDMY(current[key])}
              error={invalid.has(key)}
              classNames={{ input: editedClass(key) }}
              // The same day-first mask as the grid's date cells.
              onInput={(e) => maskDateInput(e.currentTarget)}
              onBlur={(e) => commitValue(key, e.currentTarget.value, true)}
              onKeyDown={commitOnEnter}
            />
          ))}
          {HEADER_WDS.map(([key, label]) => {
            const auto = view[key] == null ? 'otomatik' : `otomatik: ${view[key]}`;
            const own = hasOwn(header, key) && header[key] != null ? String(header[key]) : '';
            return (
              <TextInput
                key={`${key}:${own}`}
                size="xs"
                type="number"
                step="any"
                label={`${label} (iş günü)`}
                defaultValue={own}
                placeholder={auto}
                classNames={{ input: editedClass(key) }}
                onBlur={(e) => commitWd(key, e.currentTarget.value)}
                onKeyDown={commitOnEnter}
              />
            );
          })}
        </div>
        <Textarea
          key={`note:${header.note ?? ''}`}
          className={classes.editNote}
          size="xs"
          rows={2}
          label="Not (PDF'te başlığın altında görünür)"
          defaultValue={header.note || ''}
          classNames={{ input: editedClass('note') }}
          onBlur={(e) => commitNote(e.currentTarget.value)}
        />
        <div className={classes.editFoot}>
          <span className={classes.editHint}>
            İş günü farkları boş bırakılırsa tarihlerden hesaplanır. Bir değeri eskisine döndürmek için orijinal
            değeri yazmanız yeterli.
          </span>
          <Button
            size="compact-sm"
            variant="default"
            leftSection={<FaIcon icon="fas fa-rotate-left" />}
            onClick={() => void reset()}
          >
            Tüm değişiklikleri geri al
          </Button>
        </div>
      </details>
    </section>
  );
}
