import { hasPerm, isSuperuser } from '@legacy/authService.js';
import {
  ActionIcon,
  Alert,
  Anchor,
  Button,
  Checkbox,
  FileButton,
  Grid,
  Group,
  Loader,
  Modal,
  Paper,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Tooltip,
} from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { isApiError } from '@/api/client';
import type { MachineDropdownOption } from '@/api/manufacturing/finishedTimers';
import {
  deletePartFile,
  markOperationCompleted,
  partCostQueryOptions,
  partDetailsQueryOptions,
  partsKeys,
  unmarkOperationCompleted,
  updatePartOperations,
  uploadPartFiles,
  type MachiningPart,
  type OperationInput,
  type PartCost,
  type PartFile,
  type PartOperation,
  type PlanSummary,
} from '@/api/manufacturing/machiningParts';
import {
  confirm,
  DataTable,
  FaIcon,
  ModalBody,
  ModalHeader,
  ModalSection,
  modalClassNames,
  notify,
  StatusBadge,
  type CellEdit,
  type DataTableColumn,
} from '@/ui';
import {
  AllocationTable,
  allocationTooltip,
  formatSharePercent,
  getPartAllocations,
} from './allocations';
import classes from './MachiningParts.module.css';
import { ManualTimeModal } from './PartModals';
import { formatIsoDate, formatPlanStamp } from './planFormat';

/** One row of the operations editor: the operation as edited, and how it came from the server. */
interface OperationDraft {
  rowId: string;
  /** null for a row added here. */
  key: string | null;
  order: number;
  name: string;
  description: string;
  machine: string;
  estimated_hours: number | null;
  interchangeable: boolean;
  completed: boolean;
  hoursSpent: number;
  plannedStart: number | null;
  plannedEnd: number | null;
  planLocked: boolean;
  original: OperationDraft | null;
}

function toDraft(op: PartOperation): OperationDraft {
  const hours = op.estimated_hours;
  const draft: OperationDraft = {
    rowId: op.key,
    key: op.key,
    order: Number(op.order) || 0,
    name: op.name ?? '',
    description: op.description ?? '',
    machine: op.machine_fk ? String(op.machine_fk) : '',
    estimated_hours: hours === null || hours === undefined || hours === '' ? null : Number(hours),
    interchangeable: Boolean(op.interchangeable),
    completed: op.completion_date !== null && op.completion_date !== undefined,
    hoursSpent: Number.parseFloat(String(op.total_hours_spent ?? 0)) || 0,
    plannedStart: op.planned_start_ms ?? null,
    plannedEnd: op.planned_end_ms ?? null,
    planLocked: Boolean(op.plan_locked),
    original: null,
  };
  draft.original = { ...draft };
  return draft;
}

const EDITED_FIELDS = [
  'name',
  'description',
  'machine',
  'estimated_hours',
  'interchangeable',
] as const;

function canViewJobCosts(): boolean {
  try {
    return isSuperuser() || hasPerm('view_job_costs');
  } catch {
    return false;
  }
}

function hasFlag(flags: PlanSummary['flags'], name: string): boolean {
  return Array.isArray(flags) ? flags.includes(name) : Boolean(flags && flags[name]);
}

function PlanSummaryLine({ summary }: { summary: PlanSummary }) {
  const due = formatIsoDate(summary.due_date);
  const source =
    summary.due_source === 'part' ? 'parça' : summary.due_source === 'job_order' ? 'iş emri' : '';
  const items = [
    <span key="due">
      <strong>Termin:</strong> {due ? `${due}${source ? ` (${source})` : ''}` : '-'}
    </span>,
    <span key="finish">
      <strong>Tahmini bitiş:</strong>{' '}
      {summary.projected_finish_ms ? formatPlanStamp(summary.projected_finish_ms, true) : '-'}
    </span>,
  ];
  if (summary.projected_late) {
    items.push(
      <span key="late" title="Tahmini bitiş termini aşıyor">
        <StatusBadge color="red">Geç</StatusBadge>
      </span>,
    );
  }
  if (hasFlag(summary.flags, 'estimate_missing')) {
    items.push(
      <Text
        key="est"
        span
        size="xs"
        c="dimmed"
        title="Bir veya daha fazla operasyonda tahmini saat yok"
      >
        tahmin eksik
      </Text>,
    );
  }
  if (hasFlag(summary.flags, 'due_missing')) {
    items.push(
      <Text key="dm" span size="xs" c="dimmed" title="Parçanın ve bağlı iş emirlerinin termini yok">
        termin yok
      </Text>,
    );
  }
  return (
    <Group gap={8} mb="sm" fz="sm">
      <FaIcon icon="fas fa-calendar-alt" />
      {items.flatMap((item, i) =>
        i === 0
          ? [item]
          : [
              <Text key={`sep-${i}`} span c="dimmed">
                ·
              </Text>,
              item,
            ],
      )}
    </Group>
  );
}

function CostCard({ partKey }: { partKey: string }) {
  const cost = useQuery(partCostQueryOptions(partKey));
  if (cost.isPending) {
    return (
      <Text size="sm" c="dimmed">
        <FaIcon icon="fas fa-spinner fa-spin" /> Maliyet yükleniyor...
      </Text>
    );
  }
  if (cost.isError) {
    // Not allowed to see costs: hide quietly.
    if (isApiError(cost.error) && cost.error.status === 403) return null;
    return (
      <Text size="sm" c="dimmed">
        Maliyet bilgisi alınamadı
      </Text>
    );
  }
  return <CostTable cost={cost.data} />;
}

function CostTable({ cost }: { cost: PartCost }) {
  const currency = cost.currency || 'EUR';
  const money = (v: unknown) =>
    `${Number(v || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
  const hours = (v: unknown) =>
    Number(v || 0).toLocaleString('tr-TR', { maximumFractionDigits: 2 });
  const rows = cost.job_allocations ?? [];
  return (
    <div>
      <div className={classes.costStats}>
        {[
          ['Toplam maliyet', money(cost.total_cost)],
          ['Birim maliyet', money(cost.unit_cost)],
          ['Toplam saat', `${hours(cost.hours?.total)} s`],
          ['Toplam adet', String(cost.total_quantity ?? '-')],
        ].map(([label, value]) => (
          <div className={classes.costStat} key={label}>
            <div className={classes.costStatLabel}>{label}</div>
            <div className={classes.costStatValue}>{value}</div>
          </div>
        ))}
      </div>
      <Table withTableBorder withColumnBorders fz="sm">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>İş Emri</Table.Th>
            <Table.Th ta="right">Adet</Table.Th>
            <Table.Th ta="right">Pay</Table.Th>
            <Table.Th ta="right">Saat</Table.Th>
            <Table.Th ta="right">Maliyet</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.length ? (
            rows.map((a, i) => (
              <Table.Tr key={`${a.job_no}-${i}`}>
                <Table.Td>{a.job_no || '-'}</Table.Td>
                <Table.Td ta="right">{a.quantity ?? '-'}</Table.Td>
                <Table.Td ta="right">{formatSharePercent(a.share)}</Table.Td>
                <Table.Td ta="right">{hours(a.hours?.total)} s</Table.Td>
                <Table.Td ta="right">{money(a.total_cost)}</Table.Td>
              </Table.Tr>
            ))
          ) : (
            <Table.Tr>
              <Table.Td colSpan={5} ta="center" c="dimmed">
                Kayıt yok
              </Table.Td>
            </Table.Tr>
          )}
        </Table.Tbody>
      </Table>
    </div>
  );
}

function fileName(file: PartFile): string {
  return file.file_name ? String(file.file_name).split('/').pop() || 'Dosya' : 'Dosya';
}

interface PartDetailsModalProps {
  /** The list row (or a stand-in with just the key). */
  part: MachiningPart;
  machines: MachineDropdownOption[];
  onClose: () => void;
}

let newRowSequence = 0;

/** Port of showPartDetails / showPartDetailsModal: allocations, cost, operations editor, files. */
export function PartDetailsModal({ part, machines, onClose }: PartDetailsModalProps) {
  const queryClient = useQueryClient();
  const details = useQuery(partDetailsQueryOptions(part.key));
  const [drafts, setDrafts] = useState<OperationDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [manualTime, setManualTime] = useState<OperationDraft | null>(null);

  useEffect(() => {
    if (details.isError) {
      notify.error('Parça detayları gösterilirken hata oluştu');
      onClose();
    }
  }, [details.isError, onClose]);

  // Every (re)load starts the editor over from the server rows.
  const operations = details.data?.operations;
  const [syncedFrom, setSyncedFrom] = useState<PartOperation[] | undefined>(undefined);
  if (operations && operations !== syncedFrom) {
    setSyncedFrom(operations);
    setDrafts(operations.map(toDraft));
  }

  const isLocked = Boolean(part.is_locked || part.department_request_id);
  const allocations = getPartAllocations(part);
  const jobNoLabel = part.job_no || (allocations.length ? allocations[0]!.job_no : '');
  const planSummary = details.data?.detail?.plan_summary ?? null;
  // The detail carries the current files; the list row may be older.
  const files = details.data?.detail?.files ?? part.files ?? [];
  const showCost = canViewJobCosts();

  const reload = async (withList = false) => {
    await queryClient.invalidateQueries({ queryKey: partsKeys.operations(part.key) });
    if (withList) await queryClient.invalidateQueries({ queryKey: partsKeys.all });
  };

  const readOnly = (row: OperationDraft) => row.completed || isLocked;

  const move = (rowId: string, step: -1 | 1) =>
    setDrafts((rows) => {
      const index = rows.findIndex((r) => r.rowId === rowId);
      const target = index + step;
      if (index < 0 || target < 0 || target >= rows.length) return rows;
      const next = [...rows];
      const a = next[index]!;
      const b = next[target]!;
      // Swap the order values and the rows (legacy moveOperationUp/Down).
      next[index] = { ...b, order: a.order };
      next[target] = { ...a, order: b.order };
      return next;
    });

  const addRow = () =>
    setDrafts((rows) => {
      const maxOrder = rows.reduce((max, r) => Math.max(max, r.order || 0), 0);
      const row: OperationDraft = {
        rowId: `new-${++newRowSequence}`,
        key: null,
        order: maxOrder + 1,
        name: '',
        description: '',
        machine: '',
        estimated_hours: null,
        interchangeable: false,
        completed: false,
        hoursSpent: 0,
        plannedStart: null,
        plannedEnd: null,
        planLocked: false,
        original: null,
      };
      // Rows stay sorted by their order value (legacy sortRowsByOrder).
      return [...rows, row].sort((x, y) => (x.order || 999999) - (y.order || 999999));
    });

  const toggleCompletion = async (row: OperationDraft) => {
    if (!row.key) return;
    try {
      if (row.completed) {
        await unmarkOperationCompleted(row.key);
        notify.info('Operasyon tamamlanmamış olarak işaretlendi');
      } else {
        await markOperationCompleted(row.key);
        notify.success('Operasyon tamamlandı olarak işaretlendi');
      }
      await reload(true);
    } catch (error) {
      notify.error(
        `Operasyon durumu değiştirilirken hata oluştu: ${error instanceof Error && error.message ? error.message : 'Bilinmeyen hata'}`,
      );
    }
  };

  const machineOptions = useMemo(
    () => machines.map((m) => ({ value: String(m.id), label: m.name })),
    [machines],
  );

  const columns = useMemo<DataTableColumn<OperationDraft>[]>(
    () => [
      {
        key: 'key',
        header: 'Key',
        width: '12%',
        render: (row) => <span className={classes.partKey}>{row.key ?? 'Yeni'}</span>,
      },
      { key: 'name', header: 'Operasyon Adı', width: '15%', editable: true },
      { key: 'description', header: 'Açıklama', width: '12%', editable: true },
      {
        key: 'machine',
        header: 'Makine',
        width: '10%',
        editable: {
          type: 'select',
          options: [{ value: '', label: 'Makine seçin...' }, ...machineOptions],
        },
        render: (row) =>
          machineOptions.find((o) => o.value === row.machine)?.label ?? (
            <Text span size="sm" c="dimmed">
              Makine seçin...
            </Text>
          ),
      },
      {
        key: 'estimated_hours',
        header: 'Tahmini Saat',
        width: '9%',
        editable: { type: 'number', min: 0, step: 0.01 },
      },
      {
        key: 'hoursSpent',
        header: 'Harcanan Saat',
        width: '9%',
        align: 'center',
        render: (row) => (row.hoursSpent > 0 ? `${row.hoursSpent.toFixed(2)} saat` : '-'),
      },
      {
        key: 'plan',
        header: 'Plan',
        width: '10%',
        align: 'center',
        render: (row) => {
          const start = formatPlanStamp(row.plannedStart);
          const end = formatPlanStamp(row.plannedEnd);
          if (!start && !end) return '-';
          return (
            <Text span size="xs" style={{ whiteSpace: 'nowrap' }}>
              {start || '?'} → {end || '?'}
              {row.planLocked ? (
                <span title="Sıra kilitli">
                  {' '}
                  <FaIcon icon="fas fa-lock" />
                </span>
              ) : null}
            </Text>
          );
        },
      },
      {
        key: 'interchangeable',
        header: 'Değiştirilebilir',
        width: '7%',
        align: 'center',
        render: (row) => (
          <Group justify="center">
            <Checkbox
              aria-label="Değiştirilebilir"
              checked={row.interchangeable}
              disabled={row.completed || isLocked}
              onChange={(event) => {
                const checked = event.currentTarget.checked;
                setDrafts((rows) =>
                  rows.map((r) => (r.rowId === row.rowId ? { ...r, interchangeable: checked } : r)),
                );
              }}
            />
          </Group>
        ),
      },
      {
        key: 'status',
        header: 'Durum',
        width: '7%',
        align: 'center',
        render: (row) => (
          <Stack gap={6} align="center">
            {row.completed ? (
              <StatusBadge color="green">Tamamlandı</StatusBadge>
            ) : isLocked ? (
              <StatusBadge color="blue">Kilitli</StatusBadge>
            ) : row.hoursSpent > 0 ? (
              <StatusBadge color="yellow">Çalışıldı</StatusBadge>
            ) : (
              <StatusBadge color="grey">Bekliyor</StatusBadge>
            )}
            {row.key && !isLocked ? (
              row.completed ? (
                <Button
                  size="compact-xs"
                  variant="outline"
                  color="yellow"
                  title="Tamamlanmamış olarak işaretle"
                  leftSection={<FaIcon icon="fas fa-undo" />}
                  onClick={() => void toggleCompletion(row)}
                >
                  Geri Al
                </Button>
              ) : (
                <Button
                  size="compact-xs"
                  variant="outline"
                  color="green"
                  title="Tamamlandı olarak işaretle"
                  leftSection={<FaIcon icon="fas fa-check" />}
                  onClick={() => void toggleCompletion(row)}
                >
                  Tamamla
                </Button>
              )
            ) : null}
          </Stack>
        ),
      },
      {
        key: 'actions',
        header: 'İşlem',
        width: '7%',
        align: 'center',
        render: (row) => (
          <Stack gap={6} align="center">
            {row.key && !isLocked ? (
              <Button
                size="compact-xs"
                variant="outline"
                title="Manuel Zaman Girişi"
                leftSection={<FaIcon icon="fas fa-clock" />}
                onClick={() => setManualTime(row)}
              >
                Manuel Zaman
              </Button>
            ) : null}
            {!readOnly(row) ? (
              <Group gap={4} wrap="nowrap">
                <ActionIcon
                  variant="default"
                  title="Yukarı Taşı"
                  aria-label="Yukarı Taşı"
                  onClick={() => move(row.rowId, -1)}
                >
                  <FaIcon icon="fas fa-arrow-up" />
                </ActionIcon>
                <ActionIcon
                  variant="default"
                  title="Aşağı Taşı"
                  aria-label="Aşağı Taşı"
                  onClick={() => move(row.rowId, 1)}
                >
                  <FaIcon icon="fas fa-arrow-down" />
                </ActionIcon>
                <ActionIcon
                  variant="default"
                  color="red"
                  title="Kaldır"
                  aria-label="Kaldır"
                  onClick={() => setDrafts((rows) => rows.filter((r) => r.rowId !== row.rowId))}
                >
                  <FaIcon icon="fas fa-trash" />
                </ActionIcon>
              </Group>
            ) : null}
          </Stack>
        ),
      },
    ],
    // toggleCompletion and readOnly only read isLocked and stable setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [machineOptions, isLocked],
  );

  const editDraft = ({ rowId, columnKey, value }: CellEdit<OperationDraft>) =>
    setDrafts((rows) => rows.map((r) => (r.rowId === rowId ? { ...r, [columnKey]: value } : r)));

  const isDirty = (row: OperationDraft, columnKey: string) => {
    if (!row.original) return true;
    if (!(EDITED_FIELDS as readonly string[]).includes(columnKey)) return false;
    const key = columnKey as (typeof EDITED_FIELDS)[number];
    return row[key] !== row.original[key];
  };

  const saveOperations = async () => {
    const payload: OperationInput[] = [];
    const seen = new Set<string>();
    let invalid = false;
    for (const row of drafts) {
      const name = row.name.trim();
      const machineFk = row.machine ? Number.parseInt(row.machine, 10) : null;
      if (row.key) seen.add(row.key);
      if (!name) {
        invalid = true;
        continue;
      }
      // Completed operations are kept as they are.
      if (row.key && row.completed) continue;
      if (!machineFk) {
        invalid = true;
        continue;
      }
      payload.push({
        ...(row.key ? { key: row.key } : {}),
        name,
        description: row.description.trim() || null,
        machine_fk: machineFk,
        order: row.order || 1,
        interchangeable: row.interchangeable,
        estimated_hours: row.estimated_hours,
      });
    }
    if (invalid) {
      notify.error('Lütfen tüm operasyonlar için ad ve makine seçin');
      return;
    }
    // Operations that were there and are gone now (completed ones are never deleted).
    const deleteOperations = (operations ?? [])
      .filter((op) => op.key && !seen.has(op.key) && !op.completion_date)
      .map((op) => op.key);
    setSaving(true);
    try {
      await updatePartOperations(part.key, {
        operations: payload,
        delete_operations: deleteOperations,
      });
      notify.success('Operasyonlar başarıyla güncellendi');
      await reload(true);
    } catch (error) {
      notify.error(
        `Operasyonlar kaydedilirken hata oluştu: ${error instanceof Error && error.message ? error.message : 'Bilinmeyen hata'}`,
      );
    } finally {
      setSaving(false);
    }
  };

  const upload = async (picked: File[]) => {
    if (!picked.length) return;
    try {
      await uploadPartFiles(part.key, picked);
      notify.success('Dosyalar yüklendi');
      await reload(true);
    } catch (error) {
      notify.error(error, { fallback: 'Dosya yüklenirken hata oluştu' });
    }
  };

  const removeFile = async (file: PartFile) => {
    if (isLocked) return;
    const ok = await confirm({
      title: 'Dosya Silme Onayı',
      message: 'Bu dosyayı silmek istediğinize emin misiniz?',
      confirmLabel: 'Sil',
      cancelLabel: 'İptal',
      danger: true,
    });
    if (!ok) return;
    try {
      await deletePartFile(file.id);
      notify.success('Dosya silindi');
      await reload(true);
    } catch (error) {
      notify.error(error, { fallback: 'Dosya silinemedi' });
    }
  };

  const title = `Operasyonlar - ${part.key} - ${part.name}${jobNoLabel ? ` · İş No: ${jobNoLabel}` : ''}${isLocked ? ' (Kilitli)' : ''}`;

  return (
    <>
      <Modal
        opened
        onClose={onClose}
        fullScreen
        withCloseButton={false}
        classNames={modalClassNames}
      >
        <ModalHeader title={title} icon="fas fa-cogs" />
        <ModalBody>
          <ModalSection title="İş Emri Dağılımı" icon="fas fa-sitemap">
            <Grid gap="md">
              <Grid.Col span={{ base: 12, md: 5 }}>
                <Group gap={8} mb="xs">
                  <Text size="sm" fw={600}>
                    İş No: {jobNoLabel || '-'}
                  </Text>
                  {part.is_multi_job ? (
                    <Tooltip
                      label={<span className={classes.preLine}>{allocationTooltip(part)}</span>}
                    >
                      <span>
                        <StatusBadge color="blue">{allocations.length} iş emri</StatusBadge>
                      </span>
                    </Tooltip>
                  ) : null}
                </Group>
                <AllocationTable allocations={allocations} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 7 }}>
                {showCost ? <CostCard partKey={part.key} /> : null}
              </Grid.Col>
            </Grid>
          </ModalSection>

          <ModalSection title="Operasyonlar" icon="fas fa-cogs">
            {isLocked ? (
              <Alert color="blue" icon={<FaIcon icon="fas fa-lock" />} mb="sm" p="xs">
                Bu parça departman talebine dönüştürüldü; operasyonlar düzenlenemez.
              </Alert>
            ) : null}
            {planSummary ? <PlanSummaryLine summary={planSummary} /> : null}
            <Group justify="space-between" mb="sm">
              <Button
                size="xs"
                leftSection={<FaIcon icon="fas fa-plus" />}
                disabled={isLocked}
                onClick={addRow}
              >
                Satır Ekle
              </Button>
              <Button
                size="xs"
                color="green"
                leftSection={<FaIcon icon="fas fa-save" />}
                disabled={isLocked}
                loading={saving}
                onClick={() => void saveOperations()}
              >
                Değişiklikleri Kaydet
              </Button>
            </Group>
            {details.isPending ? (
              <Group justify="center" p="md">
                <Loader size="sm" />
              </Group>
            ) : (
              <DataTable
                data={drafts}
                columns={columns}
                getRowId={(row) => row.rowId}
                onCellEdit={editDraft}
                isRowEditable={(row) => !readOnly(row)}
                isCellDirty={isDirty}
                emptyMessage="Henüz operasyon eklenmemiş"
                withColumnBorders
              />
            )}
          </ModalSection>

          <ModalSection title="Dosyalar" icon="fas fa-paperclip">
            {!isLocked ? (
              <FileButton multiple onChange={(picked) => void upload(picked)}>
                {(props) => (
                  <Button
                    {...props}
                    size="xs"
                    variant="outline"
                    mb="sm"
                    leftSection={<FaIcon icon="fas fa-upload" />}
                  >
                    Dosya Yükle
                  </Button>
                )}
              </FileButton>
            ) : null}
            {files.length === 0 ? (
              <Text size="sm" c="dimmed">
                Dosya yok
              </Text>
            ) : (
              <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="sm">
                {files.map((file) => (
                  <Paper key={file.id} withBorder p="xs" radius="sm">
                    <Group gap="xs" wrap="nowrap">
                      <FaIcon icon="fas fa-file" />
                      <Anchor
                        href={file.file_url ?? undefined}
                        target="_blank"
                        rel="noopener noreferrer"
                        size="sm"
                        lineClamp={1}
                        style={{ flex: 1, minWidth: 0 }}
                        title={fileName(file)}
                      >
                        {fileName(file)}
                      </Anchor>
                      {!isLocked ? (
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          aria-label={`${fileName(file)} sil`}
                          title="Sil"
                          onClick={() => void removeFile(file)}
                        >
                          <FaIcon icon="fas fa-trash" />
                        </ActionIcon>
                      ) : null}
                    </Group>
                  </Paper>
                ))}
              </SimpleGrid>
            )}
          </ModalSection>
        </ModalBody>
      </Modal>
      {manualTime?.key ? (
        <ManualTimeModal
          operationKey={manualTime.key}
          machineFk={manualTime.machine ? Number(manualTime.machine) : null}
          machines={machines}
          onClose={() => setManualTime(null)}
          onSaved={() => void reload()}
        />
      ) : null}
    </>
  );
}
