import {
  Button,
  Grid,
  NumberInput,
  SegmentedControl,
  Select,
  Switch,
  TextInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useState } from 'react';
import {
  useCompanyDays,
  useDeleteSpecialDay,
  useSaveSpecialDay,
  type OccasionTheme,
  type SpecialDay,
  type SpecialDayCategory,
  type SpecialDayInput,
} from '@/api/general/specialDays';
import { isoDate } from '@/lib/workdays';
import {
  FormModal,
  ModalSection,
  Panel,
  PendingValue,
  StatusBadge,
  confirm,
  errorMessage,
  notify,
  type StatusFamily,
} from '@/ui';
import { GreetingFields } from './GreetingFields';
import css from './SpecialDaysPreviewPage.module.css';
import {
  CATEGORY_LABEL,
  DAY_PLACEHOLDERS,
  DEFAULT_THEME,
  MONTHS,
  SAMPLE_PERSON,
  THEME_LABEL,
  isValidMonthDay,
  nextOccurrence,
  whenLabel,
} from './specialDayText';

const CATEGORY_FAMILY: Record<SpecialDayCategory, StatusFamily> = {
  company: 'purple',
  national: 'red',
  religious: 'green',
  international: 'blue',
};

type ActiveFilter = 'all' | 'active' | 'inactive';
const FILTER_VALUE: Record<ActiveFilter, boolean | null> = {
  all: null,
  active: true,
  inactive: false,
};

interface Saved {
  id: number;
  name: string;
  date: string | null;
  is_active: boolean;
}

/** The day whose editor is open: a row, a new one, or none. */
export type DayEditing = SpecialDay | 'new' | null;

export interface CompanyDaysPanelProps {
  /** Starts the app-wide preview of `date` (the page also navigates home). */
  onPreview: (date: string) => void;
  /** Held by the page so the year list can open a day's editor too. */
  editing: DayEditing;
  onEditingChange: (editing: DayEditing) => void;
}

/** Şirket özel günleri: HR adds, edits and removes the company's own days. */
export function CompanyDaysPanel({
  onPreview,
  editing,
  onEditingChange: setEditing,
}: CompanyDaysPanelProps) {
  const [filter, setFilter] = useState<ActiveFilter>('all');
  const days = useCompanyDays(FILTER_VALUE[filter]);
  const remove = useDeleteSpecialDay();
  const [saved, setSaved] = useState<Saved | null>(null);
  const today = isoDate(new Date());
  const rows = days.data ?? [];

  const askDelete = async (row: SpecialDay) => {
    const ok = await confirm({
      title: 'Özel Günü Sil',
      message: `${row.name} silinsin mi? Bu işlem geri alınamaz.`,
      details: whenLabel(row),
      confirmLabel: 'Sil',
      icon: 'fas fa-trash',
      danger: true,
    });
    if (!ok) return;
    remove.mutate(row.id, {
      onSuccess: () => {
        notify.success(`${row.name} silindi.`);
        if (saved?.id === row.id) setSaved(null);
      },
      onError: (error) => notify.error(errorMessage(error, 'Özel gün silinemedi.')),
    });
  };

  return (
    <Panel
      title="Şirket Özel Günleri"
      icon="fas fa-calendar-check"
      padded={false}
      actions={
        <>
          <SegmentedControl
            size="xs"
            value={filter}
            onChange={(value) => setFilter(value as ActiveFilter)}
            data={[
              { value: 'all', label: 'Tümü' },
              { value: 'active', label: 'Aktif' },
              { value: 'inactive', label: 'Pasif' },
            ]}
            aria-label="Duruma göre süz"
          />
          <Button
            size="compact-sm"
            leftSection={<i className="fas fa-plus" aria-hidden />}
            onClick={() => setEditing('new')}
          >
            Yeni Özel Gün
          </Button>
        </>
      }
    >
      {saved ? (
        <div className={`${css.active} ${css.saved}`} data-testid="day-saved">
          <span>
            <strong>{saved.name}</strong> kaydedildi.
            {saved.is_active ? '' : ' Pasif olduğu için uygulamada görünmez.'}
          </span>
          <span className={css.savedActions}>
            {saved.is_active && saved.date ? (
              <Button
                size="compact-sm"
                leftSection={<i className="fas fa-eye" aria-hidden />}
                onClick={() => onPreview(saved.date as string)}
              >
                Bu Günü Önizle
              </Button>
            ) : null}
            <Button size="compact-sm" variant="default" onClick={() => setSaved(null)}>
              Kapat
            </Button>
          </span>
        </div>
      ) : null}
      {days.isPending ? (
        <div className={css.empty}>
          <PendingValue />
        </div>
      ) : days.isError ? (
        <p className={css.empty}>Şirket özel günleri yüklenemedi.</p>
      ) : rows.length === 0 ? (
        <p className={css.empty}>
          {filter === 'all'
            ? 'Henüz şirket özel günü eklenmedi.'
            : filter === 'active'
              ? 'Aktif şirket özel günü yok.'
              : 'Pasif şirket özel günü yok.'}
        </p>
      ) : (
        <ul className={css.list}>
          {rows.map((row) => {
            const previewDate = row.is_active ? nextOccurrence(row, today) : null;
            const isPast = Boolean(row.date && row.date < today);
            return (
              <li key={row.id} className={css.row} data-testid={`special-day-${row.id}`}>
                <span className={css.rowText}>
                  <span className={css.rowName}>{row.name}</span>
                  <span className={css.rowDate}>
                    {whenLabel(row)}
                    {isPast ? ' (geçti)' : ''}
                  </span>
                </span>
                <StatusBadge color={CATEGORY_FAMILY[row.category] ?? 'grey'}>
                  {CATEGORY_LABEL[row.category] ?? row.category}
                </StatusBadge>
                {row.is_active ? null : <StatusBadge color="grey">Pasif</StatusBadge>}
                <span className={css.rowActions}>
                  {previewDate ? (
                    <Button
                      size="compact-sm"
                      variant="default"
                      onClick={() => onPreview(previewDate)}
                      aria-label={`${row.name} önizle`}
                    >
                      Önizle
                    </Button>
                  ) : null}
                  <Button
                    size="compact-sm"
                    variant="default"
                    onClick={() => setEditing(row)}
                    aria-label={`${row.name} düzenle`}
                  >
                    <i className="fas fa-pen" aria-hidden />
                  </Button>
                  <Button
                    size="compact-sm"
                    variant="default"
                    color="red"
                    onClick={() => void askDelete(row)}
                    aria-label={`${row.name} sil`}
                    disabled={remove.isPending && remove.variables === row.id}
                  >
                    <i className="fas fa-trash" aria-hidden />
                  </Button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {editing ? (
        <SpecialDayFormModal
          key={editing === 'new' ? 'new' : editing.id}
          day={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(row) =>
            setSaved({
              id: row.id,
              name: row.name,
              date: nextOccurrence(row, today),
              is_active: row.is_active,
            })
          }
        />
      ) : null}
    </Panel>
  );
}

type Repeat = 'yearly' | 'once';

interface DayForm {
  name: string;
  category: SpecialDayCategory;
  repeat: Repeat;
  month: string;
  day: number | string;
  date: string;
  /** 'auto' follows the category. */
  theme: OccasionTheme | 'auto';
  popup_title: string;
  popup_body: string;
  show_popup: boolean;
  is_active: boolean;
}

function initialValues(day: SpecialDay | null): DayForm {
  if (!day) {
    return {
      name: '',
      category: 'company',
      repeat: 'yearly',
      month: '',
      day: '',
      date: '',
      theme: 'auto',
      popup_title: '',
      popup_body: '',
      show_popup: true,
      is_active: true,
    };
  }
  return {
    name: day.name,
    category: day.category,
    repeat: day.date ? 'once' : 'yearly',
    month: day.month ? String(day.month) : '',
    day: day.day ?? '',
    date: day.date ?? '',
    theme: day.theme === DEFAULT_THEME[day.category] ? 'auto' : day.theme,
    popup_title: day.popup_title,
    popup_body: day.popup_body,
    show_popup: day.show_popup,
    is_active: day.is_active,
  };
}

/** The request body; one side of month/day vs date is sent as null so it clears. */
export function dayPayload(values: DayForm, isNew: boolean): SpecialDayInput {
  const payload: SpecialDayInput = {
    name: values.name.trim(),
    category: values.category,
    popup_title: values.popup_title.trim(),
    popup_body: values.popup_body.trim(),
    show_popup: values.show_popup,
    is_active: values.is_active,
  };
  if (values.repeat === 'yearly') {
    payload.month = Number(values.month);
    payload.day = Number(values.day);
    payload.date = null;
  } else {
    payload.date = values.date;
    payload.month = null;
    payload.day = null;
  }
  if (values.theme !== 'auto') payload.theme = values.theme;
  else if (!isNew) payload.theme = DEFAULT_THEME[values.category];
  return payload;
}

function SpecialDayFormModal({
  day,
  onClose,
  onSaved,
}: {
  day: SpecialDay | null;
  onClose: () => void;
  onSaved: (row: SpecialDay) => void;
}) {
  const save = useSaveSpecialDay();
  const form = useForm<DayForm>({
    initialValues: initialValues(day),
    validate: {
      name: (v) => (v.trim() ? null : 'Ad zorunludur.'),
      month: (v, values) => (values.repeat === 'yearly' && !v ? 'Ay seçin.' : null),
      day: (v, values) => {
        if (values.repeat !== 'yearly') return null;
        if (v === '' || v === null) return 'Gün girin.';
        if (values.month && !isValidMonthDay(Number(values.month), Number(v))) {
          return 'Bu ayda böyle bir gün yok.';
        }
        return null;
      },
      date: (v, values) => (values.repeat === 'once' && !v ? 'Tarih seçin.' : null),
    },
  });
  const values = form.values;
  const theme = values.theme === 'auto' ? DEFAULT_THEME[values.category] : values.theme;

  const submit = (input: DayForm) => {
    save.mutate(
      { id: day?.id ?? null, input: dayPayload(input, day === null) },
      {
        onSuccess: (row) => {
          notify.success(`${row.name} kaydedildi.`);
          onSaved(row);
          onClose();
        },
      },
    );
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title={day ? 'Özel Günü Düzenle' : 'Yeni Özel Gün'}
      subtitle={day ? day.name : 'Şirket için her yıl ya da bir kez kutlanan gün'}
      icon={day ? 'fas fa-pen' : 'fas fa-plus'}
      size="xl"
      onSubmit={form.onSubmit(submit)}
      submitting={save.isPending}
      error={save.error}
    >
      <ModalSection title="Gün" icon="fas fa-calendar-day">
        <Grid gap="sm">
          <Grid.Col span={{ base: 12, sm: 8 }}>
            <TextInput label="Ad" required maxLength={120} {...form.getInputProps('name')} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 4 }}>
            <Select
              label="Kategori"
              allowDeselect={false}
              data={(Object.keys(CATEGORY_LABEL) as SpecialDayCategory[]).map((value) => ({
                value,
                label: CATEGORY_LABEL[value],
              }))}
              {...form.getInputProps('category')}
            />
          </Grid.Col>
          <Grid.Col span={12}>
            <SegmentedControl
              value={values.repeat}
              onChange={(value) => form.setFieldValue('repeat', value as Repeat)}
              data={[
                { value: 'yearly', label: 'Her yıl' },
                { value: 'once', label: 'Bir kez' },
              ]}
              aria-label="Tekrar"
            />
          </Grid.Col>
          {values.repeat === 'yearly' ? (
            <>
              <Grid.Col span={{ base: 6, sm: 4 }}>
                <NumberInput
                  label="Gün"
                  min={1}
                  max={31}
                  allowDecimal={false}
                  allowNegative={false}
                  {...form.getInputProps('day')}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 6, sm: 4 }}>
                <Select
                  label="Ay"
                  placeholder="Ay seçin"
                  data={MONTHS.map((label, i) => ({ value: String(i + 1), label }))}
                  {...form.getInputProps('month')}
                />
              </Grid.Col>
            </>
          ) : (
            <Grid.Col span={{ base: 12, sm: 4 }}>
              <TextInput type="date" label="Tarih" {...form.getInputProps('date')} />
            </Grid.Col>
          )}
          <Grid.Col span={{ base: 12, sm: 4 }}>
            <Select
              label="Tema"
              allowDeselect={false}
              data={[
                {
                  value: 'auto',
                  label: `Kategoriye göre (${THEME_LABEL[DEFAULT_THEME[values.category]]})`,
                },
                ...(Object.keys(THEME_LABEL) as OccasionTheme[]).map((value) => ({
                  value,
                  label: THEME_LABEL[value],
                })),
              ]}
              {...form.getInputProps('theme')}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 4 }}>
            <Switch
              mt={{ base: 0, sm: 30 }}
              label="Aktif"
              {...form.getInputProps('is_active', { type: 'checkbox' })}
            />
          </Grid.Col>
        </Grid>
      </ModalSection>
      <ModalSection title="Karşılama" icon="fas fa-envelope-open-text">
        <GreetingFields
          title={values.popup_title}
          body={values.popup_body}
          onChange={(field, value) =>
            form.setFieldValue(field === 'title' ? 'popup_title' : 'popup_body', value)
          }
          titleFallback={values.name.trim()}
          placeholders={DAY_PLACEHOLDERS}
          sample={{ ...SAMPLE_PERSON, name: values.name.trim() }}
          theme={theme}
        />
        <Switch
          mt="md"
          label="Gün açılışında karşılama ekranını göster"
          description="Kapalıyken bant rengi yine değişir, tam ekran karşılama açılmaz."
          {...form.getInputProps('show_popup', { type: 'checkbox' })}
        />
      </ModalSection>
    </FormModal>
  );
}
