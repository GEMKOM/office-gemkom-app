import { Button, Switch } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useState } from 'react';
import {
  useCelebrationTemplates,
  useUpdateCelebrationTemplate,
  type CelebrationTemplate,
  type OccasionTheme,
  type TemplateKind,
} from '@/api/general/specialDays';
import { formatDateTime } from '@/lib/format';
import { FormModal, Panel, PendingValue, StatusBadge, notify } from '@/ui';
import { GreetingFields } from './GreetingFields';
import css from './SpecialDaysPreviewPage.module.css';
import { TEMPLATE_PLACEHOLDERS, TEMPLATE_SAMPLE, renderTemplate } from './specialDayText';

const TEMPLATE_THEME: Record<TemplateKind, OccasionTheme> = {
  birthday: 'birthday',
  work_anniversary: 'anniversary',
  public_holiday: 'national',
};

const TEMPLATE_ICON: Record<TemplateKind, string> = {
  birthday: 'fas fa-cake-candles',
  work_anniversary: 'fas fa-award',
  public_holiday: 'fas fa-flag',
};

const KIND_ORDER: TemplateKind[] = ['birthday', 'work_anniversary', 'public_holiday'];

/** Kutlama metinleri: the greetings for birthdays, work anniversaries and public holidays. */
export function CelebrationTemplatesPanel() {
  const templates = useCelebrationTemplates();
  const [editing, setEditing] = useState<CelebrationTemplate | null>(null);
  const rows = [...(templates.data ?? [])].sort(
    (a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind),
  );

  return (
    <Panel title="Kutlama Metinleri" icon="fas fa-envelope-open-text" padded={false}>
      {templates.isPending ? (
        <div className={css.empty}>
          <PendingValue />
        </div>
      ) : templates.isError ? (
        <p className={css.empty}>Kutlama metinleri yüklenemedi.</p>
      ) : rows.length === 0 ? (
        <p className={css.empty}>Kutlama metni bulunamadı.</p>
      ) : (
        <ul className={css.list}>
          {rows.map((row) => {
            const sample = TEMPLATE_SAMPLE[row.kind] ?? TEMPLATE_SAMPLE.birthday;
            return (
              <li key={row.kind} className={css.row}>
                <i
                  className={`${TEMPLATE_ICON[row.kind] ?? 'fas fa-star'} ${css.rowIcon}`}
                  aria-hidden
                />
                <span className={css.rowText}>
                  <span className={css.rowName}>{row.kind_label}</span>
                  <span className={css.rowLine}>{renderTemplate(row.title, sample)}</span>
                  <span className={css.rowDate}>{renderTemplate(row.body, sample)}</span>
                  {row.updated_at ? (
                    <span className={css.rowMeta}>
                      Son düzenleme {formatDateTime(row.updated_at)}
                    </span>
                  ) : null}
                </span>
                {row.show_popup ? null : <StatusBadge color="grey">Karşılama kapalı</StatusBadge>}
                <Button
                  size="compact-sm"
                  variant="default"
                  leftSection={<i className="fas fa-pen" aria-hidden />}
                  onClick={() => setEditing(row)}
                  aria-label={`${row.kind_label} metnini düzenle`}
                >
                  Düzenle
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {editing ? (
        <TemplateFormModal key={editing.kind} template={editing} onClose={() => setEditing(null)} />
      ) : null}
    </Panel>
  );
}

interface TemplateForm {
  title: string;
  body: string;
  show_popup: boolean;
}

function TemplateFormModal({
  template,
  onClose,
}: {
  template: CelebrationTemplate;
  onClose: () => void;
}) {
  const save = useUpdateCelebrationTemplate();
  const form = useForm<TemplateForm>({
    initialValues: {
      title: template.title,
      body: template.body,
      show_popup: template.show_popup,
    },
    validate: {
      title: (v) => (v.trim() ? null : 'Başlık boş olamaz.'),
    },
  });

  const submit = (values: TemplateForm) => {
    save.mutate(
      {
        kind: template.kind,
        input: {
          title: values.title.trim(),
          body: values.body.trim(),
          show_popup: values.show_popup,
        },
      },
      {
        onSuccess: () => {
          notify.success(`${template.kind_label} metni kaydedildi.`);
          onClose();
        },
      },
    );
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title="Kutlama Metnini Düzenle"
      subtitle={template.kind_label}
      icon={TEMPLATE_ICON[template.kind] ?? 'fas fa-pen'}
      onSubmit={form.onSubmit(submit)}
      submitting={save.isPending}
      error={save.error}
    >
      <GreetingFields
        title={form.values.title}
        body={form.values.body}
        onChange={(field, value) => form.setFieldValue(field, value)}
        titleError={form.errors.title}
        bodyError={form.errors.body}
        placeholders={TEMPLATE_PLACEHOLDERS[template.kind] ?? TEMPLATE_PLACEHOLDERS.birthday}
        sample={TEMPLATE_SAMPLE[template.kind] ?? TEMPLATE_SAMPLE.birthday}
        theme={TEMPLATE_THEME[template.kind] ?? 'company'}
      />
      <Switch
        mt="md"
        label="Gün açılışında karşılama ekranını göster"
        description="Kapalıyken bant rengi yine değişir, tam ekran karşılama açılmaz."
        {...form.getInputProps('show_popup', { type: 'checkbox' })}
      />
    </FormModal>
  );
}
