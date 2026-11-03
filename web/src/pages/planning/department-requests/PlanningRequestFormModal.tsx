import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Checkbox,
  FileButton,
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
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { DepartmentRequest } from '@/api/general/departmentRequests';
import {
  partialUpdatePlanningRequest,
  planningRequestKeys,
  planningRequestQueryOptions,
  releasePlanningItemInventory,
  type AttachTarget,
  type PlanningRequest,
  type PlanningRequestInput,
} from '@/api/planning/planningRequests';
import { useJobOrderOptions } from '@/api/reference';
import {
  confirm,
  errorMessage,
  FaIcon,
  FileViewer,
  FormModal,
  ModalSection,
  notify,
  type AttachmentFile,
} from '@/ui';
import { UNIT_CHOICES } from '../../general/department-requests/list/constants';
import { shiftAttachTargets } from '../../general/department-requests/list/fileItemMapping';
import { ExcelImportModal } from './ExcelImportModal';
import {
  attachmentsFromDepartmentRequest,
  attachmentsFromPlanningRequest,
  buildFiles,
  buildItems,
  changedFields,
  itemRow,
  lockReason,
  newAttachment,
  normalizePriority,
  originalData,
  PRIORITY_OPTIONS,
  rowsFromDepartmentRequest,
  rowsFromPlanningRequest,
  rowTargetLabel,
  type Attachment,
  type ItemRow,
} from './logic';

const REQUIRED = 'Bu alan gereklidir';
const unitData = UNIT_CHOICES.map(({ value, label }) => ({ value, label }));

interface FormValues {
  title: string;
  description: string;
  priority: string;
  needed_date: string;
  check_inventory: boolean;
  items: ItemRow[];
}

export type PlanningRequestFormMode =
  | { kind: 'create'; departmentRequest?: DepartmentRequest }
  | { kind: 'edit'; request: PlanningRequest };

export interface PlanningRequestFormModalProps {
  mode: PlanningRequestFormMode;
  onClose: () => void;
  /** Create: the checked request goes to the transfer workflow, which creates it. */
  onCreateReady?: (request: PlanningRequestInput, departmentRequestId?: number) => void;
}

/**
 * Port of showCreatePlanningRequestModal / showEditPlanningRequestModal: the
 * request fields, the item rows (Excel import, job order per row) and the
 * files with their targets (the request and/or item rows).
 */
export function PlanningRequestFormModal({
  mode,
  onClose,
  onCreateReady,
}: PlanningRequestFormModalProps) {
  const queryClient = useQueryClient();
  const editing = mode.kind === 'edit' ? mode.request : null;
  const fromDepartment = mode.kind === 'create' ? mode.departmentRequest : undefined;

  const form = useForm<FormValues>({
    initialValues: editing
      ? {
          title: editing.title || '',
          description: editing.description || '',
          priority: normalizePriority(editing.priority),
          needed_date: editing.needed_date || '',
          check_inventory: editing.check_inventory || false,
          items: rowsFromPlanningRequest(editing),
        }
      : {
          title: fromDepartment?.title || '',
          description: fromDepartment?.description || '',
          priority: normalizePriority(fromDepartment?.priority),
          needed_date: fromDepartment?.needed_date || '',
          check_inventory: false,
          items: fromDepartment ? rowsFromDepartmentRequest(fromDepartment) : [],
        },
    validate: {
      title: (value) => ((editing || !fromDepartment) && !value.trim() ? REQUIRED : null),
      needed_date: (value) => (!editing && !value.trim() ? REQUIRED : null),
    },
  });

  const [attachments, setAttachments] = useState<Attachment[]>(() =>
    editing
      ? attachmentsFromPlanningRequest(editing)
      : fromDepartment
        ? attachmentsFromDepartmentRequest(fromDepartment)
        : [],
  );
  // Prefilled files are not a change: re-sending them duplicates them server side.
  const [attachmentsDirty, setAttachmentsDirty] = useState(false);
  const original = useMemo(() => (editing ? originalData(editing) : null), [editing]);
  const [saving, setSaving] = useState(false);
  const [excelOpen, setExcelOpen] = useState(false);
  const [viewing, setViewing] = useState<AttachmentFile | null>(null);
  const resetFileButton = useRef<() => void>(null);

  const jobOrders = useJobOrderOptions();
  useEffect(() => {
    if (jobOrders.isError) notify.error('İş emirleri yüklenirken hata oluştu');
  }, [jobOrders.isError]);
  const rows = form.values.items;
  const jobOrderOptions = useMemo(
    () =>
      (jobOrders.data ?? []).map((j) => ({ value: j.job_no, label: `${j.job_no} - ${j.title}` })),
    [jobOrders.data],
  );
  // A row's job order may be one the dropdown no longer lists (closed): keep it selectable.
  const missingJobNos = rows
    .map((row) => row.job_no)
    .filter((jobNo): jobNo is string => Boolean(jobNo))
    .filter((jobNo, i, all) => all.indexOf(jobNo) === i)
    .filter((jobNo) => !jobOrderOptions.some((o) => o.value === jobNo))
    .join('\n');
  const jobOrderData = useMemo(
    () =>
      missingJobNos
        ? [...jobOrderOptions, ...missingJobNos.split('\n').map((v) => ({ value: v, label: v }))]
        : jobOrderOptions,
    [jobOrderOptions, missingJobNos],
  );

  const updateAttachments = (update: (prev: Attachment[]) => Attachment[], dirty = true) => {
    setAttachments(update);
    if (dirty) setAttachmentsDirty(true);
  };

  const addRow = () => form.insertListItem('items', itemRow());
  const removeRow = (index: number) => {
    form.removeListItem('items', index);
    updateAttachments((prev) =>
      prev.map((a) => ({ ...a, attachTo: shiftAttachTargets(a.attachTo, index) })),
    );
  };
  const clearRows = () => {
    form.setFieldValue('items', []);
    updateAttachments(
      (prev) =>
        prev.map((a) => {
          const attachTo = a.attachTo.filter((t) => t === 'request');
          return { ...a, attachTo: attachTo.length > 0 ? attachTo : ['request'] };
        }),
      false,
    );
    notify.info('Tüm ürünler temizlendi');
  };

  const releaseInventory = async (row: ItemRow) => {
    if (!row.id) {
      notify.error('Kalem bulunamadı.');
      return;
    }
    const ok = await confirm({
      title: 'Envanterden Geri Al',
      icon: 'fas fa-rotate-left',
      message:
        'Bu kalem envanterden geri alınacak ve miktar stoğa iade edilecek. Devam edilsin mi?',
      confirmLabel: 'Evet, Geri Al',
    });
    if (!ok || !editing) return;
    try {
      await releasePlanningItemInventory(row.id);
      notify.success('Kalem envanterden geri alındı; stok iade edildi.');
      const fresh = await queryClient.fetchQuery({
        ...planningRequestQueryOptions(editing.id),
        staleTime: 0,
      });
      form.setFieldValue('items', rowsFromPlanningRequest(fresh));
      void queryClient.invalidateQueries({ queryKey: planningRequestKeys.all });
    } catch (error) {
      notify.error(errorMessage(error, 'Envanterden geri alma başarısız oldu.'));
    }
  };

  const addFiles = (picked: File[]) => {
    if (picked.length === 0) return;
    updateAttachments((prev) => {
      const next = [...prev];
      for (const file of picked) {
        // Legacy: same name and size is the same file.
        if (!next.some((a) => a.name === file.name && a.size === file.size)) {
          next.push(newAttachment(file));
        }
      }
      return next;
    });
    resetFileButton.current?.();
  };
  const toggleTarget = (key: number, target: AttachTarget, checked: boolean) => {
    const current = attachments.find((a) => a.key === key);
    if (!current) return;
    const has = current.attachTo.includes(target);
    if (checked === has) return;
    const attachTo = checked
      ? [...current.attachTo, target]
      : current.attachTo.filter((t) => t !== target);
    // A file keeps at least one target.
    if (attachTo.length === 0) return;
    updateAttachments((prev) => prev.map((a) => (a.key === key ? { ...a, attachTo } : a)));
  };
  const setDescription = (key: number, description: string) =>
    updateAttachments((prev) => prev.map((a) => (a.key === key ? { ...a, description } : a)));
  const removeAttachment = (key: number) =>
    updateAttachments((prev) => prev.filter((a) => a.key !== key));

  const save = async (values: FormValues) => {
    const items = buildItems(values.items, {
      fromDepartmentRequest: Boolean(fromDepartment),
      editing: Boolean(editing),
    });
    if (!items.ok) {
      notify.error(items.error);
      return;
    }

    if (!editing) {
      const files = buildFiles(attachments, items.value.length);
      if (!files.ok) {
        notify.error(files.error);
        return;
      }
      if (items.value.length === 0) {
        notify.warning('En az bir ürün eklemeniz gerekiyor');
        return;
      }
      const request: PlanningRequestInput = {
        title: values.title,
        description: values.description || '',
        priority: normalizePriority(values.priority),
        needed_date: values.needed_date,
        items: items.value,
        ...(files.value.length > 0 ? { files: files.value } : {}),
        ...(values.check_inventory ? { check_inventory: true } : {}),
        ...(fromDepartment ? { department_request_id: fromDepartment.id } : {}),
      };
      onClose();
      onCreateReady?.(request, fromDepartment?.id);
      return;
    }

    let files: PlanningRequestInput['files'];
    if (attachmentsDirty) {
      const built = buildFiles(attachments, items.value.length, { sort: true });
      if (!built.ok) {
        notify.error(built.error);
        return;
      }
      files = built.value;
    }
    const changed = changedFields(original!, {
      title: values.title,
      description: values.description || '',
      priority: normalizePriority(values.priority),
      needed_date: values.needed_date || null,
      items: items.value,
      ...(files ? { files } : {}),
      check_inventory: values.check_inventory || false,
    });
    // attach_to indices point into items, so a files change sends the items too.
    if (changed.files && !changed.items && items.value.length > 0) changed.items = items.value;
    if (Object.keys(changed).length === 0) {
      notify.info('Değişiklik yapılmadı');
      return;
    }
    setSaving(true);
    try {
      await partialUpdatePlanningRequest(editing.id, changed);
      notify.success('Planlama talebi başarıyla güncellendi');
      await queryClient.invalidateQueries({ queryKey: planningRequestKeys.all });
      onClose();
    } catch (error) {
      notify.error(`Planlama talebi güncellenirken hata oluştu: ${errorMessage(error)}`);
    } finally {
      setSaving(false);
    }
  };

  const title = editing
    ? 'Planlama Talebi Düzenle'
    : fromDepartment
      ? 'Planlama Talebi Oluştur (Departman Talebinden)'
      : 'Yeni Planlama Talebi Oluştur';

  return (
    <>
      <FormModal
        opened={!excelOpen}
        onClose={onClose}
        title={title}
        subtitle={
          editing
            ? `#${editing.id}${editing.title ? ` · ${editing.title}` : ''}`
            : fromDepartment
              ? `Departman Talebi #${fromDepartment.id}`
              : undefined
        }
        icon={editing ? 'fas fa-edit' : 'fas fa-plus-circle'}
        size={1400}
        submitting={saving}
        submitLabel={editing ? 'Kaydet' : 'Oluştur'}
        onSubmit={form.onSubmit(save)}
      >
        <Grid gap="lg">
          <Grid.Col span={{ base: 12, md: 6 }}>
            <ModalSection title="Temel Bilgiler" icon="fas fa-info-circle">
              <Stack gap="sm">
                <TextInput
                  label="Başlık"
                  placeholder="Planlama talebi başlığını girin"
                  description={
                    fromDepartment
                      ? 'Planlama talebinin başlığı (departman talebinden alındı)'
                      : 'Planlama talebinin başlığı (zorunlu)'
                  }
                  withAsterisk={Boolean(editing) || !fromDepartment}
                  {...form.getInputProps('title')}
                />
                <Textarea
                  label="Açıklama"
                  placeholder="Planlama talebi açıklamasını girin"
                  description="Planlama talebi hakkında detaylı açıklama (opsiyonel)"
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
                  data={PRIORITY_OPTIONS}
                  allowDeselect={false}
                  {...form.getInputProps('priority')}
                />
                <TextInput
                  type="date"
                  label="İhtiyaç Tarihi"
                  description={
                    editing
                      ? 'Talebin ihtiyaç duyulduğu tarih (opsiyonel)'
                      : 'Talebin ihtiyaç duyulduğu tarih (zorunlu)'
                  }
                  withAsterisk={!editing}
                  {...form.getInputProps('needed_date')}
                />
                <Checkbox
                  label="Envanter Kontrolü"
                  description="Talebi envanter kontrolü için gönder"
                  {...form.getInputProps('check_inventory', { type: 'checkbox' })}
                />
              </Stack>
            </ModalSection>
          </Grid.Col>
        </Grid>

        <ModalSection title="Ürün Bilgileri" icon="fas fa-boxes">
          <Stack gap="xs">
            <Group justify="space-between">
              <Text fw={600} size="sm">
                Ürün Listesi
              </Text>
              <Group gap="xs">
                <Button
                  size="xs"
                  variant="default"
                  leftSection={<FaIcon icon="fas fa-plus" />}
                  onClick={addRow}
                >
                  Ürün Ekle
                </Button>
                <Button
                  size="xs"
                  variant="default"
                  color="green"
                  leftSection={<FaIcon icon="fas fa-file-excel" />}
                  onClick={() => setExcelOpen(true)}
                >
                  Excel&apos;den İçe Aktar
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

            <Grid columns={24} gap="xs" visibleFrom="md">
              {(
                [
                  ['Ürün Kodu/ID *', 4],
                  ['Ürün Adı', 4],
                  ['Ürün Açıklaması', 3],
                  ['İş No', 4],
                  ['Miktar', 2],
                  ['Birim', 2],
                  ['Özellikler', 3],
                  ['İşlem', 2],
                ] as const
              ).map(([label, span]) => (
                <Grid.Col key={label} span={span}>
                  <Text size="xs" c="dimmed" fw={600}>
                    {label}
                  </Text>
                </Grid.Col>
              ))}
            </Grid>

            {rows.map((row, index) => {
              const locked = Boolean(row.converted);
              return (
                <Grid
                  key={row.key}
                  columns={24}
                  gap="xs"
                  data-testid="item-row"
                  style={locked ? { opacity: 0.8 } : undefined}
                >
                  <Grid.Col span={{ base: 12, md: 4 }}>
                    <TextInput
                      size="xs"
                      placeholder="Ürün kodu veya ID"
                      aria-label={`Ürün kodu ${index + 1}`}
                      disabled={locked}
                      {...form.getInputProps(`items.${index}.item_code`)}
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, md: 4 }}>
                    <TextInput
                      size="xs"
                      placeholder="Ürün adı"
                      aria-label={`Ürün adı ${index + 1}`}
                      disabled={locked}
                      {...form.getInputProps(`items.${index}.item_name`)}
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, md: 3 }}>
                    <TextInput
                      size="xs"
                      placeholder="Ürün açıklaması"
                      aria-label={`Ürün açıklaması ${index + 1}`}
                      disabled={locked}
                      {...form.getInputProps(`items.${index}.item_description`)}
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, md: 4 }}>
                    <Select
                      size="xs"
                      placeholder="İş emri seçin"
                      aria-label={`İş no ${index + 1}`}
                      searchable
                      clearable
                      limit={100}
                      disabled={locked}
                      data={jobOrderData}
                      {...form.getInputProps(`items.${index}.job_no`)}
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 8, md: 2 }}>
                    <NumberInput
                      size="xs"
                      placeholder="Miktar"
                      aria-label={`Miktar ${index + 1}`}
                      min={0.01}
                      step={0.01}
                      disabled={locked}
                      {...form.getInputProps(`items.${index}.quantity`)}
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 8, md: 2 }}>
                    <Select
                      size="xs"
                      aria-label={`Birim ${index + 1}`}
                      allowDeselect={false}
                      disabled={locked}
                      data={
                        unitData.some((u) => u.value === row.item_unit)
                          ? unitData
                          : [...unitData, { value: row.item_unit, label: row.item_unit }]
                      }
                      {...form.getInputProps(`items.${index}.item_unit`)}
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, md: 3 }}>
                    <TextInput
                      size="xs"
                      placeholder="Özellikler"
                      aria-label={`Özellikler ${index + 1}`}
                      disabled={locked}
                      {...form.getInputProps(`items.${index}.specifications`)}
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 8, md: 2 }}>
                    {row.inventoryLocked ? (
                      <Tooltip label="Envanterden geri al (stoğa iade et)" withArrow>
                        <ActionIcon
                          variant="default"
                          aria-label="Envanterden geri al (stoğa iade et)"
                          onClick={() => void releaseInventory(row)}
                        >
                          <FaIcon icon="fas fa-rotate-left" />
                        </ActionIcon>
                      </Tooltip>
                    ) : (
                      <Tooltip label={lockReason(row)} withArrow>
                        <ActionIcon
                          variant="default"
                          color="red"
                          aria-label={lockReason(row)}
                          disabled={row.deletable === false}
                          onClick={() => removeRow(index)}
                        >
                          <FaIcon icon="fas fa-trash" />
                        </ActionIcon>
                      </Tooltip>
                    )}
                  </Grid.Col>
                </Grid>
              );
            })}
          </Stack>
        </ModalSection>

        <ModalSection title="Dosya Ekleri" icon="fas fa-paperclip">
          <Stack gap="sm">
            <Group gap="sm">
              <FileButton onChange={addFiles} multiple resetRef={resetFileButton}>
                {(props) => (
                  <Button
                    {...props}
                    size="xs"
                    variant="default"
                    leftSection={<FaIcon icon="fas fa-file" />}
                  >
                    Dosya Seç
                  </Button>
                )}
              </FileButton>
              <Text size="xs" c="dimmed">
                Birden fazla dosya seçebilirsiniz
              </Text>
            </Group>
            {attachments.length === 0 ? (
              <Text size="sm" c="dimmed">
                Henüz dosya eklenmedi
              </Text>
            ) : (
              attachments.map((attachment) => (
                <Paper
                  key={attachment.key}
                  withBorder
                  p="sm"
                  data-testid="attachment"
                  style={
                    attachment.isExisting
                      ? { borderColor: 'var(--mantine-color-cyan-4)' }
                      : undefined
                  }
                >
                  <Group justify="space-between" align="flex-start" wrap="nowrap" mb="xs">
                    <Box style={{ minWidth: 0 }}>
                      <Text fw={600} size="sm">
                        <FaIcon icon="fas fa-file" /> {attachment.description || attachment.name}
                        {attachment.isExisting && fromDepartment ? (
                          <Badge ml="xs" color="cyan" variant="light">
                            Departman Talebinden
                          </Badge>
                        ) : null}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {attachment.isExisting ? (
                          <Badge size="xs" color="cyan" variant="light">
                            Mevcut Dosya
                          </Badge>
                        ) : (
                          `${(attachment.size / 1024).toFixed(2)} KB`
                        )}{' '}
                        - {attachment.name}
                      </Text>
                    </Box>
                    <Group gap={4} wrap="nowrap">
                      {attachment.isExisting && attachment.url ? (
                        <ActionIcon
                          variant="default"
                          aria-label={`${attachment.name} görüntüle`}
                          onClick={() =>
                            setViewing({ url: attachment.url!, name: attachment.name })
                          }
                        >
                          <FaIcon icon="fas fa-eye" />
                        </ActionIcon>
                      ) : null}
                      <ActionIcon
                        variant="default"
                        color="red"
                        aria-label={`${attachment.name} kaldır`}
                        onClick={() => removeAttachment(attachment.key)}
                      >
                        <FaIcon icon="fas fa-trash" />
                      </ActionIcon>
                    </Group>
                  </Group>
                  <TextInput
                    size="xs"
                    label="Açıklama"
                    placeholder="Dosya açıklaması (opsiyonel)"
                    value={attachment.description}
                    onChange={(e) => setDescription(attachment.key, e.currentTarget.value)}
                    mb="xs"
                  />
                  <Text size="xs" c="dimmed" mb={4}>
                    <FaIcon icon="fas fa-link" /> Bu dosyayı ekle:
                  </Text>
                  <Group gap="md">
                    <Checkbox
                      size="xs"
                      label="Talep"
                      checked={attachment.attachTo.includes('request')}
                      onChange={(e) =>
                        toggleTarget(attachment.key, 'request', e.currentTarget.checked)
                      }
                    />
                    {rows.map((row, itemIndex) => (
                      <Checkbox
                        key={row.key}
                        size="xs"
                        label={rowTargetLabel(row, itemIndex)}
                        checked={attachment.attachTo.includes(itemIndex)}
                        onChange={(e) =>
                          toggleTarget(attachment.key, itemIndex, e.currentTarget.checked)
                        }
                      />
                    ))}
                  </Group>
                </Paper>
              ))
            )}
          </Stack>
        </ModalSection>
      </FormModal>

      {excelOpen ? (
        <ExcelImportModal
          onClose={() => setExcelOpen(false)}
          onImport={(imported) => {
            for (const item of imported) {
              form.insertListItem(
                'items',
                itemRow({
                  item_code: item.item_code,
                  item_name: item.item_name,
                  item_description: item.item_description,
                  job_no: item.job_no || null,
                  quantity: item.quantity,
                  item_unit: item.unit,
                  specifications: item.specifications,
                }),
              );
            }
          }}
        />
      ) : null}

      <FileViewer
        files={viewing ? [viewing] : []}
        index={viewing ? 0 : null}
        onIndexChange={() => {}}
        onClose={() => setViewing(null)}
      />
    </>
  );
}
