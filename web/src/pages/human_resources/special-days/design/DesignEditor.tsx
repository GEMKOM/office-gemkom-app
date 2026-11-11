import { Button, SegmentedControl, Switch, TextInput, Textarea } from '@mantine/core';
import { useMemo, useRef, useState } from 'react';
import {
  useCelebrationTemplates,
  useCompanyDays,
  useSaveSpecialDay,
  useSpecialDayCalendar,
  useSpecialDaySettings,
  useUpdateCelebrationTemplate,
  useUpdateSpecialDaySettings,
  type OccasionPhase,
  type ShowOn,
} from '@/api/general/specialDays';
import { formatDate } from '@/lib/format';
import { isoDate } from '@/lib/workdays';
import { confirm, errorMessage, notify, Panel, PendingValue, StatusBadge } from '@/ui';
import { DesignControls } from './DesignControls';
import { DesignPreview } from './DesignPreview';
import css from './design.module.css';
import {
  dayPayloadFromForm,
  defaultForm,
  designItems,
  formFromItem,
  formsEqual,
  itemKey,
  previewKicker,
  renderPhase,
  sampleContext,
  templatePayloadFromForm,
  whenHint,
  type DesignForm,
  type DesignItem,
} from './designModel';

const SHOW_ON: { value: ShowOn; label: string }[] = [
  { value: 'before', label: 'Önceki iş günü' },
  { value: 'day', label: 'Günün kendisi' },
  { value: 'both', label: 'İkisi de' },
];

const DAY_TOKENS = [
  '{first_name}',
  '{full_name}',
  '{name}',
  '{years}',
  '{year}',
  '{tarih}',
  '{tatil_gunleri}',
  '{donus_gunu}',
];

function tokensFor(item: DesignItem): string[] {
  if (item.type === 'day') return DAY_TOKENS;
  if (item.kind === 'work_anniversary') return ['{first_name}', '{full_name}', '{years}'];
  if (item.kind === 'public_holiday') return ['{first_name}', '{full_name}', '{holiday_name}'];
  return ['{first_name}', '{full_name}'];
}

export interface DesignEditorProps {
  /** The day to open first, e.g. from the year list ('day:12'). */
  initialKey?: string | null;
  onPreview: (date: string) => void;
}

/**
 * Tasarım: every day's welcome and band. A day list on the left, the look and
 * texts in the middle, a live welcome and band on the right.
 */
export function DesignEditor({ initialKey, onPreview }: DesignEditorProps) {
  const today = isoDate(new Date());
  const year = Number(today.slice(0, 4));
  const days = useCompanyDays(null);
  const templates = useCelebrationTemplates();
  const calendar = useSpecialDayCalendar(year);
  const settings = useSpecialDaySettings();
  const saveSettings = useUpdateSpecialDaySettings();
  const saveDay = useSaveSpecialDay();
  const saveTemplate = useUpdateCelebrationTemplate();

  const items = useMemo(
    () => designItems(days.data ?? [], templates.data ?? []),
    [days.data, templates.data],
  );
  const [selectedKey, setSelectedKey] = useState<string | null>(initialKey ?? null);
  const selected =
    items.find((i) => itemKey(i) === selectedKey) ?? (selectedKey ? undefined : items[0]);
  const selectedItemKey = selected ? itemKey(selected) : null;

  // The stored day is the baseline; edits live in a draft for that day only,
  // so a save (which refetches the day) leaves nothing dirty behind.
  const baseline = useMemo(() => (selected ? formFromItem(selected) : null), [selected]);
  const [draft, setDraft] = useState<{ key: string; form: DesignForm } | null>(null);
  const form = draft && draft.key === selectedItemKey ? draft.form : baseline;
  const [phaseState, setPhaseState] = useState<{ key: string; phase: OccasionPhase } | null>(null);
  const phase: OccasionPhase =
    phaseState && phaseState.key === selectedItemKey
      ? phaseState.phase
      : selected?.type === 'day'
        ? 'before'
        : 'on';
  const setPhase = (next: OccasionPhase) =>
    selectedItemKey && setPhaseState({ key: selectedItemKey, phase: next });

  const dirty = Boolean(form && baseline && !formsEqual(form, baseline));

  const choose = async (item: DesignItem) => {
    if (selected && itemKey(item) === itemKey(selected)) return;
    if (dirty) {
      const ok = await confirm({
        title: 'Kaydedilmemiş değişiklikler',
        message: 'Bu gündeki değişiklikler kaydedilmedi. Yine de başka güne geçilsin mi?',
        confirmLabel: 'Değişiklikleri Bırak',
      });
      if (!ok) return;
    }
    setDraft(null);
    setSelectedKey(itemKey(item));
  };

  if (days.isPending || templates.isPending) {
    return (
      <Panel>
        <PendingValue />
      </Panel>
    );
  }
  if (days.isError || templates.isError) {
    return (
      <Panel>
        <p className={css.muted}>Özel günler yüklenemedi.</p>
      </Panel>
    );
  }
  if (!selected || !form || !selectedItemKey) {
    return (
      <Panel>
        <p className={css.muted}>{selectedKey ? 'Bu gün bulunamadı.' : 'Düzenlenecek gün yok.'}</p>
      </Panel>
    );
  }

  const row =
    selected.type === 'day' ? (calendar.data ?? []).find((r) => r.id === selected.id) : undefined;
  const ctx = sampleContext(selected, row, year);
  const shownPhase: OccasionPhase =
    selected.type === 'template' ? 'on' : phase === 'return' && !form.return_enabled ? 'on' : phase;
  const rendered = renderPhase(form, shownPhase, ctx);
  const kicker = previewKicker(selected, row, shownPhase, year);
  const previewDate = row ? row.display_date || row.before_date || row.date : null;
  const saving = saveDay.isPending || saveTemplate.isPending;
  const set = (patch: Partial<DesignForm>) =>
    setDraft({ key: selectedItemKey, form: { ...form, ...patch } });

  const save = () => {
    const done = {
      onSuccess: () => notify.success(`${selected.name} kaydedildi.`),
      onError: (error: unknown) => notify.error(errorMessage(error, 'Kaydedilemedi.')),
    };
    if (selected.type === 'day') {
      saveDay.mutate({ id: selected.id, input: dayPayloadFromForm(form) }, done);
    } else {
      saveTemplate.mutate({ kind: selected.kind, input: templatePayloadFromForm(form) }, done);
    }
  };

  const activeBadge = selected.type === 'day' ? form.is_active : form.show_popup;

  return (
    <div className={css.layout}>
      <Panel title="Günler" padded={false} className={css.listPanel}>
        <ul className={css.dayList} aria-label="Günler">
          {items.map((item) => {
            const on = itemKey(item) === itemKey(selected);
            return (
              <li key={itemKey(item)}>
                <button
                  type="button"
                  className={css.dayRow}
                  data-on={on || undefined}
                  data-off={!item.active || undefined}
                  aria-current={on || undefined}
                  onClick={() => void choose(item)}
                >
                  <span className={css.dayChip} style={{ background: item.tone }} />
                  <span className={css.dayName}>{item.name}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </Panel>

      <Panel
        title={selected.name}
        className={css.formPanel}
        actions={
          <StatusBadge color={activeBadge ? 'green' : 'grey'}>
            {activeBadge ? 'Açık' : 'Kapalı'}
          </StatusBadge>
        }
        footer={
          <div className={css.footer}>
            <Button
              variant="default"
              onClick={() => setDraft({ key: selectedItemKey, form: defaultForm(selected, form) })}
              disabled={saving}
            >
              Varsayılana Dön
            </Button>
            <div className={css.footerRight}>
              <Button
                variant="default"
                leftSection={<i className="fas fa-eye" aria-hidden />}
                disabled={!previewDate || dirty || !form.is_active}
                title={
                  dirty
                    ? 'Önce kaydedin'
                    : !previewDate
                      ? 'Bu gün için önizlenecek bir tarih yok'
                      : undefined
                }
                onClick={() => previewDate && onPreview(previewDate)}
              >
                Bu Günü Önizle
              </Button>
              <Button
                leftSection={<i className="fas fa-save" aria-hidden />}
                onClick={save}
                loading={saving}
                disabled={!dirty || !form.on.title.trim()}
              >
                Kaydet
              </Button>
            </div>
          </div>
        }
      >
        <div className={css.form}>
          <DesignControls design={form.design} onChange={(design) => set({ design })} />

          <div className={css.twoCols}>
            <TextInput
              label="Büyük sayı"
              description="Bayrak düzeninde; boş bırakılabilir"
              placeholder="{years}"
              value={form.design.numeral}
              maxLength={20}
              classNames={{ input: css.mono }}
              onChange={(e) => set({ design: { ...form.design, numeral: e.currentTarget.value } })}
            />
            <TextInput
              label="Buton"
              value={form.design.cta}
              maxLength={40}
              onChange={(e) => set({ design: { ...form.design, cta: e.currentTarget.value } })}
            />
          </div>

          <TextsSection
            item={selected}
            form={form}
            phase={shownPhase}
            onPhase={setPhase}
            onChange={set}
          />

          {selected.type === 'day' ? (
            <div className={css.field}>
              <span className={css.label} id="design-when">
                Ne zaman gösterilsin
              </span>
              <div className={css.whenGrid} role="radiogroup" aria-labelledby="design-when">
                {SHOW_ON.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={form.show_on === option.value}
                    className={css.choice}
                    data-on={form.show_on === option.value || undefined}
                    onClick={() => set({ show_on: option.value })}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <span className={css.hint} data-testid="when-hint">
                {whenHint(selected, row, form.show_on)}
              </span>
            </div>
          ) : (
            <span className={css.hint}>{whenHint(selected, row, form.show_on)}</span>
          )}

          <div className={css.switches}>
            {selected.type === 'day' ? (
              <Switch
                label="Bu günü kullan"
                checked={form.is_active}
                onChange={(e) => set({ is_active: e.currentTarget.checked })}
              />
            ) : null}
            <Switch
              label="Karşılama ekranını göster"
              checked={form.show_popup}
              onChange={(e) => set({ show_popup: e.currentTarget.checked })}
            />
            <Switch
              label="Bantı bu renge boya"
              checked={form.color_band}
              onChange={(e) => set({ color_band: e.currentTarget.checked })}
            />
            {selected.type === 'day' ? (
              <>
                <Switch
                  label="Tatil boyunca temayı koru"
                  checked={form.keep_theme_during}
                  onChange={(e) => set({ keep_theme_during: e.currentTarget.checked })}
                />
                <Switch
                  label="Dönüş günü mesajı"
                  checked={form.return_enabled}
                  onChange={(e) => {
                    const checked = e.currentTarget.checked;
                    set({ return_enabled: checked });
                    if (checked) setPhase('return');
                  }}
                />
              </>
            ) : null}
            <Switch
              label="Arife yarım gününü tatil say (şirket geneli)"
              checked={settings.data?.arife_is_holiday ?? true}
              disabled={!settings.data || saveSettings.isPending}
              onChange={(e) => {
                const checked = e.currentTarget.checked;
                saveSettings.mutate(
                  { arife_is_holiday: checked },
                  {
                    onSuccess: () =>
                      notify.success(
                        checked
                          ? 'Arife günleri artık tatil sayılıyor.'
                          : 'Arife günleri artık iş günü sayılıyor.',
                      ),
                    onError: (error) => notify.error(errorMessage(error, 'Ayar kaydedilemedi.')),
                  },
                );
              }}
            />
          </div>
        </div>
      </Panel>

      <DesignPreview
        design={form.design}
        kicker={kicker}
        title={rendered.title || selected.name}
        body={rendered.body}
        note={rendered.note}
        numeral={rendered.numeral}
        dateLabel={
          row
            ? formatDate(shownPhase === 'before' && row.before_date ? row.before_date : row.date, {
                day: 'numeric',
                month: 'long',
                weekday: 'long',
              })
            : ''
        }
        colorBand={form.color_band}
      />
    </div>
  );
}

type TextField = 'title' | 'body' | 'note';

function TextsSection({
  item,
  form,
  phase,
  onPhase,
  onChange,
}: {
  item: DesignItem;
  form: DesignForm;
  phase: OccasionPhase;
  onPhase: (phase: OccasionPhase) => void;
  onChange: (patch: Partial<DesignForm>) => void;
}) {
  const slot: 'on' | 'before' | 'ret' =
    phase === 'before' ? 'before' : phase === 'return' ? 'ret' : 'on';
  const texts = form[slot];
  const fallback = slot === 'before' ? form.on : null;
  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const noteRef = useRef<HTMLInputElement>(null);
  const [last, setLast] = useState<TextField>('body');
  const update = (field: TextField, value: string) =>
    onChange({ [slot]: { ...texts, [field]: value } } as Partial<DesignForm>);

  const insert = (token: string) => {
    const field: TextField = slot === 'ret' && last === 'note' ? 'body' : last;
    const el =
      field === 'title' ? titleRef.current : field === 'note' ? noteRef.current : bodyRef.current;
    const current = texts[field];
    const start = el?.selectionStart ?? current.length;
    const end = el?.selectionEnd ?? current.length;
    update(field, current.slice(0, start) + token + current.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const phases =
    item.type === 'day'
      ? [
          { value: 'before', label: 'Önceki iş günü' },
          { value: 'on', label: 'Günün kendisi' },
          ...(form.return_enabled ? [{ value: 'return', label: 'Dönüş günü' }] : []),
        ]
      : null;

  const placeholderFor = (field: TextField) =>
    fallback && fallback[field] ? `Boşsa: ${fallback[field]}` : undefined;

  return (
    <div className={css.field}>
      <div className={css.textsHead}>
        <span className={css.label}>Metinler</span>
        {phases ? (
          <SegmentedControl
            size="xs"
            value={phase}
            onChange={(value) => onPhase(value as OccasionPhase)}
            data={phases}
            aria-label="Hangi günün metni"
          />
        ) : null}
      </div>
      <TextInput
        ref={titleRef}
        label="Başlık"
        value={texts.title}
        placeholder={placeholderFor('title')}
        maxLength={200}
        onFocus={() => setLast('title')}
        onChange={(e) => update('title', e.currentTarget.value)}
        error={slot === 'on' && !texts.title.trim() ? 'Başlık boş olamaz.' : undefined}
      />
      <Textarea
        ref={bodyRef}
        label="Metin"
        value={texts.body}
        placeholder={placeholderFor('body')}
        rows={3}
        resize="vertical"
        onFocus={() => setLast('body')}
        onChange={(e) => update('body', e.currentTarget.value)}
      />
      {slot !== 'ret' ? (
        <TextInput
          ref={noteRef}
          label="Not"
          description="Başlığın altında küçük bir satır, örn. tatil günleri"
          value={texts.note}
          placeholder={placeholderFor('note')}
          maxLength={200}
          onFocus={() => setLast('note')}
          onChange={(e) => update('note', e.currentTarget.value)}
        />
      ) : null}
      <div className={css.tokens}>
        {tokensFor(item).map((token) => (
          <button
            key={token}
            type="button"
            className={css.token}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => insert(token)}
            aria-label={`${token} ekle`}
          >
            {token}
          </button>
        ))}
      </div>
    </div>
  );
}
