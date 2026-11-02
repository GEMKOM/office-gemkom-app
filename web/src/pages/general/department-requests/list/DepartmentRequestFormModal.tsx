import {
  ActionIcon,
  Box,
  Button,
  Checkbox,
  FileInput,
  Grid,
  Group,
  NumberInput,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
  Textarea,
  Tooltip,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DEPARTMENT_REQUEST_PRIORITY_OPTIONS,
  useCreateDepartmentRequest,
  useUpdateDepartmentRequest,
  type DepartmentRequest,
  type DepartmentRequestItemInput,
} from '@/api/general/departmentRequests';
import { useJobOrderOptions } from '@/api/reference';
import { errorMessage, FaIcon, FormModal, ModalSection, notify } from '@/ui';
import { FileAttachmentList, ItemsTable } from '../shared';
import { PREDEFINED_PROCESS_ITEMS, UNIT_CHOICES } from './constants';
import { shiftAttachTargets, type AttachTarget } from './fileItemMapping';

const REQUIRED = 'Bu alan gereklidir';

export interface ItemRow {
  key: number;
  item_code: string;
  item_name: string;
  job_no: string | null;
  quantity: number | string;
  item_unit: string | null;
  item_description: string;
  item_specifications: string;
}

export interface DepartmentRequestFormValues {
  title: string;
  description: string;
  priority: string | null;
  needed_date: string;
  items: ItemRow[];
}

interface FileMapping {
  file: File;
  attachTo: AttachTarget[];
}

let nextKey = 1;
function emptyRow(fill: Partial<ItemRow> = {}): ItemRow {
  return {
    item_code: '',
    item_name: '',
    job_no: null,
    quantity: 1,
    item_unit: null,
    item_description: '',
    item_specifications: '',
    ...fill,
    key: nextKey++,
  };
}

/** Legacy formatDateForInput: YYYY-MM-DD in local time, '' when not a date. */
export function dateForInput(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const sameFile = (a: File, b: File) =>
  a.name === b.name && a.size === b.size && a.lastModified === b.lastModified;

/** What a file-mapping checkbox calls an item row (legacy updateFilesMappingList). */
function itemTargetLabel(row: ItemRow, index: number): string {
  const parts: string[] = [];
  if (row.job_no) parts.push(`İş No: ${row.job_no}`);
  if (row.item_description.trim()) parts.push(`Açıklama: ${row.item_description.trim()}`);
  if (row.item_specifications.trim()) parts.push(`Özellikler: ${row.item_specifications.trim()}`);
  return parts.length > 0 ? parts.join(' | ') : row.item_name.trim() || `Ürün ${index + 1}`;
}

/**
 * Rows with a name become `items`; the others are skipped. `indexMap` maps a
 * form row to its position in `items`, so the file mapping still points at the
 * right item when a nameless row sits before it.
 */
export function buildItems(rows: ItemRow[]): {
  items: DepartmentRequestItemInput[];
  indexMap: Map<number, number>;
} {
  const items: DepartmentRequestItemInput[] = [];
  const indexMap = new Map<number, number>();
  rows.forEach((row, index) => {
    const name = row.item_name.trim();
    if (!name) return;
    const rawQuantity = String(row.quantity ?? '').trim();
    const quantity = rawQuantity ? Number.parseInt(rawQuantity, 10) : 1;
    indexMap.set(index, items.length);
    items.push({
      item_code: row.item_code.trim() || null,
      item_name: name,
      job_no: row.job_no || null,
      item_unit: row.item_unit || null,
      quantity: Number.isNaN(quantity) ? 1 : quantity,
      item_description: row.item_description.trim() || null,
      item_specifications: row.item_specifications.trim() || null,
    });
  });
  return { items, indexMap };
}

const unitData = UNIT_CHOICES.map(({ value, label }) => ({ value, label }));
const predefinedData = PREDEFINED_PROCESS_ITEMS.map((item, index) => ({
  value: String(index),
  label: item.name,
}));
const priorityData = DEPARTMENT_REQUEST_PRIORITY_OPTIONS.map(({ value, label }) => ({
  value,
  label,
}));

export interface DepartmentRequestFormModalProps {
  /** Without a request the modal creates one. */
  request?: DepartmentRequest | null;
  onClose: () => void;
  onSaved?: () => void;
}

/**
 * Port of the create/edit modal in list.js. Creating sends items and files
 * (multipart, with the file → item mapping); editing patches the four basic
 * fields only, as legacy did, so items and files are shown read-only there.
 * Mount it when it should open.
 */
export function DepartmentRequestFormModal({
  request,
  onClose,
  onSaved,
}: DepartmentRequestFormModalProps) {
  const editing = Boolean(request);
  const form = useForm<DepartmentRequestFormValues>({
    initialValues: {
      title: request?.title || '',
      description: request?.description || '',
      priority: request?.priority || 'normal',
      needed_date: dateForInput(request?.needed_date),
      items: [],
    },
    validate: { title: (value) => (value.trim() ? null : REQUIRED) },
  });
  const [files, setFiles] = useState<FileMapping[]>([]);
  const create = useCreateDepartmentRequest();
  const update = useUpdateDepartmentRequest();
  const submitting = create.isPending || update.isPending;

  const jobOrders = useJobOrderOptions({}, { enabled: !editing });
  const jobOrderData = useMemo(
    () =>
      (jobOrders.data ?? []).map((j) => ({ value: j.job_no, label: `${j.job_no} - ${j.title}` })),
    [jobOrders.data],
  );
  const jobOrderErrorShown = useRef(false);
  useEffect(() => {
    if (jobOrders.isError && !jobOrderErrorShown.current) {
      jobOrderErrorShown.current = true;
      notify.error('İş emirleri yüklenirken hata oluştu');
    }
  }, [jobOrders.isError]);

  const rows = form.values.items;

  const addRow = (fill?: Partial<ItemRow>) => form.insertListItem('items', emptyRow(fill));
  const duplicateRow = (index: number) => {
    const source = rows[index];
    if (source) addRow({ ...source });
  };
  const removeRow = (index: number) => {
    form.removeListItem('items', index);
    setFiles((prev) =>
      prev.map((m) => ({ ...m, attachTo: shiftAttachTargets(m.attachTo, index) })),
    );
  };
  const clearRows = () => {
    form.setFieldValue('items', []);
    setFiles((prev) =>
      prev.map((m) => ({ ...m, attachTo: m.attachTo.filter((t) => t === 'request') })),
    );
    notify.info('Tüm ürünler temizlendi');
  };

  const addFiles = (picked: File[] | null) => {
    if (!picked || picked.length === 0) return;
    setFiles((prev) => {
      const next = [...prev];
      for (const file of picked) {
        if (!next.some((m) => sameFile(m.file, file))) next.push({ file, attachTo: ['request'] });
      }
      return next;
    });
  };
  const removeFile = (fileIndex: number) =>
    setFiles((prev) => prev.filter((_, i) => i !== fileIndex));
  const toggleTarget = (fileIndex: number, target: AttachTarget, checked: boolean) => {
    setFiles((prev) =>
      prev.map((m, i) => {
        if (i !== fileIndex) return m;
        if (checked)
          return m.attachTo.includes(target) ? m : { ...m, attachTo: [...m.attachTo, target] };
        const attachTo = m.attachTo.filter((t) => t !== target);
        // A file keeps at least one target.
        return attachTo.length === 0 ? m : { ...m, attachTo };
      }),
    );
  };

  const save = async (values: DepartmentRequestFormValues) => {
    try {
      if (request) {
        await update.mutateAsync({
          id: request.id,
          data: {
            title: values.title,
            description: values.description || null,
            priority: values.priority || 'normal',
            needed_date: values.needed_date || null,
          },
        });
        notify.success('Departman talebi başarıyla güncellendi');
      } else {
        const { items, indexMap } = buildItems(values.items);
        if (items.length === 0) {
          notify.error('En az bir ürün eklemelisiniz');
          return;
        }
        const fileItemMapping: Record<string, number[]> = {};
        files.forEach((mapping, fileIndex) => {
          const targets = mapping.attachTo
            .filter((t): t is number => typeof t === 'number')
            .map((t) => indexMap.get(t))
            .filter((t): t is number => t !== undefined);
          if (targets.length > 0) fileItemMapping[String(fileIndex)] = targets;
        });
        await create.mutateAsync({
          title: values.title,
          description: values.description || null,
          priority: values.priority || 'normal',
          needed_date: values.needed_date || null,
          files: files.map((m) => m.file),
          items,
          ...(Object.keys(fileItemMapping).length > 0
            ? { file_item_mapping: fileItemMapping }
            : {}),
        });
        notify.success('Departman talebi başarıyla oluşturuldu');
      }
      onSaved?.();
      onClose();
    } catch (error) {
      notify.error(`Talep kaydedilirken hata oluştu: ${errorMessage(error)}`);
    }
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title={editing ? 'Departman Talebini Düzenle' : 'Yeni Departman Talebi'}
      subtitle={request ? `#${request.id}${request.title ? ` · ${request.title}` : ''}` : undefined}
      icon={editing ? 'fas fa-edit' : 'fas fa-plus-circle'}
      size={editing ? 'xl' : 1240}
      submitting={submitting}
      submitLabel={editing ? 'Kaydet' : 'Oluştur'}
      onSubmit={form.onSubmit(save)}
    >
      <Grid gap="lg">
        <Grid.Col span={{ base: 12, md: 6 }}>
          <ModalSection title="Temel Bilgiler" icon="fas fa-info-circle">
            <Stack gap="sm">
              <TextInput
                label="Başlık"
                description="Departman talebinin başlığı"
                withAsterisk
                {...form.getInputProps('title')}
              />
              <Textarea
                label="Açıklama"
                description="Departman talebi hakkında detaylı açıklama (opsiyonel)"
                rows={4}
                {...form.getInputProps('description')}
              />
            </Stack>
          </ModalSection>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <ModalSection title="Talep Detayları" icon="fas fa-clipboard-list">
            <Stack gap="sm">
              <Select
                label="Öncelik"
                description="Talebin öncelik seviyesi"
                data={priorityData}
                allowDeselect={false}
                {...form.getInputProps('priority')}
              />
              <TextInput
                type="date"
                label="İhtiyaç Tarihi"
                description="Talebin ihtiyaç duyulduğu tarih (opsiyonel)"
                {...form.getInputProps('needed_date')}
              />
              {!editing ? (
                <FileInput
                  multiple
                  label="Dosyalar"
                  description="Ek dosyalar (opsiyonel) - Birden fazla dosya seçebilirsiniz"
                  placeholder="Dosya seçin"
                  leftSection={<FaIcon icon="fas fa-paperclip" />}
                  value={files.map((m) => m.file)}
                  onChange={addFiles}
                />
              ) : null}
            </Stack>
          </ModalSection>
        </Grid.Col>
      </Grid>

      <ModalSection title="Ürün Bilgileri" icon="fas fa-boxes">
        {editing ? (
          request?.items && request.items.length > 0 ? (
            <ItemsTable items={request.items} />
          ) : (
            <Text size="sm" c="dimmed">
              Ürün yok
            </Text>
          )
        ) : (
          <Stack gap="xs">
            <Group justify="space-between">
              <Text fw={600} size="sm">
                Ürün Listesi
              </Text>
              <Group gap="xs">
                <Select
                  aria-label="Hazır Ürün Ekle"
                  placeholder="Hazır Ürün Ekle"
                  size="xs"
                  w={200}
                  searchable
                  data={predefinedData}
                  value={null}
                  onChange={(value) => {
                    const item =
                      value === null ? undefined : PREDEFINED_PROCESS_ITEMS[Number(value)];
                    if (item)
                      addRow({ item_code: item.code, item_name: item.name, item_unit: item.unit });
                  }}
                />
                <Button
                  size="xs"
                  variant="default"
                  leftSection={<FaIcon icon="fas fa-plus" />}
                  onClick={() => addRow()}
                >
                  Ürün Ekle
                </Button>
                <Button
                  size="xs"
                  variant="default"
                  color="red"
                  leftSection={<FaIcon icon="fas fa-trash-alt" />}
                  onClick={clearRows}
                >
                  Tümünü Temizle
                </Button>
              </Group>
            </Group>

            {rows.length > 0 ? (
              <Grid columns={24} gap="xs" visibleFrom="md">
                {[
                  ['Ürün Kodu', 3],
                  ['Ürün Adı', 4],
                  ['İş No', 4],
                  ['Miktar', 2],
                  ['Birim', 3],
                  ['Ürün Açıklaması', 3],
                  ['Özellikler', 3],
                  ['İşlem', 2],
                ].map(([label, span]) => (
                  <Grid.Col key={label} span={span as number}>
                    <Text size="xs" c="dimmed" fw={600}>
                      {label}
                    </Text>
                  </Grid.Col>
                ))}
              </Grid>
            ) : null}

            {rows.map((row, index) => (
              <Grid key={row.key} columns={24} gap="xs" data-testid="item-row">
                <Grid.Col span={{ base: 12, md: 3 }}>
                  <TextInput
                    size="xs"
                    placeholder="Ürün kodu"
                    aria-label={`Ürün kodu ${index + 1}`}
                    {...form.getInputProps(`items.${index}.item_code`)}
                  />
                </Grid.Col>
                <Grid.Col span={{ base: 12, md: 4 }}>
                  <TextInput
                    size="xs"
                    placeholder="Ürün adı"
                    aria-label={`Ürün adı ${index + 1}`}
                    {...form.getInputProps(`items.${index}.item_name`)}
                  />
                </Grid.Col>
                <Grid.Col span={{ base: 12, md: 4 }}>
                  <Select
                    size="xs"
                    placeholder="İş no seçin"
                    aria-label={`İş no ${index + 1}`}
                    searchable
                    clearable
                    limit={100}
                    data={jobOrderData}
                    {...form.getInputProps(`items.${index}.job_no`)}
                  />
                </Grid.Col>
                <Grid.Col span={{ base: 8, md: 2 }}>
                  <NumberInput
                    size="xs"
                    placeholder="Miktar"
                    aria-label={`Miktar ${index + 1}`}
                    min={1}
                    step={1}
                    allowDecimal={false}
                    {...form.getInputProps(`items.${index}.quantity`)}
                  />
                </Grid.Col>
                <Grid.Col span={{ base: 16, md: 3 }}>
                  <Select
                    size="xs"
                    placeholder="Birim Seçin"
                    aria-label={`Birim ${index + 1}`}
                    clearable
                    data={unitData}
                    {...form.getInputProps(`items.${index}.item_unit`)}
                  />
                </Grid.Col>
                <Grid.Col span={{ base: 12, md: 3 }}>
                  <TextInput
                    size="xs"
                    placeholder="Ürün açıklaması"
                    aria-label={`Ürün açıklaması ${index + 1}`}
                    {...form.getInputProps(`items.${index}.item_description`)}
                  />
                </Grid.Col>
                <Grid.Col span={{ base: 12, md: 3 }}>
                  <TextInput
                    size="xs"
                    placeholder="Özellikler"
                    aria-label={`Özellikler ${index + 1}`}
                    {...form.getInputProps(`items.${index}.item_specifications`)}
                  />
                </Grid.Col>
                <Grid.Col span={{ base: 24, md: 2 }}>
                  <Group gap={4} wrap="nowrap">
                    <Tooltip label="Ürünü Kopyala" withArrow>
                      <ActionIcon
                        variant="default"
                        aria-label="Ürünü Kopyala"
                        onClick={() => duplicateRow(index)}
                      >
                        <FaIcon icon="fas fa-copy" />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Ürünü Kaldır" withArrow>
                      <ActionIcon
                        variant="default"
                        color="red"
                        aria-label="Ürünü Kaldır"
                        onClick={() => removeRow(index)}
                      >
                        <FaIcon icon="fas fa-trash" />
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                </Grid.Col>
              </Grid>
            ))}
          </Stack>
        )}
      </ModalSection>

      {editing ? (
        <ModalSection title="Dosya Ekleri" icon="fas fa-paperclip">
          <FileAttachmentList files={request?.files} />
        </ModalSection>
      ) : (
        <ModalSection title="Dosya Eşleştirme" icon="fas fa-paperclip">
          {files.length === 0 ? (
            <Text size="sm" c="dimmed">
              Henüz dosya seçilmedi
            </Text>
          ) : (
            <Stack gap="sm">
              {files.map((mapping, fileIndex) => (
                <Paper
                  key={`${mapping.file.name}-${mapping.file.size}-${mapping.file.lastModified}`}
                  withBorder
                  p="sm"
                >
                  <Group justify="space-between" align="flex-start" wrap="nowrap">
                    <Box>
                      <Text fw={600} size="sm">
                        <FaIcon icon="fas fa-file" /> {mapping.file.name}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {(mapping.file.size / 1024).toFixed(2)} KB
                      </Text>
                    </Box>
                    <ActionIcon
                      variant="default"
                      color="red"
                      aria-label={`${mapping.file.name} kaldır`}
                      onClick={() => removeFile(fileIndex)}
                    >
                      <FaIcon icon="fas fa-times" />
                    </ActionIcon>
                  </Group>
                  <Text size="sm" fw={600} mt="xs">
                    Eşleştir:
                  </Text>
                  <Stack gap={4} mt={4}>
                    <Checkbox
                      size="xs"
                      label="Talep"
                      checked={mapping.attachTo.includes('request')}
                      onChange={(e) => toggleTarget(fileIndex, 'request', e.currentTarget.checked)}
                    />
                    {rows.map((row, itemIndex) => (
                      <Checkbox
                        key={row.key}
                        size="xs"
                        label={itemTargetLabel(row, itemIndex)}
                        checked={mapping.attachTo.includes(itemIndex)}
                        onChange={(e) =>
                          toggleTarget(fileIndex, itemIndex, e.currentTarget.checked)
                        }
                      />
                    ))}
                  </Stack>
                </Paper>
              ))}
            </Stack>
          )}
        </ModalSection>
      )}
    </FormModal>
  );
}
