import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Modal,
  Select,
  Table,
  Text,
  Tooltip,
} from '@mantine/core';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  bulkCreateParts,
  partsKeys,
  partsQueryOptions,
  uploadPartFiles,
  type MachiningPart,
  type PartInput,
  type PartsParams,
} from '@/api/manufacturing/machiningParts';
import { DEFAULT_STALE_TIME } from '@/api/queryClient';
import { useJobOrderOptions } from '@/api/reference/jobOrders';
import { userLabel, useUsers } from '@/api/reference/users';
import { useAuth } from '@/auth/AuthProvider';
import { formatDate } from '@/lib/format';
import {
  DataTable,
  FaIcon,
  FilterBar,
  fromOrdering,
  ModalBody,
  ModalFooter,
  ModalHeader,
  modalClassNames,
  notify,
  PageHeader,
  Panel,
  StatusBadge,
  toOrdering,
  useUrlFilters,
  type CellEdit,
  type DataTableColumn,
  type FilterConfig,
} from '@/ui';
import { exportToExcel } from '@/ui/DataTable/exportExcel';
import classes from '../list/MachiningParts.module.css';

// ---- the entry table (legacy bulk create rows) -------------------------------

/** One row of the entry table; every field but the files is a cell editor. */
export interface TaskDraft {
  id: string;
  name: string;
  job_no: string;
  image_no: string;
  position_no: string;
  quantity: number | null;
  material: string;
  weight_kg: number | null;
  finish_time: string | null;
  description: string;
  files: File[];
}

const FIELD_LABELS = {
  name: 'Ad',
  job_no: 'İş No',
  image_no: 'Resim No',
  position_no: 'Pozisyon No',
  quantity: 'Adet',
  material: 'Malzeme',
  weight_kg: 'Ağırlık (kg)',
  finish_time: 'Bitiş Tarihi',
  description: 'Açıklama',
} as const;

const REQUIRED_FIELDS = ['name', 'job_no', 'quantity', 'finish_time'] as const;
type DraftField = keyof typeof FIELD_LABELS;

let draftSequence = 0;
function emptyDraft(): TaskDraft {
  return {
    id: `draft-${++draftSequence}`,
    name: '',
    job_no: '',
    image_no: '',
    position_no: '',
    quantity: null,
    material: '',
    weight_kg: null,
    finish_time: null,
    description: '',
    files: [],
  };
}

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || String(value).trim() === '';
}

/** Legacy handleBulkCreateSave validation; the messages, or null when the rows are fine. */
export function validateDrafts(rows: readonly TaskDraft[]): string | null {
  const missing: string[] = [];
  rows.forEach((row, index) => {
    for (const field of REQUIRED_FIELDS) {
      if (isBlank(row[field])) missing.push(`Satır ${index + 1}: ${FIELD_LABELS[field]}`);
    }
  });
  if (missing.length) return `Lütfen aşağıdaki zorunlu alanları doldurun:\n${missing.join('\n')}`;

  const errors: string[] = [];
  rows.forEach((row, index) => {
    if (row.quantity !== null && Number.parseInt(String(row.quantity), 10) <= 0) {
      errors.push(`Satır ${index + 1}: Adet 0'dan büyük olmalıdır`);
    }
    if (row.weight_kg !== null && (Number.isNaN(row.weight_kg) || row.weight_kg < 0)) {
      errors.push(`Satır ${index + 1}: Ağırlık geçerli bir pozitif sayı olmalıdır`);
    }
  });
  if (errors.length) return `Lütfen aşağıdaki hataları düzeltin:\n${errors.join('\n')}`;
  return null;
}

/** The bulk-create payload (no operations; they are added later). */
export function draftPayload(rows: readonly TaskDraft[]): PartInput[] {
  return rows.map((row) => ({
    name: row.name,
    job_no: row.job_no,
    image_no: row.image_no || null,
    position_no: row.position_no || null,
    quantity: row.quantity !== null ? Number.parseInt(String(row.quantity), 10) : null,
    material: row.material || null,
    weight_kg: row.weight_kg,
    finish_time: row.finish_time,
    description: row.description || null,
    operations: [],
  }));
}

function multiline(text: string) {
  return <span className={classes.preLine}>{text}</span>;
}

// ---- the "Oluşturduğum Görevler" list ----------------------------------------

const URL_DEFAULTS = {
  key: '',
  name: '',
  job_no: '',
  image_no: '',
  position_no: '',
  finish_time: '',
  finish_time_gte: '',
  finish_time_lte: '',
  has_timer: false,
  exceeded_estimated_hours: false,
  created_by: '',
  page: '1',
  page_size: '20',
  ordering: 'key',
};

type FilterKeys =
  | 'key'
  | 'name'
  | 'job_no'
  | 'image_no'
  | 'position_no'
  | 'finish_time'
  | 'finish_time_gte'
  | 'finish_time_lte'
  | 'has_timer'
  | 'exceeded_estimated_hours'
  | 'created_by';
type FilterState = Record<Exclude<FilterKeys, 'has_timer' | 'exceeded_estimated_hours'>, string> & {
  has_timer: boolean;
  exceeded_estimated_hours: boolean;
};

const EMPTY_FILTERS: FilterState = {
  key: '',
  name: '',
  job_no: '',
  image_no: '',
  position_no: '',
  finish_time: '',
  finish_time_gte: '',
  finish_time_lte: '',
  has_timer: false,
  exceeded_estimated_hours: false,
  created_by: '',
};

/** URL value of created_by meaning "no user filter"; empty means the current user. */
const ANY_CREATOR = 'all';

const filterConfig: FilterConfig<FilterKeys>[] = [
  { type: 'text', key: 'key', label: 'TI No', placeholder: 'TI-001' },
  { type: 'text', key: 'name', label: 'Görev Adı', placeholder: 'Görev adı' },
  {
    type: 'text',
    key: 'job_no',
    label: 'İş No',
    placeholder: 'İş numarası',
    suggestions: 'jobOrders',
  },
  { type: 'text', key: 'image_no', label: 'Resim No', placeholder: 'Resim numarası' },
  { type: 'text', key: 'position_no', label: 'Pozisyon No', placeholder: 'Pozisyon numarası' },
  { type: 'date', key: 'finish_time', label: 'Bitiş Tarihi' },
  { type: 'date', key: 'finish_time_gte', label: 'Bitiş Tarihi (Başlangıç)' },
  { type: 'date', key: 'finish_time_lte', label: 'Bitiş Tarihi (Bitiş)' },
  { type: 'checkbox', key: 'has_timer', label: 'Zamanlayıcı Var' },
  { type: 'checkbox', key: 'exceeded_estimated_hours', label: 'Tahmini Saati Aşan' },
];

/** Legacy buildTaskQuery (without page / ordering). */
export function taskFilterParams(values: FilterState): PartsParams {
  const params: PartsParams = {};
  const key = values.key.trim();
  if (key) params.key = /^\d+$/.test(key) ? `PT-${key}` : key;
  if (values.name.trim()) params.name = values.name.trim();
  if (values.job_no.trim()) params.job_no = values.job_no.trim();
  if (values.image_no.trim()) params.image_no = values.image_no.trim();
  if (values.position_no.trim()) params.position_no = values.position_no.trim();
  if (values.finish_time) params.finish_time = values.finish_time;
  if (values.finish_time_gte) params.finish_time__gte = values.finish_time_gte;
  if (values.finish_time_lte) params.finish_time__lte = values.finish_time_lte;
  if (values.has_timer) params.has_timer = 'true';
  if (values.exceeded_estimated_hours) params.exceeded_estimated_hours = 'true';
  if (values.created_by) params.created_by = values.created_by;
  return params;
}

const taskColumns: DataTableColumn<MachiningPart>[] = [
  {
    key: 'key',
    header: 'TI No',
    sortable: true,
    width: '10%',
    render: (row) => <span className={classes.partKey}>{row.key || '-'}</span>,
  },
  {
    key: 'name',
    header: 'Ad',
    sortable: true,
    width: '12%',
    render: (row) => <strong>{row.name || '-'}</strong>,
  },
  { key: 'description', header: 'Açıklama', sortable: true, width: '15%' },
  { key: 'job_no', header: 'İş No', sortable: true, width: '8%' },
  { key: 'image_no', header: 'Resim No', sortable: true, width: '8%' },
  { key: 'position_no', header: 'Poz No', sortable: true, width: '8%' },
  {
    key: 'quantity',
    header: 'Adet',
    sortable: true,
    width: '6%',
    render: (row) => <span className={classes.countPill}>{row.quantity || 0}</span>,
  },
  {
    key: 'estimated_hours',
    header: 'Tahmini Saat',
    sortable: true,
    width: '10%',
    render: (row) => (row.estimated_hours ? `${row.estimated_hours} saat` : 'Belirtilmemiş'),
  },
  {
    key: 'total_hours_spent',
    header: 'Harcanan Saat',
    sortable: true,
    width: '10%',
    render: (row) => `${row.total_hours_spent || 0} saat`,
  },
  {
    key: 'finish_time',
    header: 'Bitmesi Planlanan Tarih',
    sortable: true,
    width: '12%',
    exportValue: (row) => (row.planned_end_ms ? formatDate(row.planned_end_ms) : 'Belirtilmemiş'),
    render: (row) => (row.planned_end_ms ? formatDate(row.planned_end_ms) : 'Belirtilmemiş'),
  },
  {
    key: 'completion_date',
    header: 'Tamamlanma Tarihi',
    sortable: true,
    width: '12%',
    exportValue: (row) => (row.completion_date ? formatDate(row.completion_date) : '-'),
    render: (row) => (row.completion_date ? formatDate(row.completion_date) : '-'),
  },
  {
    key: 'status',
    header: 'Durum',
    width: '8%',
    exportValue: (row) =>
      row.completion_date
        ? 'Tamamlandı'
        : Number(row.total_hours_spent) > 0
          ? 'Çalışıldı'
          : 'Bekliyor',
    render: (row) =>
      row.completion_date ? (
        <StatusBadge color="green">Tamamlandı</StatusBadge>
      ) : Number(row.total_hours_spent) > 0 ? (
        <StatusBadge color="blue">Çalışıldı</StatusBadge>
      ) : (
        <StatusBadge color="orange">Bekliyor</StatusBadge>
      ),
  },
];

const CREATED_COLUMNS: DataTableColumn<MachiningPart>[] = [
  { key: 'key', header: 'TI No' },
  { key: 'name', header: 'Görev Adı' },
  // job_no is the allocation label from the API ("254-01" / "254-01 +2")
  { key: 'job_no', header: 'İş No' },
  { key: 'image_no', header: 'Resim No' },
  { key: 'position_no', header: 'Pozisyon No' },
  { key: 'quantity', header: 'Adet', exportValue: (t) => t.quantity || '' },
  { key: 'estimated_hours', header: 'Tahmini Saat', exportValue: (t) => t.estimated_hours || '' },
  { key: 'description', header: 'Açıklama' },
  {
    key: 'created_at',
    header: 'Oluşturulma Tarihi',
    exportValue: (t) => (t.created_at ? formatDate(t.created_at) : ''),
  },
];

const EMPTY_ROWS: MachiningPart[] = [];

function positiveInt(value: string, fallback: number): number {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Port of manufacturing/machining/tasks/create (createTask.js). */
export function MachiningCreateTasksPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // ---- entry rows ----
  const [drafts, setDrafts] = useState<TaskDraft[]>(() => [emptyDraft()]);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<MachiningPart[] | null>(null);

  const jobOrders = useJobOrderOptions();
  useEffect(() => {
    if (jobOrders.isError) notify.error('İş emirleri yüklenirken hata oluştu');
  }, [jobOrders.isError]);
  const jobOptions = useMemo(
    () =>
      (jobOrders.data ?? []).map((j) => ({
        value: String(j.job_no),
        label: `${j.job_no} - ${j.title}`,
      })),
    [jobOrders.data],
  );

  const fileInput = useRef<HTMLInputElement>(null);
  const fileTarget = useRef<string | null>(null);

  const updateDraft = (id: string, patch: Partial<TaskDraft>) =>
    setDrafts((rows) => rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));

  const singleRow = drafts.length === 1;
  const draftColumns = useMemo<DataTableColumn<TaskDraft>[]>(
    () => [
      { key: 'name', header: 'Ad *', width: 150, editable: true },
      {
        key: 'job_no',
        header: 'İş No *',
        width: 210,
        render: (row) => {
          // Keep a job number that is not in the dropdown (copied row) selectable.
          const data =
            row.job_no && !jobOptions.some((o) => o.value === row.job_no)
              ? [{ value: row.job_no, label: row.job_no }, ...jobOptions]
              : jobOptions;
          return (
            <Select
              size="xs"
              searchable
              clearable
              placeholder="İş emri seçin"
              aria-label="İş No"
              data={data}
              value={row.job_no || null}
              onChange={(value) => updateDraft(row.id, { job_no: value ?? '' })}
              nothingFoundMessage="Sonuç bulunamadı"
              limit={200}
              comboboxProps={{ width: 360, position: 'bottom-start' }}
            />
          );
        },
      },
      { key: 'image_no', header: 'Resim No', width: 105, editable: true },
      { key: 'position_no', header: 'Pozisyon No', width: 105, editable: true },
      { key: 'quantity', header: 'Adet *', width: 75, editable: { type: 'number', step: 1 } },
      { key: 'material', header: 'Malzeme', width: 110, editable: true },
      {
        key: 'weight_kg',
        header: 'Ağırlık (kg)',
        width: 95,
        editable: { type: 'number', step: 0.01 },
      },
      {
        key: 'finish_time',
        header: 'Bitiş Tarihi *',
        width: 140,
        editable: { type: 'date' },
        render: (row) => (row.finish_time ? formatDate(row.finish_time) : '-'),
      },
      { key: 'description', header: 'Açıklama', width: 170, editable: true },
      {
        key: 'files',
        header: 'Dosyalar',
        width: 150,
        render: (row) => (
          <div>
            <Button
              size="compact-xs"
              variant="default"
              title="Dosya ekle"
              aria-label="Dosya ekle"
              onClick={() => {
                fileTarget.current = row.id;
                fileInput.current?.click();
              }}
              rightSection={
                row.files.length ? <Badge size="xs">{row.files.length}</Badge> : undefined
              }
            >
              <FaIcon icon="fas fa-paperclip" />
            </Button>
            {row.files.length ? (
              <div className={classes.fileNames}>
                {row.files.map((file, index) => (
                  <span
                    className={classes.fileName}
                    key={`${file.name}-${index}`}
                    title={file.name}
                  >
                    <FaIcon icon="fas fa-file" />
                    <span className={classes.fileNameText}>{file.name}</span>
                    <ActionIcon
                      size="xs"
                      variant="subtle"
                      color="red"
                      title="Kaldır"
                      aria-label={`${file.name} kaldır`}
                      onClick={() =>
                        updateDraft(row.id, { files: row.files.filter((_, i) => i !== index) })
                      }
                    >
                      ×
                    </ActionIcon>
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ),
      },
      {
        key: 'actions',
        header: 'İşlem',
        width: 90,
        render: (row) => (
          <Group gap={4} wrap="nowrap">
            <Tooltip label="Kopyala">
              <ActionIcon
                variant="default"
                aria-label="Kopyala"
                onClick={() =>
                  setDrafts((rows) => {
                    const index = rows.findIndex((r) => r.id === row.id);
                    const copy = {
                      ...rows[index]!,
                      id: emptyDraft().id,
                      files: [...rows[index]!.files],
                    };
                    return [...rows.slice(0, index + 1), copy, ...rows.slice(index + 1)];
                  })
                }
              >
                <FaIcon icon="fas fa-copy" />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Sil">
              <ActionIcon
                variant="default"
                color="red"
                aria-label="Sil"
                disabled={singleRow}
                onClick={() =>
                  setDrafts((rows) =>
                    rows.length > 1 ? rows.filter((r) => r.id !== row.id) : rows,
                  )
                }
              >
                <FaIcon icon="fas fa-trash" />
              </ActionIcon>
            </Tooltip>
          </Group>
        ),
      },
    ],
    // updateDraft only calls the stable setDrafts.
    [jobOptions, singleRow],
  );

  const editDraft = ({ rowId, columnKey, value }: CellEdit<TaskDraft>) =>
    updateDraft(rowId, { [columnKey]: value } as Partial<TaskDraft>);

  // Entered but not saved yet.
  const isDirty = (row: TaskDraft, columnKey: string) => !isBlank(row[columnKey as DraftField]);

  const onFilesPicked = (list: FileList | null) => {
    const target = fileTarget.current;
    if (list?.length && target) {
      const picked = Array.from(list);
      setDrafts((rows) =>
        rows.map((r) => (r.id === target ? { ...r, files: [...r.files, ...picked] } : r)),
      );
    }
    if (fileInput.current) fileInput.current.value = '';
    fileTarget.current = null;
  };

  // ---- the list ----
  const url = useUrlFilters(URL_DEFAULTS);
  const { values, apply } = url;
  // Empty URL value = the current user (legacy default); 'all' = cleared.
  const creatorId =
    values.created_by === ANY_CREATOR ? '' : values.created_by || (user?.id ? String(user.id) : '');
  const filters = useMemo<FilterState>(
    () => ({
      key: values.key,
      name: values.name,
      job_no: values.job_no,
      image_no: values.image_no,
      position_no: values.position_no,
      finish_time: values.finish_time,
      finish_time_gte: values.finish_time_gte,
      finish_time_lte: values.finish_time_lte,
      has_timer: values.has_timer,
      exceeded_estimated_hours: values.exceeded_estimated_hours,
      created_by: creatorId,
    }),
    [
      values.key,
      values.name,
      values.job_no,
      values.image_no,
      values.position_no,
      values.finish_time,
      values.finish_time_gte,
      values.finish_time_lte,
      values.has_timer,
      values.exceeded_estimated_hours,
      creatorId,
    ],
  );
  const users = useUsers();
  const creatorOptions = useMemo(() => {
    const options = (users.data ?? []).map((u) => ({ value: String(u.id), label: userLabel(u) }));
    // Keep the picked creator visible before / without the user list.
    if (filters.created_by && !options.some((o) => o.value === filters.created_by)) {
      options.unshift({
        value: filters.created_by,
        label:
          filters.created_by === String(user?.id) ? (user?.username ?? 'Ben') : filters.created_by,
      });
    }
    return options;
  }, [users.data, filters.created_by, user?.id, user?.username]);
  const listFilterConfig = useMemo<FilterConfig<FilterKeys>[]>(
    () => [
      {
        type: 'select',
        key: 'created_by',
        label: 'Oluşturan',
        placeholder: 'Tümü',
        searchable: true,
        options: creatorOptions,
      },
      ...filterConfig,
    ],
    [creatorOptions],
  );
  const page = positiveInt(values.page, 1);
  const pageSize = positiveInt(values.page_size, 20);
  const sort = fromOrdering(values.ordering || 'key');
  const ordering = toOrdering(sort.sortBy, sort.sortDir) ?? 'key';
  const params: PartsParams = {
    ...taskFilterParams(filters),
    page,
    page_size: pageSize,
    ordering,
  };
  const list = useQuery({
    ...partsQueryOptions(params),
    staleTime: DEFAULT_STALE_TIME,
    placeholderData: keepPreviousData,
  });
  const rows = list.data?.results ?? EMPTY_ROWS;
  useEffect(() => {
    if (list.isError) notify.error('Parçalar yüklenirken hata oluştu');
  }, [list.isError, list.errorUpdatedAt]);

  const reloadFirstPage = async () => {
    await queryClient.invalidateQueries({ queryKey: partsKeys.all });
    apply({ page: '1' });
  };

  // ---- Görevleri Oluştur ----
  const save = async () => {
    if (submitting) return;
    const problem = validateDrafts(drafts);
    if (problem) {
      notify.error(multiline(problem));
      return;
    }
    // Snapshot so in-flight edits can't desync the row -> created part mapping.
    const submitted = drafts;
    const payload = draftPayload(submitted);
    setSubmitting(true);
    try {
      const response = await bulkCreateParts(payload);
      const filesQueued = submitted.reduce((sum, row) => sum + row.files.length, 0);
      const parts = Array.isArray(response?.parts) ? response.parts : null;

      // Upload each row's files to its part (response order = row order).
      if (parts?.length) {
        const uploadErrors: string[] = [];
        await Promise.all(
          parts.map(async (part, index) => {
            const files = submitted[index]?.files;
            if (!files?.length) return;
            try {
              await uploadPartFiles(part.key, files);
            } catch (error) {
              uploadErrors.push(
                `${part.key}: ${error instanceof Error ? error.message : String(error)}`,
              );
            }
          }),
        );
        if (uploadErrors.length) {
          notify.warning(
            multiline(
              `Parçalar oluşturuldu ancak bazı dosyalar yüklenemedi:\n${uploadErrors.join('\n')}`,
            ),
            {
              autoClose: 8000,
            },
          );
        }
      }

      setDrafts([emptyDraft()]);
      if (parts) {
        setCreated(parts);
        const fileMsg = filesQueued > 0 ? ` (${filesQueued} dosya eklendi)` : '';
        notify.success(
          `${response.created || parts.length} parça başarıyla oluşturuldu!${fileMsg}`,
        );
      } else {
        notify.success(`${payload.length} parça başarıyla oluşturuldu!`);
      }
      await reloadFirstPage();
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        notify.error(
          'İstek zaman aşımına uğradı. Görevler yine de oluşturulmuş olabilir; aşağıdaki liste yenilendi, kontrol edip gerekirse tekrar deneyin.',
          { autoClose: 10000 },
        );
        await reloadFirstPage();
      } else if (error instanceof TypeError) {
        // fetch network failure: server unreachable or connection dropped
        notify.error(
          'Sunucuya ulaşılamadı (bağlantı sorunu). Girdiğiniz veriler korundu. Görevler oluşturulmuş olabilir; aşağıdaki liste yenilendi, kontrol edip gerekirse tekrar deneyin.',
          { autoClose: 10000 },
        );
        await reloadFirstPage();
      } else {
        notify.error(multiline(`Hata: ${error instanceof Error ? error.message : String(error)}`), {
          autoClose: 8000,
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const exportCreated = async () => {
    if (!created?.length) {
      notify.warning('Dışa aktarılacak görev bulunamadı');
      return;
    }
    try {
      await exportToExcel(created, CREATED_COLUMNS, {
        fileName: `olusturulan_gorevler_${new Date().toISOString().slice(0, 10)}`,
        sheetName: 'Oluşturulan Görevler',
      });
      notify.success(`${created.length} görev başarıyla Excel dosyası olarak dışa aktarıldı`);
    } catch {
      notify.error('Dışa aktarma sırasında hata oluştu');
    }
  };

  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <PageHeader
        title="Görev Oluştur"
        subtitle="Yeni görev oluştur ve oluşturduğun görevleri görüntüle"
        icon="plus-circle"
        backTo="/manufacturing/machining/tasks/"
      />

      <Panel
        title="Yeni Görev Oluştur"
        icon="fas fa-plus-circle"
        footer={
          <Group justify="space-between">
            <Text size="xs" c="dimmed">
              Toplam satır sayısı: {drafts.length}
            </Text>
            <Group gap="xs">
              <Button
                size="xs"
                variant="default"
                disabled={submitting}
                leftSection={<FaIcon icon="fas fa-plus" />}
                onClick={() => setDrafts((rows) => [...rows, emptyDraft()])}
              >
                Satır Ekle
              </Button>
              <Button
                size="xs"
                loading={submitting}
                leftSection={<FaIcon icon="fas fa-save" />}
                onClick={() => void save()}
              >
                {submitting ? 'Oluşturuluyor...' : 'Görevleri Oluştur'}
              </Button>
              <Button
                size="xs"
                variant="default"
                disabled={submitting}
                leftSection={<FaIcon icon="fas fa-times" />}
                onClick={() => {
                  setDrafts([emptyDraft()]);
                  notify.info('Form temizlendi');
                }}
              >
                Temizle
              </Button>
            </Group>
          </Group>
        }
      >
        <Text size="sm" c="dimmed" mb="sm">
          Birden fazla görev oluşturmak için aşağıdaki tabloyu kullanın.
        </Text>
        <div
          className={submitting ? classes.submitting : undefined}
          data-testid="bulk-create-table"
        >
          <DataTable
            data={drafts}
            columns={draftColumns}
            getRowId={(row) => row.id}
            onCellEdit={editDraft}
            isCellDirty={isDirty}
            withColumnBorders
          />
        </div>
        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          data-testid="bulk-file-upload-input"
          onChange={(event) => onFilesPicked(event.currentTarget.files)}
        />
      </Panel>

      <DataTable
        title="Oluşturduğum Görevler"
        filters={
          <FilterBar
            inline
            filters={listFilterConfig}
            values={filters}
            onApply={(next) =>
              apply({ ...next, created_by: next.created_by || ANY_CREATOR, page: '1' })
            }
            onClear={() => {
              // Temizle returns to the default: my tasks.
              apply({ ...EMPTY_FILTERS, page: '1' });
              notify.info('Filtreler temizlendi');
            }}
          />
        }
        data={rows}
        columns={taskColumns}
        getRowId={(row) => row.key}
        loading={list.isFetching}
        sort={{
          sortBy: sort.sortBy,
          sortDir: sort.sortDir,
          onSortChange: (sortBy, sortDir) =>
            apply({ ordering: toOrdering(sortBy, sortDir) ?? 'key', page: '1' }),
        }}
        pagination={{
          page,
          pageSize,
          total: list.data?.count ?? 0,
          onPageChange: (next) => apply({ page: String(next) }),
          onPageSizeChange: (size) => apply({ page_size: String(size), page: '1' }),
        }}
        emptyMessage="Görev bulunamadı"
        onRefresh={() => void list.refetch()}
        exportable={{ fileName: `tasks-table-container_${today}` }}
      />

      <Modal
        opened={created !== null}
        onClose={() => setCreated(null)}
        size="lg"
        withCloseButton={false}
        classNames={modalClassNames}
      >
        <ModalHeader
          title="Görevler Başarıyla Oluşturuldu"
          subtitle="Aşağıda oluşturulan görevlerin anahtarları listelenmiştir."
          icon="fas fa-check-circle"
        />
        <ModalBody>
          <Table withTableBorder withColumnBorders fz="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Görev Adı</Table.Th>
                <Table.Th>TI No</Table.Th>
                <Table.Th>İş No</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {(created ?? []).map((task, index) => (
                <Table.Tr key={task.key ?? index}>
                  <Table.Td>{task.name || 'N/A'}</Table.Td>
                  <Table.Td>
                    <strong>{task.key || 'N/A'}</strong>
                  </Table.Td>
                  <Table.Td>{task.job_no || 'N/A'}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ModalBody>
        <ModalFooter>
          <Button
            variant="default"
            leftSection={<FaIcon icon="fas fa-times" />}
            onClick={() => setCreated(null)}
          >
            Kapat
          </Button>
          <Button
            color="green"
            leftSection={<FaIcon icon="fas fa-download" />}
            onClick={() => void exportCreated()}
          >
            Excel&apos;e Aktar
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
}
