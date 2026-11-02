import type { LegacyUser } from '@legacy/authService.js';
import {
  Alert,
  Grid,
  MultiSelect,
  NumberInput,
  Radio,
  Select,
  Stack,
  TextInput,
  Textarea,
  Group,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { useState, type ReactNode } from 'react';
import { z } from 'zod';
import { useJobOrderOptions, useUsers, type UserOption } from '@/api';
import {
  DEFECT_TYPE_CHOICES,
  DISPOSITION_CHOICES,
  SEVERITY_CHOICES,
  useCreateNcr,
  useNcrGroups,
  useUpdateNcr,
  type Choice,
  type Ncr,
  type NcrGroup,
  type NcrInput,
} from '@/api/quality-control/ncrs';
import { FaIcon, FormModal, ModalSection, notify } from '@/ui';
import { NcrFileStager, uploadStagedFiles, type StagedFile } from './NcrFileStager';
import { NcrContext, numberedTitle } from './NcrPaperForm';
import { statusLabel } from './ncrRules';

export const REQUIRED = 'Bu alan gereklidir';

const required = z.string().min(1, REQUIRED);

function ncrSchema(editing: boolean) {
  return z.object({
    job_order: editing ? z.string() : required,
    // Legacy EditModal: required and >= 1, one message for both.
    affected_quantity: z
      .union([z.number(), z.string()])
      .refine((v) => v !== '' && Number(v) >= 1, REQUIRED),
    detected_by: required,
    assigned_team: editing ? z.string() : required,
    assigned_members: z.array(z.string()),
    title: required,
    description: required,
    defect_type: required,
    severity: required,
    disposition: required,
    root_cause: z.string(),
    corrective_action: z.string(),
  });
}

export type NcrFormValues = z.infer<ReturnType<typeof ncrSchema>>;

export interface PersonOption {
  value: string;
  label: string;
}

function personName(user: {
  full_name?: unknown;
  first_name?: unknown;
  last_name?: unknown;
  username?: unknown;
}) {
  return (
    String(user.full_name || '') ||
    [user.first_name, user.last_name].filter(Boolean).join(' ') ||
    String(user.username || '')
  );
}

/** Dropdown options for users, keeping selected users who are no longer active. */
export function userOptions(
  users: UserOption[],
  selected: { id?: number | null; name?: string | null }[] = [],
): PersonOption[] {
  const options = users.map((u) => ({ value: String(u.id), label: personName(u) }));
  const known = new Set(options.map((o) => o.value));
  for (const { id, name } of selected) {
    if (id !== null && id !== undefined && !known.has(String(id))) {
      options.push({ value: String(id), label: name || `#${id}` });
      known.add(String(id));
    }
  }
  return options.sort((a, b) => a.label.localeCompare(b.label, 'tr'));
}

/** Group options; an old/unknown assigned_team value stays selectable instead of being dropped. */
export function groupOptions(groups: NcrGroup[], legacyValue?: unknown): PersonOption[] {
  const options = groups.map((g) => ({
    value: String(g.id),
    label: g.display_name || g.name || `#${g.id}`,
  }));
  if (legacyValue !== null && legacyValue !== undefined && legacyValue !== '') {
    const legacy = String(legacyValue);
    if (!options.some((o) => o.value === legacy)) options.unshift({ value: legacy, label: legacy });
  }
  return options;
}

function toPk(value: string): number | null {
  const pk = Number.parseInt(value, 10);
  return Number.isFinite(pk) ? pk : null;
}

/** Report the post-save uploads; the NCR itself is saved either way. */
export function notifyStagedUploadResult({
  uploaded,
  failed,
}: {
  uploaded: number;
  failed: string[];
}) {
  if (failed.length) {
    notify.warning(
      `${uploaded} dosya yüklendi, ${failed.length} dosya yüklenemedi: ${failed.join(', ')}`,
    );
  } else if (uploaded) {
    notify.success(`${uploaded} dosya yüklendi`);
  }
}

export function RadioChoices({
  choices,
  label,
  ...props
}: {
  choices: Choice[];
  label: string;
  value?: string;
  onChange?: (value: string) => void;
  error?: ReactNode;
}) {
  return (
    <Radio.Group label={label} withAsterisk {...props}>
      <Group gap="md" mt={6}>
        {choices.map((c) => (
          <Radio key={c.value} value={c.value} label={c.label} />
        ))}
      </Group>
    </Radio.Group>
  );
}

export interface NcrFormModalProps {
  currentUser: LegacyUser;
  /** The full NCR when editing; without it the modal creates one. */
  ncr?: Ncr | null;
  existingFiles?: { name: string; typeLabel: string }[];
  onClose: () => void;
}

/** Port of showCreateNCRModal / showEditNCRModal. Mount it when it should open. */
export function NcrFormModal({ currentUser, ncr, existingFiles = [], onClose }: NcrFormModalProps) {
  const editing = Boolean(ncr);
  const users = useUsers();
  const groups = useNcrGroups();
  // Creating takes open job orders only; the list filter shows completed ones too.
  const jobOrders = useJobOrderOptions({}, { enabled: !editing });
  const create = useCreateNcr();
  const update = useUpdateNcr();
  const [staged, setStaged] = useState<StagedFile[]>([]);
  const [uploading, setUploading] = useState(false);

  const form = useForm<NcrFormValues>({
    initialValues: {
      job_order: ncr?.job_order ?? '',
      affected_quantity: ncr?.affected_quantity ?? 1,
      detected_by: ncr
        ? ncr.detected_by != null
          ? String(ncr.detected_by)
          : ''
        : String(currentUser.id ?? ''),
      assigned_team: ncr?.assigned_team != null ? String(ncr.assigned_team) : '',
      assigned_members: (ncr?.assigned_members ?? []).map(String),
      title: ncr?.title ?? '',
      description: ncr?.description ?? '',
      defect_type: ncr?.defect_type ?? '',
      severity: ncr?.severity ?? '',
      disposition: ncr?.disposition || 'pending',
      root_cause: ncr?.root_cause ?? '',
      corrective_action: ncr?.corrective_action ?? '',
    },
    validate: zod4Resolver(ncrSchema(editing)),
  });

  const userList = users.data ?? [];
  const me = { id: currentUser.id, name: personName(currentUser) };
  const detectedByOptions = editing
    ? userOptions(userList, [{ id: ncr?.detected_by, name: ncr?.detected_by_name }])
    : userOptions(userList, [me]);
  const memberOptions = editing
    ? userOptions(userList, ncr?.assigned_members_data ?? [])
    : userOptions(userList, [me]);
  const teamOptions = editing
    ? groupOptions(groups.data ?? [], ncr?.assigned_team)
    : groupOptions(groups.data ?? []);
  const jobOrderOptions = (jobOrders.data ?? []).map((jo) => ({
    value: jo.job_no,
    label: `${jo.job_no}${jo.title ? ` - ${jo.title}` : ''}`,
  }));

  const save = async (values: NcrFormValues) => {
    const members = values.assigned_members.map(toPk).filter((pk): pk is number => pk !== null);
    try {
      if (!ncr) {
        const groupPk = toPk(values.assigned_team);
        if (groupPk === null) {
          notify.error('Sorumlu grup seçilmelidir');
          return;
        }
        const detectedBy = toPk(values.detected_by);
        const payload: NcrInput = {
          job_order: values.job_order,
          title: values.title.trim(),
          description: values.description.trim(),
          defect_type: values.defect_type,
          severity: values.severity,
          affected_quantity: Number.parseInt(String(values.affected_quantity), 10),
          detected_by: detectedBy ?? currentUser.id,
          assigned_team: groupPk,
          assigned_members: members,
          disposition: values.disposition || 'pending',
        };
        const created = await create.mutateAsync(payload);
        notify.success(`${created?.ncr_number || 'NCR'} oluşturuldu`);
        if (staged.length && created?.id) {
          setUploading(true);
          notifyStagedUploadResult(await uploadStagedFiles(created.id, staged));
        }
      } else {
        const payload: NcrInput = {
          title: values.title.trim(),
          description: values.description.trim(),
          defect_type: values.defect_type,
          severity: values.severity,
          affected_quantity: Number.parseInt(String(values.affected_quantity), 10),
          root_cause: values.root_cause.trim(),
          corrective_action: values.corrective_action.trim(),
          disposition: values.disposition,
          assigned_members: members,
        };
        const detectedBy = toPk(values.detected_by);
        if (detectedBy !== null) payload.detected_by = detectedBy;
        // The group PK, never a legacy name; an empty pick leaves the group as it is.
        const groupPk = toPk(values.assigned_team);
        if (groupPk !== null) payload.assigned_team = groupPk;
        await update.mutateAsync({ id: ncr.id, data: payload });
        notify.success('NCR başarıyla güncellendi');
        if (staged.length) {
          setUploading(true);
          notifyStagedUploadResult(await uploadStagedFiles(ncr.id, staged));
        }
      }
      onClose();
    } catch (error) {
      notify.error(error, {
        fallback: ncr ? 'NCR güncellenirken hata oluştu' : 'NCR oluşturulurken hata oluştu',
      });
    } finally {
      setUploading(false);
    }
  };

  const half = { base: 12, sm: 4 };
  return (
    <FormModal
      opened
      onClose={onClose}
      title={ncr ? `${ncr.ncr_number || `NCR #${ncr.id}`} · Düzenle` : 'Yeni NCR Oluştur'}
      icon={ncr ? 'fas fa-edit' : 'fas fa-plus-circle'}
      size="xl"
      submitLabel={ncr ? 'Kaydet' : 'Oluştur'}
      submitting={create.isPending || update.isPending || uploading}
      onSubmit={form.onSubmit(save)}
    >
      {ncr ? (
        <NcrContext ncr={ncr} statusLabel={statusLabel(ncr)} showDescription={false} />
      ) : (
        <Alert variant="light" color="blue" mb="md" icon={<FaIcon icon="fas fa-info-circle" />}>
          Kök neden ve düzeltici faaliyet (bölüm 3–4), NCR onaya gönderilirken sorumlu grup
          tarafından doldurulur.
        </Alert>
      )}

      <ModalSection title={numberedTitle(1, 'Tanımlama')}>
        <Grid gap="sm">
          {!ncr ? (
            <>
              <Grid.Col span={{ base: 12, sm: 8 }}>
                <Select
                  label="İş Emri"
                  placeholder="İş emri seçin"
                  withAsterisk
                  searchable
                  data={jobOrderOptions}
                  nothingFoundMessage="Sonuç bulunamadı"
                  {...form.getInputProps('job_order')}
                />
              </Grid.Col>
              <Grid.Col span={half}>
                <NumberInput
                  label="Etkilenen Miktar (adet)"
                  withAsterisk
                  min={1}
                  {...form.getInputProps('affected_quantity')}
                />
              </Grid.Col>
            </>
          ) : null}
          <Grid.Col span={half}>
            <Select
              label="Tespit Eden"
              placeholder="Kişi seçin"
              withAsterisk
              searchable
              data={detectedByOptions}
              {...form.getInputProps('detected_by')}
            />
          </Grid.Col>
          {ncr ? (
            <Grid.Col span={{ base: 12, sm: 3 }}>
              <NumberInput
                label="Etkilenen Miktar (adet)"
                withAsterisk
                min={1}
                {...form.getInputProps('affected_quantity')}
              />
            </Grid.Col>
          ) : null}
          <Grid.Col span={ncr ? { base: 12, sm: 5 } : half}>
            <Select
              label="Sorumlu Grup"
              placeholder={ncr ? 'Seçiniz' : 'Grup seçin'}
              withAsterisk={!ncr}
              searchable
              clearable={Boolean(ncr)}
              data={teamOptions}
              description={ncr ? undefined : 'Kök neden ve düzeltici faaliyeti bu grup girer.'}
              {...form.getInputProps('assigned_team')}
            />
          </Grid.Col>
          <Grid.Col span={ncr ? 12 : half}>
            <MultiSelect
              label="Sorumlu Kişiler"
              placeholder={ncr ? 'Kişi seçin (isteğe bağlı)' : 'İsteğe bağlı'}
              searchable
              data={memberOptions}
              description={ncr ? undefined : 'Seçilen kişilere e-posta ile bildirilir.'}
              {...form.getInputProps('assigned_members')}
            />
          </Grid.Col>
        </Grid>
      </ModalSection>

      <ModalSection title={numberedTitle(2, 'Uygunsuzluk Tanımı')}>
        <Stack gap="sm">
          <TextInput
            label="Başlık"
            withAsterisk
            placeholder={
              ncr ? undefined : 'Kısa ve açıklayıcı bir başlık — örn. Poz 01 bükme açısı resim dışı'
            }
            {...form.getInputProps('title')}
          />
          <Textarea
            label="Açıklama"
            withAsterisk
            rows={5}
            placeholder={
              ncr
                ? undefined
                : 'Ne tespit edildi? Ölçülen ve istenen değerler, parça / poz numarası, nerede ve ne zaman'
            }
            {...form.getInputProps('description')}
          />
          <Grid gap="sm">
            <Grid.Col span={{ base: 12, sm: 8 }}>
              <RadioChoices
                label="Kusur Tipi"
                choices={DEFECT_TYPE_CHOICES}
                {...form.getInputProps('defect_type')}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 4 }}>
              <RadioChoices
                label="Önem Derecesi"
                choices={SEVERITY_CHOICES}
                {...form.getInputProps('severity')}
              />
            </Grid.Col>
          </Grid>
        </Stack>
      </ModalSection>

      {ncr ? (
        <ModalSection title={numberedTitle('3–5', 'Kök Neden, Düzeltici Faaliyet ve Karar')}>
          <Grid gap="sm">
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <Textarea
                label="Kök Neden Analizi"
                rows={4}
                placeholder="Sorumlu grup gönderirken doldurur"
                {...form.getInputProps('root_cause')}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <Textarea
                label="Düzeltici Faaliyet"
                rows={4}
                placeholder="Sorumlu grup gönderirken doldurur"
                {...form.getInputProps('corrective_action')}
              />
            </Grid.Col>
            <Grid.Col span={12}>
              <RadioChoices
                label="Karar (Uygunsuz Ürün)"
                choices={DISPOSITION_CHOICES}
                {...form.getInputProps('disposition')}
              />
            </Grid.Col>
          </Grid>
        </ModalSection>
      ) : (
        <ModalSection title={numberedTitle(5, 'Karar (Uygunsuz Ürün)')}>
          <RadioChoices
            label="Etkilenen ürün için karar"
            choices={DISPOSITION_CHOICES}
            {...form.getInputProps('disposition')}
          />
        </ModalSection>
      )}

      <NcrFileStager staged={staged} onChange={setStaged} existingFiles={existingFiles} />
    </FormModal>
  );
}
