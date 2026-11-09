import { Button, Checkbox, Modal, NumberInput, Stack, Table, Text, TextInput } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  attachPlanningItemsToPurchaseRequest,
  findPurchaseRequestByNumber,
  getPlanningItemsFiles,
  getPlanningRequest,
  getProcurementPlanningItem,
  procurementPlanningItemsQueryOptions,
  type AttachPlanningError,
  type ProcurementPlanningItem,
} from '@/api/procurement/purchaseRequests';
import { departmentLabel } from '@/api/human_resources/organization';
import { formatDate, formatDateTime } from '@/lib/format';
import {
  DataTable,
  DetailModal,
  downloadFilesAsZip,
  FaIcon,
  FileAttachments,
  FilterBar,
  ModalBody,
  ModalFooter,
  ModalHeader,
  modalClassNames,
  notify,
  sanitizeZipSegment,
  StatusBadge,
  type DataTableColumn,
  type DateRange,
  type FilterConfig,
  type SortDir,
  type StatusFamily,
} from '@/ui';
import { daysBetween, DueDate } from '../../../shared/dueDates';
import { toAttachment } from '../../shared/badges';
import { truncate } from '../../shared/columns';
import { isPlanningItemOnPage, itemFromPlanning, type PrItem } from '../model';

// create.js "Planlama Talebi Malzemeleri": pick planning items (with a
// quantity each) and add them as rows, or attach them to an existing PR.

const num = (v: unknown) => Number(v) || 0;
const maxQty = (item: ProcurementPlanningItem) =>
  num(item.quantity_remaining_for_purchase) || num(item.quantity_to_purchase) || 0;

type Filters = {
  planning_request_number: string;
  item_code: string;
  item_name: string;
  job_no: string;
  needed: DateRange;
  request_priority: string;
};
const NO_FILTERS: Filters = {
  planning_request_number: '',
  item_code: '',
  item_name: '',
  job_no: '',
  needed: { start: '', end: '' },
  request_priority: '',
};

// PlanningRequest.PRIORITY_CHOICES.
const PRIORITY_LABELS: Record<string, string> = {
  normal: 'Normal',
  urgent: 'Acil',
  critical: 'Kritik',
};
const PRIORITY_COLORS: Record<string, StatusFamily> = {
  normal: 'grey',
  urgent: 'orange',
  critical: 'red',
};

/** The request params of the filters: the needed-by range becomes after / before. */
export function filterParams(filters: Filters): Record<string, string> {
  const { needed, ...text } = filters;
  const params: Record<string, string> = Object.fromEntries(
    Object.entries(text).filter(([, v]) => v),
  );
  const start = needed.start || needed.end;
  const end = needed.end || needed.start;
  if (start) params.needed_date_after = start;
  if (end) params.needed_date_before = end;
  return params;
}

/** Days the line has waited for procurement: since release, else since the request. */
export function daysWaiting(row: ProcurementPlanningItem, now: Date = new Date()): number | null {
  const since = row.ready_at || row.request_created_at;
  return since ? Math.max(daysBetween(since, now), 0) : null;
}

const FILTERS: FilterConfig<keyof Filters>[] = [
  {
    key: 'planning_request_number',
    type: 'text',
    label: 'Planlama Talebi No',
    placeholder: 'Planlama talebi no ara... (örn: PLR-2025-0001, PLR-2025, 0001)',
  },
  { key: 'item_code', type: 'text', label: 'Malzeme Kodu', placeholder: 'Malzeme kodu ara...' },
  { key: 'item_name', type: 'text', label: 'Malzeme Adı', placeholder: 'Malzeme adı ara...' },
  { key: 'job_no', type: 'text', label: 'İş No', placeholder: 'İş numarası ara...' },
  { key: 'needed', type: 'dateRange', label: 'İhtiyaç Tarihi' },
  {
    key: 'request_priority',
    type: 'select',
    label: 'Öncelik',
    placeholder: 'Tümü',
    options: Object.entries(PRIORITY_LABELS).map(([value, label]) => ({ value, label })),
  },
];

function zipStamp(now = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}_${p(now.getHours())}-${p(now.getMinutes())}`;
}

export function PlanningItemsModal({
  pageItems,
  onClose,
  onAdd,
  onAttached,
}: {
  pageItems: readonly PrItem[];
  onClose: () => void;
  onAdd: (items: PrItem[]) => void;
  onAttached: () => void;
}) {
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sort, setSort] = useState<{ sortBy: string | null; sortDir: SortDir }>({
    sortBy: null,
    sortDir: 'asc',
  });
  const [selected, setSelected] = useState<ReadonlyMap<number, ProcurementPlanningItem>>(new Map());
  const [quantities, setQuantities] = useState<ReadonlyMap<number, number>>(new Map());
  const [busy, setBusy] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [filesOf, setFilesOf] = useState<{ id: number; name: string } | null>(null);
  const [requestOf, setRequestOf] = useState<number | null>(null);

  const params = {
    page,
    page_size: pageSize,
    ...filterParams(filters),
    ...(sort.sortBy ? { ordering: `${sort.sortDir === 'desc' ? '-' : ''}${sort.sortBy}` } : {}),
  };
  const list = useQuery(procurementPlanningItemsQueryOptions(params));
  useEffect(() => {
    if (list.isError) {
      notify.error(
        `Planlama talebi malzemeleri yüklenirken hata oluştu: ${(list.error as Error).message}`,
      );
    }
  }, [list.isError, list.error]);

  // Selected rows stay pinned on top across pages (legacy selectedPlanningItemsData).
  const pageRows = useMemo(
    () =>
      (list.data?.results ?? []).filter(
        (i) => num(i.quantity_remaining_for_purchase) > 0 || i.is_available_for_purchase !== false,
      ),
    [list.data],
  );
  // A row moves up when it is ticked and keeps its place there: unticking it
  // leaves it where it is until the list reloads, so re-ticking a pinned row
  // doesn't reshuffle the rows above and below it.
  const [pinned, setPinned] = useState<readonly ProcurementPlanningItem[]>([]);
  const [pinnedFor, setPinnedFor] = useState(pageRows);
  if (pinnedFor !== pageRows) {
    setPinnedFor(pageRows);
    setPinned((prev) => prev.filter((i) => selected.has(i.id)));
  }
  const rows = useMemo(() => {
    const ids = new Set(pinned.map((i) => i.id));
    return [...pinned, ...pageRows.filter((i) => !ids.has(i.id))];
  }, [pinned, pageRows]);

  const select = (item: ProcurementPlanningItem, on: boolean, qty?: number) => {
    if (on) setPinned((prev) => (prev.some((i) => i.id === item.id) ? prev : [...prev, item]));
    setSelected((prev) => {
      const next = new Map(prev);
      if (on) next.set(item.id, item);
      else next.delete(item.id);
      return next;
    });
    setQuantities((prev) => {
      const next = new Map(prev);
      if (!on) next.delete(item.id);
      else if (qty !== undefined) next.set(item.id, qty);
      else if (!next.has(item.id) && maxQty(item) > 0) next.set(item.id, maxQty(item));
      return next;
    });
  };

  const setQuantity = (item: ProcurementPlanningItem, raw: number) => {
    const max = maxQty(item);
    const qty = Math.min(Math.max(Number.isFinite(raw) ? raw : 0, 0), max);
    if (qty > 0) select(item, true, qty);
    else select(item, false);
  };

  const columns: DataTableColumn<ProcurementPlanningItem>[] = [
    {
      key: 'selected',
      header: '',
      render: (row) => (
        <Checkbox
          aria-label={`${row.item_code ?? row.id} seç`}
          checked={selected.has(row.id)}
          onChange={(e) => select(row, e.currentTarget.checked)}
          onClick={(e) => e.stopPropagation()}
        />
      ),
    },
    {
      key: 'planning_request_number',
      header: 'Planlama Talebi No',
      sortable: true,
      render: (row) =>
        row.planning_request_number && row.planning_request ? (
          <Button
            size="compact-xs"
            variant="subtle"
            onClick={() => setRequestOf(row.planning_request!)}
          >
            {row.planning_request_number}
          </Button>
        ) : (
          '-'
        ),
    },
    { key: 'item_code', header: 'Malzeme Kodu', sortable: true },
    {
      key: 'item_name',
      header: 'Malzeme Adı',
      sortable: true,
      render: (row) => (
        <>
          {row.is_critical ? (
            <span
              title="Kritik: imalat bu kalem teslim edilmeden devam edemez"
              style={{ marginRight: 4 }}
            >
              <StatusBadge color="red">Kritik</StatusBadge>
            </span>
          ) : null}
          {row.item_name}
        </>
      ),
    },
    { key: 'item_description', header: 'Malzeme Açıklaması', hideBelow: 1500 },
    { key: 'job_no', header: 'İş No', sortable: true },
    {
      key: 'needed_date',
      header: 'İhtiyaç Tarihi',
      sortable: true,
      render: (row) => <DueDate value={row.needed_date} lateTitle="İhtiyaç tarihi geçti" />,
    },
    {
      key: 'request_priority',
      header: 'Öncelik',
      render: (row) =>
        row.request_priority ? (
          <StatusBadge color={PRIORITY_COLORS[row.request_priority] ?? 'grey'}>
            {row.request_priority_label ||
              PRIORITY_LABELS[row.request_priority] ||
              row.request_priority}
          </StatusBadge>
        ) : (
          '-'
        ),
    },
    {
      key: 'department',
      header: 'Talep Eden Birim',
      render: (row) =>
        row.department ? (
          <span
            title={
              row.department_source === 'creator'
                ? 'Departman talebi yok: talebi oluşturanın birimi'
                : row.department_request_number || undefined
            }
          >
            {departmentLabel(row.department)}
          </span>
        ) : (
          '-'
        ),
    },
    {
      key: 'request_created_at',
      header: 'Talep Tarihi',
      sortable: true,
      hideBelow: 1500,
      render: (row) => (row.request_created_at ? formatDate(row.request_created_at) : '-'),
    },
    {
      key: 'ready_at',
      header: 'Satın Almaya Hazır',
      sortable: true,
      hideBelow: 1500,
      render: (row) => (row.ready_at ? formatDate(row.ready_at) : '-'),
    },
    {
      key: 'days_waiting',
      header: 'Bekleme',
      align: 'right',
      render: (row) => {
        const days = daysWaiting(row);
        return days === null ? '-' : `${days} gün`;
      },
    },
    {
      key: 'quantity_to_purchase',
      header: 'Toplam İhtiyaç',
      sortable: true,
      render: (row) => `${row.quantity_to_purchase || 0} ${row.item_unit || 'adet'}`,
    },
    {
      key: 'quantity_remaining_for_purchase',
      header: 'Kalan Miktar',
      sortable: true,
      render: (row) => (
        <strong>{`${row.quantity_remaining_for_purchase} ${row.item_unit || 'adet'}`}</strong>
      ),
    },
    {
      key: 'status',
      header: 'Durum',
      render: (row) =>
        row.is_converted ? (
          <StatusBadge color="green">Tamamen Dönüştürüldü</StatusBadge>
        ) : row.is_partially_converted ? (
          <StatusBadge color="yellow">Kısmen Dönüştürüldü</StatusBadge>
        ) : (
          <StatusBadge color="grey">Başlanmadı</StatusBadge>
        ),
    },
    {
      key: 'selected_quantity',
      header: 'Seçilecek Miktar',
      // Room for the number, the unit and the "Max" line below it.
      minWidth: 170,
      render: (row) => {
        const remaining = num(row.quantity_remaining_for_purchase);
        if (remaining <= 0)
          return (
            <Text c="dimmed" size="sm">
              Mevcut değil
            </Text>
          );
        return (
          <div onClick={(e) => e.stopPropagation()}>
            <NumberInput
              size="xs"
              w={150}
              min={0}
              max={remaining}
              step={0.01}
              placeholder="0"
              decimalSeparator=","
              aria-label={`${row.item_code ?? row.id} miktar`}
              rightSection={
                <Text size="xs" c="dimmed" truncate>
                  {row.item_unit || 'adet'}
                </Text>
              }
              rightSectionWidth={56}
              value={quantities.get(row.id) ?? ''}
              onBlur={(e) => setQuantity(row, parseFloat(e.currentTarget.value.replace(',', '.')))}
              onKeyDown={(e) => {
                if (e.key === 'Enter')
                  setQuantity(row, parseFloat(e.currentTarget.value.replace(',', '.')));
              }}
            />
            <Text size="xs" c="dimmed">{`Max: ${row.quantity_remaining_for_purchase}`}</Text>
          </div>
        );
      },
    },
    { key: 'item_unit', header: 'Birim', sortable: true },
    {
      key: 'specifications',
      header: 'Teknik Özellikler',
      render: (row) => (row.specifications ? truncate(row.specifications, 50) : ''),
    },
    {
      key: 'files_count',
      header: 'Dosyalar',
      render: (row) =>
        row.files_count ? (
          <Button
            size="compact-xs"
            variant="outline"
            leftSection={<i className="fas fa-paperclip" />}
            onClick={() => setFilesOf({ id: row.id, name: row.item_name || '' })}
          >
            {`${row.files_count} dosya`}
          </Button>
        ) : (
          '-'
        ),
    },
  ];

  const count = selected.size;

  const addSelected = async () => {
    if (!count) {
      notify.warning('Lütfen en az bir malzeme seçin');
      return;
    }
    const missing = [...selected.values()].filter((i) => !((quantities.get(i.id) ?? 0) > 0));
    if (missing.length) {
      notify.warning(
        `Lütfen şu malzemeler için geçerli bir miktar girin: ${missing.map((i) => i.item_code || i.item_name || `ID: ${i.id}`).join(', ')}`,
      );
      return;
    }
    setBusy(true);
    try {
      const added: PrItem[] = [];
      for (const planning of selected.values()) {
        const qty = quantities.get(planning.id) ?? 0;
        if (qty <= 0) continue;
        const max = maxQty(planning);
        if (qty > max) {
          notify.warning(
            `${planning.item_code || planning.item_name} için seçilen miktar (${qty}) kalan miktarı (${max}) aşıyor`,
          );
          continue;
        }
        if (isPlanningItemOnPage([...pageItems, ...added], planning.id)) continue;
        // Files come with the detail when the list row has none (legacy fetched unseen items).
        const full = planning.files
          ? planning
          : await getProcurementPlanningItem(planning.id).catch(() => planning);
        added.push(itemFromPlanning(full, qty));
      }
      if (added.length) {
        onAdd(added);
        notify.success(`${added.length} malzeme eklendi`);
        onClose();
      } else {
        notify.info('Seçilen malzemeler zaten eklenmiş');
      }
    } catch (error) {
      notify.error(`Malzemeler eklenirken hata oluştu: ${(error as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const downloadFiles = async () => {
    if (!count) {
      notify.warning('Lütfen en az bir malzeme seçin');
      return;
    }
    try {
      const items = await getPlanningItemsFiles([...selected.keys()]);
      const seen = new Set<string>();
      const files: { url: string; name: string }[] = [];
      for (const item of items) {
        for (const f of item.files ?? []) {
          const key = String(f.file_url || f.id);
          if (seen.has(key)) continue;
          seen.add(key);
          const name = toAttachment(f).name;
          files.push({
            url: f.file_url,
            name: `${sanitizeZipSegment(item.planning_request_number || 'Unknown')}_${sanitizeZipSegment(item.item_name || 'Bilinmeyen Malzeme')}_${name}`,
          });
        }
      }
      if (!files.length) {
        notify.info('Seçilen malzemelerde dosya bulunmuyor');
        return;
      }
      notify.info(`${files.length} dosya zip dosyasına ekleniyor...`);
      const result = await downloadFilesAsZip(files, `planlama_talebi_dosyalari_${zipStamp()}`);
      if (result.status === 'done')
        notify.success(`${result.count} dosya zip dosyası olarak indirildi`);
      else notify.info('Seçilen malzemelerde dosya bulunmuyor');
    } catch (error) {
      notify.error(`Dosyalar indirilirken hata oluştu: ${(error as Error).message}`);
    }
  };

  const rowStyle = (row: ProcurementPlanningItem): CSSProperties | undefined =>
    selected.has(row.id)
      ? { backgroundColor: 'var(--mantine-color-green-0)' }
      : row.is_critical
        ? { backgroundColor: '#fdeaea' }
        : undefined;

  return (
    <>
      <Modal
        opened
        onClose={onClose}
        fullScreen
        withCloseButton={false}
        closeOnEscape={false}
        classNames={modalClassNames}
        padding={0}
      >
        <ModalHeader title="Planlama Talebi Malzemeleri" icon="fas fa-clipboard-list" />
        <ModalBody>
          <DataTable
            title="Planlama Talebi Malzemeleri"
            filters={
              <FilterBar
                inline
                filters={FILTERS}
                values={filters}
                onApply={(next) => {
                  setFilters((f) => ({ ...f, ...next }));
                  setPage(1);
                }}
                onClear={() => {
                  setFilters(NO_FILTERS);
                  setPage(1);
                }}
              />
            }
            data={rows}
            columns={columns}
            extraData={[selected, quantities]}
            getRowId={(row) => String(row.id)}
            loading={list.isFetching}
            striped
            sortable
            sort={{
              sortBy: sort.sortBy,
              sortDir: sort.sortDir,
              onSortChange: (sortBy, sortDir) => {
                setSort({ sortBy, sortDir });
                setPage(1);
              },
            }}
            pagination={{
              page,
              pageSize,
              total: list.data?.count ?? 0,
              onPageChange: setPage,
              onPageSizeChange: (size) => {
                setPageSize(size);
                setPage(1);
              },
            }}
            rowStyle={rowStyle}
          />
        </ModalBody>
        <ModalFooter>
          <Text
            size="sm"
            mr="auto"
            data-testid="planning-selected-count"
          >{`${count} malzeme seçildi`}</Text>
          <Button
            variant="default"
            leftSection={<FaIcon icon="fas fa-download" />}
            disabled={!count}
            onClick={() => void downloadFiles()}
          >
            Seçilenlerin Dosyalarını İndir
          </Button>
          <Button variant="default" onClick={onClose}>
            İptal
          </Button>
          <Button
            variant="outline"
            color="green"
            leftSection={<FaIcon icon="fas fa-link" />}
            disabled={!count}
            onClick={() => setAttaching(true)}
          >
            Mevcut PR'ye Ekle
          </Button>
          <Button
            leftSection={<FaIcon icon="fas fa-plus" />}
            disabled={!count}
            loading={busy}
            onClick={() => void addSelected()}
          >
            Seçilenleri Ekle
          </Button>
        </ModalFooter>
      </Modal>
      {attaching ? (
        <AttachToPrModal
          itemIds={[...selected.keys()]}
          onClose={() => setAttaching(false)}
          onDone={() => {
            setAttaching(false);
            onAttached();
            onClose();
          }}
        />
      ) : null}
      {filesOf ? <PlanningItemFilesModal {...filesOf} onClose={() => setFilesOf(null)} /> : null}
      {requestOf !== null ? (
        <PlanningRequestModal id={requestOf} onClose={() => setRequestOf(null)} />
      ) : null}
    </>
  );
}

const PR_NUMBER = /^PR-\d{4}-\d+$/i;

function AttachToPrModal({
  itemIds,
  onClose,
  onDone,
}: {
  itemIds: number[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [number, setNumber] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const value = number.trim();
    if (!value) {
      notify.error('Satın alma talebi numarası gereklidir');
      return;
    }
    if (!PR_NUMBER.test(value)) {
      notify.error(
        'Geçersiz satın alma talebi numarası formatı. Format: PR-YYYY-#### (örn: PR-2025-0347)',
      );
      return;
    }
    setBusy(true);
    try {
      // Exact match: legacy took the first filter result and could attach to another PR.
      const { match } = await findPurchaseRequestByNumber(value, { page_size: 1 });
      if (!match) {
        notify.error(`Satın alma talebi bulunamadı: ${value}`);
        return;
      }
      const response = await attachPlanningItemsToPurchaseRequest(match.id, itemIds);
      notify.success(response?.detail || 'Malzemeler başarıyla eklendi');
      onDone();
    } catch (error) {
      const data = (error as AttachPlanningError).data;
      let message = data?.detail || (error as Error).message || 'Malzemeler eklenirken hata oluştu';
      if (data?.errors?.length) message += `\n\n${data.errors.join('\n')}`;
      if (data?.note) message += `\n\n${data.note}`;
      notify.error(message, { autoClose: message.includes('\n') ? 10000 : 5000 });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      opened
      onClose={onClose}
      withCloseButton={false}
      classNames={modalClassNames}
      padding={0}
    >
      <ModalHeader title="Mevcut Satın Alma Talebine Ekle" icon="fas fa-link" />
      <ModalBody>
        <Stack gap="sm">
          <Text fw={600} size="sm">
            <i className="fas fa-info-circle" style={{ marginRight: 4 }} />
            Satın Alma Talebi Bilgileri
          </Text>
          <TextInput
            label="Satın Alma Talebi No"
            required
            placeholder="PR-2025-0347"
            description="Satın alma talebi numarasını girin (örn: PR-2025-0347)"
            leftSection={<i className="fas fa-hashtag" />}
            value={number}
            onChange={(e) => setNumber(e.currentTarget.value)}
          />
          <TextInput
            label="Seçilen Malzemeler"
            readOnly
            value={`${itemIds.length} malzeme seçildi`}
            leftSection={<i className="fas fa-list" />}
          />
        </Stack>
      </ModalBody>
      <ModalFooter>
        <Button variant="default" onClick={onClose}>
          İptal
        </Button>
        <Button loading={busy} onClick={() => void save()}>
          Ekle
        </Button>
      </ModalFooter>
    </Modal>
  );
}

function PlanningItemFilesModal({
  id,
  name,
  onClose,
}: {
  id: number;
  name: string;
  onClose: () => void;
}) {
  const files = useQuery({
    queryKey: ['planningItems', 'files', id] as const,
    queryFn: () => getPlanningItemsFiles([id]),
  });
  const entry = files.data?.find((i) => i.item_id === id);
  useEffect(() => {
    if (files.isError) {
      notify.error(`Malzeme dosyaları yüklenirken hata oluştu: ${(files.error as Error).message}`);
      onClose();
    } else if (files.isSuccess && !entry?.files?.length) {
      notify.info('Bu malzeme için dosya bulunmuyor');
      onClose();
    }
    // Once per result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files.isError, files.isSuccess]);
  if (!entry?.files?.length) return null;
  return (
    <DetailModal
      opened
      onClose={onClose}
      icon="fas fa-paperclip"
      size="lg"
      title={`${entry.item_name || name || 'Malzeme'} - Dosyalar`}
      sections={[
        {
          content: <FileAttachments readOnly layout="grid" files={entry.files.map(toAttachment)} />,
        },
      ]}
    />
  );
}

function PlanningRequestModal({ id, onClose }: { id: number; onClose: () => void }) {
  const request = useQuery({
    queryKey: ['planningRequests', 'detail', id] as const,
    queryFn: ({ signal }) => getPlanningRequest(id, signal),
  });
  useEffect(() => {
    notify.info('Planlama talebi detayları yükleniyor...', { autoClose: 2000 });
  }, []);
  useEffect(() => {
    if (request.isError) {
      notify.error(
        `Planlama talebi detayları yüklenirken hata oluştu: ${(request.error as Error).message}`,
      );
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request.isError]);
  const r = request.data;
  if (!r) return null;
  return (
    <DetailModal
      opened
      onClose={onClose}
      icon="fas fa-clipboard-list"
      size="xl"
      title={`Planlama Talebi - ${r.request_number || '-'}`}
      sections={[
        {
          title: 'Genel Bilgiler',
          fields: [
            { label: 'Talep No', value: r.request_number || '-' },
            { label: 'Durum', value: r.status_label || r.status || '-' },
            {
              label: 'Öncelik',
              value: (r.priority && PRIORITY_LABELS[r.priority]) || r.priority || 'Normal',
            },
            { label: 'Başlık', value: r.title, hidden: !r.title },
            { label: 'Açıklama', value: r.description, hidden: !r.description, span: 12 },
            { label: 'İhtiyaç Tarihi', value: r.needed_date ? formatDate(r.needed_date) : '-' },
            {
              label: 'Oluşturulma',
              value: r.created_at ? formatDateTime(r.created_at, { second: '2-digit' }) : '-',
            },
            {
              label: 'Oluşturan',
              value: r.created_by_full_name || r.created_by_username,
              hidden: !(r.created_by_full_name || r.created_by_username),
            },
          ],
        },
        {
          title: 'Talep Edilen Malzemeler',
          hidden: !r.items?.length,
          content: (
            <Table fz="sm">
              <Table.Thead>
                <Table.Tr>
                  {[
                    '#',
                    'Malzeme Kodu',
                    'Malzeme Adı',
                    'Malzeme Açıklaması',
                    'İş No',
                    'Miktar',
                    'Birim',
                    'Teknik Özellikler',
                  ].map((h) => (
                    <Table.Th key={h}>{h}</Table.Th>
                  ))}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {(r.items ?? []).map((item, i) => (
                  <Table.Tr key={item.id ?? i}>
                    <Table.Td>{i + 1}</Table.Td>
                    <Table.Td>
                      <strong>{item.item_code || '-'}</strong>
                    </Table.Td>
                    <Table.Td>{item.item_name || '-'}</Table.Td>
                    <Table.Td>{item.item_description || '-'}</Table.Td>
                    <Table.Td>{item.job_no || '-'}</Table.Td>
                    <Table.Td>{item.quantity_to_purchase || '-'}</Table.Td>
                    <Table.Td>{item.item_unit || '-'}</Table.Td>
                    <Table.Td>{item.specifications || '-'}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          ),
        },
        {
          title: 'Dosya Ekleri',
          hidden: !r.files?.length,
          content: (
            <FileAttachments readOnly layout="grid" files={(r.files ?? []).map(toAttachment)} />
          ),
        },
      ]}
    />
  );
}
