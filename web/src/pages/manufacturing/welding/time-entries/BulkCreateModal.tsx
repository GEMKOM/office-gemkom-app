import {
  Alert,
  Badge,
  Button,
  Group,
  ScrollArea,
  Stack,
  Table,
  Text,
  Textarea,
} from '@mantine/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { JobOrderOption } from '@/api/reference/jobOrders';
import type { UserOption } from '@/api/reference/users';
import {
  useBulkCreateWeldingTimeEntries,
  weldingTimeEntryErrorMessage,
} from '@/api/welding/timeEntries';
import { formatDate } from '@/lib/format';
import {
  confirm,
  DataTable,
  FaIcon,
  FormModal,
  ModalSection,
  notify,
  Panel,
  type CellEdit,
  type DataTableColumn,
  type EditOption,
  type RowAction,
} from '@/ui';
import {
  BULK_COLUMNS,
  MAX_BULK_ROWS,
  OVERTIME_LABELS,
  OVERTIME_OPTIONS,
  blankRow,
  getUserDisplayName,
  getUserOptionLabel,
  isBlankRow,
  newRowKey,
  parseExcelPaste,
  usersForRow,
  validateBulkRows,
  type BulkField,
  type BulkRow,
  type FailedPasteRow,
} from './bulkPaste';

type NoticeType = 'success' | 'info' | 'warning' | 'error';
interface Notice {
  type: NoticeType;
  lines: string[];
}

const NOTICE_COLOR: Record<NoticeType, string> = {
  success: 'green',
  info: 'blue',
  warning: 'yellow',
  error: 'red',
};

/** Above this many rows the editor renders only the visible ones. */
const VIRTUALIZE_FROM = 100;

function header(key: BulkField): string {
  const col = BULK_COLUMNS.find((c) => c.key === key);
  return col ? `${col.label}${col.required ? ' *' : ''}` : key;
}

function Placeholder({ children }: { children: string }) {
  return (
    <Text span size="sm" c="dimmed">
      {children}
    </Text>
  );
}

export interface BulkCreateModalProps {
  /** Active users (pickers). */
  users: readonly UserOption[];
  /** Every account, for matching pasted names of people who have left. */
  allUsers: readonly UserOption[];
  jobOrders: readonly JobOrderOption[];
  onClose: () => void;
}

/**
 * Port of the "Toplu Zaman Kaydı Oluştur" modal (setupBulkCreateForm): an
 * editable grid of up to 300 draft rows, an Excel paste with preview, and one
 * bulk-create request. Mount it to open it; closing drops the draft, as
 * legacy's cancel did.
 */
export function BulkCreateModal({ users, allUsers, jobOrders, onClose }: BulkCreateModalProps) {
  const [rows, setRows] = useState<BulkRow[]>(() => [blankRow()]);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [preview, setPreview] = useState<BulkRow[] | null>(null);
  const [failed, setFailed] = useState<FailedPasteRow[]>([]);
  const [notice, setNotice] = useState<Notice | null>(null);
  const pasteInput = useRef<HTMLTextAreaElement>(null);
  const bulkCreate = useBulkCreateWeldingTimeEntries();

  const show = (type: NoticeType, ...lines: string[]) => setNotice({ type, lines });
  // Legacy modal notices faded out after five seconds.
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  const usersById = useMemo(() => {
    const map = new Map<string, UserOption>();
    for (const u of allUsers) map.set(String(u.id), u);
    for (const u of users) map.set(String(u.id), u);
    return map;
  }, [users, allUsers]);
  const jobsByNo = useMemo(() => new Map(jobOrders.map((j) => [j.job_no, j])), [jobOrders]);

  const columns = useMemo<DataTableColumn<BulkRow>[]>(() => {
    const userOptions: EditOption[] = users.map((u) => ({
      value: String(u.id),
      label: getUserOptionLabel(u),
    }));
    const jobOptions: EditOption[] = [
      { value: '', label: 'İş no seçin...' },
      ...jobOrders.map((j) => ({ value: j.job_no, label: `${j.job_no} - ${j.title}` })),
    ];
    const employeeLabel = (row: BulkRow) => {
      const user = usersById.get(row.employee);
      return user ? getUserOptionLabel(user) : row.employee_label || `Kullanıcı #${row.employee}`;
    };
    return [
      {
        key: 'employee',
        header: header('employee'),
        width: '22%',
        render: (row) =>
          row.employee ? employeeLabel(row) : <Placeholder>Çalışan seçin...</Placeholder>,
        editable: {
          type: 'select',
          options: (row) => {
            const list = usersForRow(row, users, allUsers);
            const options: EditOption[] = [
              { value: '', label: 'Çalışan seçin...' },
              ...(list === users
                ? userOptions
                : list.map((u) => ({ value: String(u.id), label: getUserOptionLabel(u) }))),
            ];
            if (row.employee && !options.some((o) => o.value === row.employee)) {
              options.push({ value: row.employee, label: employeeLabel(row) });
            }
            return options;
          },
        },
      },
      {
        key: 'job_no',
        header: header('job_no'),
        width: '20%',
        render: (row) => {
          if (!row.job_no) return <Placeholder>İş no seçin...</Placeholder>;
          const job = jobsByNo.get(row.job_no);
          return job ? `${job.job_no} - ${job.title}` : row.job_no;
        },
        editable: { type: 'select', options: jobOptions },
      },
      {
        key: 'date',
        header: header('date'),
        width: '12%',
        render: (row) => (row.date ? formatDate(row.date) : <Placeholder>gg.aa.yyyy</Placeholder>),
        editable: { type: 'date' },
      },
      {
        key: 'hours',
        header: header('hours'),
        width: '9%',
        render: (row) =>
          row.hours ? row.hours.replace('.', ',') : <Placeholder>0,00</Placeholder>,
        editable: { type: 'number', min: 0.01, step: 0.01 },
      },
      {
        key: 'overtime_type',
        header: header('overtime_type'),
        width: '14%',
        render: (row) =>
          row.overtime_type ? (
            (OVERTIME_LABELS[row.overtime_type] ?? row.overtime_type)
          ) : (
            <Placeholder>Seçin...</Placeholder>
          ),
        editable: {
          type: 'select',
          options: [{ value: '', label: 'Seçin...' }, ...OVERTIME_OPTIONS],
        },
      },
      {
        key: 'description',
        header: header('description'),
        render: (row) => row.description || <Placeholder>Açıklama</Placeholder>,
        editable: true,
      },
    ];
  }, [users, allUsers, jobOrders, usersById, jobsByNo]);

  // ---- grid edits (draft rows: kept in state, saved by the footer button) ----
  const onCellEdit = ({ rowId, columnKey, value }: CellEdit<BulkRow>) => {
    const text = value === null ? '' : String(value);
    setRows((prev) => prev.map((r) => (r._key === rowId ? { ...r, [columnKey]: text } : r)));
  };

  const duplicateRow = (row: BulkRow) => {
    if (rows.length >= MAX_BULK_ROWS) {
      show('warning', 'Maksimum 300 satır limitine ulaşıldı');
      return;
    }
    setRows((prev) => {
      const at = prev.findIndex((r) => r._key === row._key);
      const next = [...prev];
      next.splice(at + 1, 0, { ...row, _key: newRowKey() });
      return next;
    });
  };

  const removeRow = (row: BulkRow) => {
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r._key !== row._key) : prev));
  };

  const addRow = () => {
    if (rows.length >= MAX_BULK_ROWS) {
      show('warning', 'Maksimum 300 satır eklenebilir');
      return;
    }
    setRows((prev) => [...prev, blankRow()]);
  };

  const clearAll = async () => {
    const ok = await confirm({
      title: 'Onay',
      icon: 'fas fa-exclamation-triangle',
      message: 'Tüm satırları temizlemek istediğinize emin misiniz?',
      confirmLabel: 'Evet',
      cancelLabel: 'İptal',
      danger: true,
    });
    if (!ok) return;
    setRows([blankRow()]);
    show('info', 'Tüm satırlar temizlendi');
  };

  const rowActions = (): RowAction<BulkRow>[] => [
    {
      key: 'duplicate',
      label: 'Kopyala',
      icon: 'fas fa-copy',
      color: 'secondary',
      onClick: duplicateRow,
    },
    {
      key: 'remove',
      label: 'Sil',
      icon: 'fas fa-trash',
      color: 'danger',
      disabled: rows.length === 1,
      onClick: removeRow,
    },
  ];

  // ---- Excel paste ----
  const hidePaste = () => {
    setPreview(null);
    setFailed([]);
  };

  const togglePaste = () => {
    setPasteOpen((open) => !open);
    if (!pasteOpen) setTimeout(() => pasteInput.current?.focus(), 0);
  };

  const parsePaste = () => {
    const raw = pasteText.trim();
    if (!raw) {
      show('warning', 'Lütfen Excel verilerini yapıştırın');
      hidePaste();
      return;
    }
    let result: ReturnType<typeof parseExcelPaste>;
    try {
      result = parseExcelPaste(raw, users, allUsers, jobOrders);
    } catch (error) {
      console.error('Error parsing Excel data:', error);
      show('error', `Veri ayrıştırılırken hata oluştu: ${(error as Error).message}`);
      hidePaste();
      return;
    }
    setFailed(result.failed);
    if (result.rows.length === 0) {
      setPreview(null);
      show('warning', 'Yapıştırılan veriler ayrıştırılamadı. Lütfen formatı kontrol edin.');
      return;
    }
    setPreview(result.rows);
    if (result.failed.length > 0) {
      show(
        'warning',
        `${result.rows.length} satır eklenecek, ${result.failed.length} satır başarısız`,
      );
    } else {
      show('success', `${result.rows.length} satır başarıyla ayrıştırıldı`);
    }
  };

  const addParsedRows = () => {
    if (!preview || preview.length === 0) {
      show('warning', 'Eklenecek veri bulunamadı');
      return;
    }
    // Untouched blank rows (the one the editor opens with) make way for the
    // pasted ones; legacy kept them and the save then failed on them.
    const kept = rows.filter((r) => !isBlankRow(r));
    const available = MAX_BULK_ROWS - kept.length;
    if (available <= 0) {
      show('warning', 'Maksimum 300 satır limitine ulaşıldı. Lütfen mevcut satırları temizleyin.');
      return;
    }
    const toAdd = preview.length > available ? preview.slice(0, available) : preview;
    setRows([...kept, ...toAdd]);
    setPasteText('');
    hidePaste();
    setPasteOpen(false);
    if (preview.length > available) {
      show(
        'warning',
        `Sadece ${available} satır eklenebilir (Maksimum 300 satır limiti). İlk ${available} satır eklenecek.`,
      );
    } else {
      show('success', `${toAdd.length} satır tabloya eklendi`);
    }
  };

  // ---- save ----
  const save = async () => {
    if (rows.length > MAX_BULK_ROWS) {
      show('error', 'Maksimum 300 satır oluşturulabilir. Lütfen satır sayısını azaltın.');
      return;
    }
    const problems = validateBulkRows(rows);
    if (problems) {
      show('error', ...problems);
      return;
    }
    const entries = rows.map((row) => ({
      employee: Number.parseInt(row.employee, 10),
      job_no: row.job_no,
      date: row.date,
      hours: Number.parseFloat(row.hours),
      overtime_type: row.overtime_type || 'regular',
      description: row.description || '',
    }));
    try {
      const data = await bulkCreate.mutateAsync({ entries });
      notify.success(`${data?.created_count || entries.length} zaman kaydı başarıyla oluşturuldu`);
      onClose();
    } catch (error) {
      console.error('Error creating bulk time entries:', error);
      show(
        'error',
        `Hata: ${weldingTimeEntryErrorMessage(error, 'Toplu zaman kaydı oluşturulurken hata oluştu')}`,
      );
    }
  };

  const previewUserLabel = (row: BulkRow) => {
    const user = users.find((u) => String(u.id) === row.employee);
    return user ? getUserDisplayName(user) : row.employee_label || 'Bulunamadı';
  };

  const atLimit = rows.length >= MAX_BULK_ROWS;

  return (
    <FormModal
      opened
      onClose={onClose}
      title="Toplu Zaman Kaydı Oluştur"
      icon="fas fa-layer-group"
      size="90rem"
      submitLabel="Kayıtları Oluştur"
      submitting={bulkCreate.isPending}
      onSubmit={() => void save()}
    >
      <ModalSection title="Toplu Zaman Kaydı Oluşturma" icon="fas fa-layer-group">
        <Stack gap="sm">
          <div>
            <Text size="sm" c="dimmed">
              Birden fazla zaman kaydı oluşturmak için aşağıdaki tabloyu kullanın.
            </Text>
            <Text size="xs" c="blue" data-testid="bulk-row-count">
              Toplam satır sayısı: {rows.length} / {MAX_BULK_ROWS}{' '}
              {atLimit ? (
                <Text span size="xs" c="red">
                  (Maksimum limit)
                </Text>
              ) : null}
            </Text>
          </div>

          <DataTable
            data={rows}
            columns={columns}
            getRowId={(row) => row._key}
            onCellEdit={onCellEdit}
            isCellDirty={(row, key) => Boolean(row[key as BulkField])}
            rowActions={rowActions}
            actionsHeader="İşlem"
            extraData={rows.length}
            withColumnBorders
            verticalSpacing="xs"
            virtualize={rows.length > VIRTUALIZE_FROM ? { height: '55vh' } : undefined}
          />

          <Group gap="xs">
            <Button
              size="xs"
              variant="default"
              leftSection={<FaIcon icon="fas fa-plus" />}
              disabled={atLimit}
              onClick={addRow}
            >
              Satır Ekle
            </Button>
            <Button
              size="xs"
              variant="default"
              color="green"
              leftSection={<FaIcon icon="fas fa-paste" />}
              onClick={togglePaste}
              aria-expanded={pasteOpen}
            >
              Excel&apos;den Yapıştır
            </Button>
            <Button
              size="xs"
              variant="default"
              color="red"
              leftSection={<FaIcon icon="fas fa-trash-alt" />}
              onClick={() => void clearAll()}
            >
              Tümünü Temizle
            </Button>
          </Group>

          {pasteOpen ? (
            <Panel title="Excel Verisi Yapıştır" icon="fas fa-file-excel">
              <Stack gap="sm">
                <Text size="sm" c="dimmed">
                  Excel&apos;den kopyaladığınız verileri aşağıdaki alana yapıştırın. Sütunlar:
                  Çalışan, İş No, Tarih, Saat, Mesai Tipi, Açıklama
                </Text>
                <Textarea
                  ref={pasteInput}
                  aria-label="Excel verisi"
                  rows={5}
                  placeholder="Excel'den kopyaladığınız verileri buraya yapıştırın..."
                  value={pasteText}
                  onChange={(event) => setPasteText(event.currentTarget.value)}
                />
                <Group gap="xs">
                  <Button
                    size="xs"
                    leftSection={<FaIcon icon="fas fa-search" />}
                    onClick={parsePaste}
                  >
                    Önizle
                  </Button>
                  <Button
                    size="xs"
                    variant="default"
                    leftSection={<FaIcon icon="fas fa-times" />}
                    onClick={() => {
                      setPasteText('');
                      hidePaste();
                    }}
                  >
                    Temizle
                  </Button>
                </Group>

                {preview && preview.length > 0 ? (
                  <section aria-label="Önizleme">
                    <Group gap="xs" mb={6}>
                      <FaIcon icon="fas fa-eye" />
                      <Text fw={600} size="sm">
                        Önizleme
                      </Text>
                      <Badge color="blue" variant="light">
                        {preview.length} satır
                      </Badge>
                    </Group>
                    <ScrollArea.Autosize mah={300}>
                      <Table withTableBorder withColumnBorders striped fz="sm" stickyHeader>
                        <Table.Thead>
                          <Table.Tr>
                            <Table.Th>Çalışan</Table.Th>
                            <Table.Th>İş No</Table.Th>
                            <Table.Th>Tarih</Table.Th>
                            <Table.Th>Saat</Table.Th>
                            <Table.Th>Mesai Tipi</Table.Th>
                            <Table.Th>Açıklama</Table.Th>
                          </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                          {preview.map((row) => (
                            <Table.Tr key={row._key}>
                              <Table.Td>{previewUserLabel(row)}</Table.Td>
                              <Table.Td>{row.job_no || '-'}</Table.Td>
                              <Table.Td>{row.date || '-'}</Table.Td>
                              <Table.Td>{row.hours || '-'}</Table.Td>
                              <Table.Td>
                                {OVERTIME_LABELS[row.overtime_type] ?? row.overtime_type}
                              </Table.Td>
                              <Table.Td>{row.description || '-'}</Table.Td>
                            </Table.Tr>
                          ))}
                        </Table.Tbody>
                      </Table>
                    </ScrollArea.Autosize>
                    <Group gap="xs" mt="xs">
                      <Button
                        size="xs"
                        color="green"
                        leftSection={<FaIcon icon="fas fa-check" />}
                        onClick={addParsedRows}
                      >
                        Ekle
                      </Button>
                      <Button
                        size="xs"
                        variant="default"
                        leftSection={<FaIcon icon="fas fa-times" />}
                        onClick={hidePaste}
                      >
                        İptal
                      </Button>
                    </Group>
                  </section>
                ) : null}

                {failed.length > 0 ? (
                  <section aria-label="Başarısız Satırlar">
                    <Group gap="xs" mb={6}>
                      <Text c="red" size="sm">
                        <FaIcon icon="fas fa-triangle-exclamation" />
                      </Text>
                      <Text fw={600} size="sm" c="red">
                        Başarısız Satırlar
                      </Text>
                      <Badge color="red" variant="light">
                        {failed.length} satır
                      </Badge>
                    </Group>
                    <ScrollArea.Autosize mah={300}>
                      <Table withTableBorder withColumnBorders fz="sm" stickyHeader>
                        <Table.Thead>
                          <Table.Tr>
                            <Table.Th>Satır</Table.Th>
                            <Table.Th>Çalışan</Table.Th>
                            <Table.Th>İş No</Table.Th>
                            <Table.Th>Tarih</Table.Th>
                            <Table.Th>Saat</Table.Th>
                            <Table.Th>Sebep</Table.Th>
                          </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                          {failed.map((row) => (
                            <Table.Tr key={row.rowNumber}>
                              <Table.Td>{row.rowNumber}</Table.Td>
                              <Table.Td>{row.employee || '-'}</Table.Td>
                              <Table.Td>{row.job_no || '-'}</Table.Td>
                              <Table.Td>{row.date || '-'}</Table.Td>
                              <Table.Td>{row.hours || '-'}</Table.Td>
                              <Table.Td c="red">{row.reason || '-'}</Table.Td>
                            </Table.Tr>
                          ))}
                        </Table.Tbody>
                      </Table>
                    </ScrollArea.Autosize>
                  </section>
                ) : null}
              </Stack>
            </Panel>
          ) : null}

          {notice ? (
            <Alert
              role="alert"
              color={NOTICE_COLOR[notice.type]}
              variant="light"
              withCloseButton
              closeButtonLabel="Kapat"
              onClose={() => setNotice(null)}
              data-notice={notice.type}
            >
              {notice.lines.map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </Alert>
          ) : null}
        </Stack>
      </ModalSection>
    </FormModal>
  );
}
