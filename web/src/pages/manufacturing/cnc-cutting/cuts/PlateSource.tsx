import {
  Badge,
  Button,
  Checkbox,
  CloseButton,
  Grid,
  Group,
  Modal,
  NumberInput,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { CncTask, CncTaskInput, RemnantChoice } from '@/api/manufacturing/cncTasks';
import {
  fetchRemnantPlate,
  remnantKeys,
  remnantPlatesQueryOptions,
  useCreateRemnantPlate,
} from '@/api/manufacturing/remnants';
import {
  markPlanningItemConsumed,
  planningItemKeys,
  planningItemsQueryOptions,
  type PlanningItem,
  type PlanningItemsParams,
} from '@/api/planning/planningItems';
import {
  confirm,
  DataTable,
  DetailModal,
  FaIcon,
  FilterBar,
  fromOrdering,
  ModalBody,
  ModalHeader,
  ModalSection,
  modalClassNames,
  notify,
  StatusBadge,
  toOrdering,
  type DataTableColumn,
  type FilterConfig,
  type RowAction,
} from '@/ui';
import { DIMENSIONS_ERROR, normalizeDimensions } from '../remnants/dimensions';

// The "Plaka Kaynağı" section of the create and edit modals. Every cut uses
// exactly one plate source: a remnant plate (fire plaka) or a planning request
// item (plaka kalemi); picking one clears the other.

export interface PlateSourceValue {
  remnant: RemnantChoice | null;
  quantityUsed: number;
  planningItem: PlanningItem | null;
  markConsumed: boolean;
}

export const EMPTY_PLATE_SOURCE: PlateSourceValue = {
  remnant: null,
  quantityUsed: 1,
  planningItem: null,
  markConsumed: false,
};

/** The saved source from the GET payload (plate_usage_records / plate_item). */
export function plateSourceFromTask(task: CncTask): PlateSourceValue {
  const usage = task.plate_usage_records?.[0] ?? null;
  const remnant: RemnantChoice | null = usage
    ? (usage.remnant_plate_details ?? { id: usage.remnant_plate, dimensions: '-', material: '-' })
    : null;
  const used = usage?.quantity_used;
  return {
    remnant,
    quantityUsed: used !== undefined && used !== null ? parseInt(String(used), 10) : 1,
    planningItem: task.plate_item ?? null,
    markConsumed: task.plate_item ? Boolean(task.plate_item.is_consumed) : false,
  };
}

export function plateSourceInput(
  value: PlateSourceValue,
): Pick<
  CncTaskInput,
  'selected_plate_id' | 'quantity_used' | 'planning_request_item_id' | 'mark_item_consumed'
> {
  return {
    selected_plate_id: value.remnant ? value.remnant.id : null,
    quantity_used: value.remnant ? value.quantityUsed : null,
    planning_request_item_id: value.planningItem ? value.planningItem.id : null,
    mark_item_consumed: value.planningItem ? value.markConsumed : undefined,
  };
}

function availableOf(remnant: RemnantChoice | null): number | null {
  const raw = remnant?.available_quantity;
  return raw !== undefined && raw !== null ? parseInt(String(raw), 10) : null;
}

/** Selecting a remnant: 1 to use, unless less than one is left. */
function pickRemnant(
  remnant: RemnantChoice,
  fallbackAvailable: number | null = null,
): PlateSourceValue {
  const available = availableOf(remnant) ?? fallbackAvailable;
  return {
    remnant,
    quantityUsed: available !== null && available < 1 ? available : 1,
    planningItem: null,
    markConsumed: false,
  };
}

function deliveryText(item: PlanningItem) {
  const delivered = item.is_delivered === true;
  const partial = !delivered && Number(item.delivered_quantity || 0) > 0;
  if (delivered) return { text: 'Malzeme teslim alındı.', color: 'green' };
  if (partial)
    return {
      text: `Malzeme kısmen teslim alındı (${item.delivered_quantity} / ${item.quantity} ${item.item_unit || ''}).`,
      color: 'blue',
    };
  return { text: 'Malzeme henüz teslim edilmedi — satın alma bekleniyor.', color: 'red' };
}

export interface PlateSourceSectionProps {
  value: PlateSourceValue;
  onChange: (value: PlateSourceValue) => void;
}

export function PlateSourceSection({ value, onChange }: PlateSourceSectionProps) {
  const [picking, setPicking] = useState<'remnant' | 'item' | null>(null);
  const [remnantDetails, setRemnantDetails] = useState<number | null>(null);
  const [quantityError, setQuantityError] = useState('');
  const { remnant, planningItem } = value;
  const available = availableOf(remnant);

  const setQuantity = (raw: string | number) => {
    const entered = parseInt(String(raw), 10) || 0;
    if (available !== null && entered > available) {
      const message = `Maksimum ${available} adet kullanılabilir`;
      setQuantityError(message);
      notify.warning(message);
      onChange({ ...value, quantityUsed: available });
      return;
    }
    setQuantityError('');
    onChange({ ...value, quantityUsed: entered >= 1 ? entered : 1 });
  };

  const itemLabel = planningItem
    ? (() => {
        const code = planningItem.item_code || `#${planningItem.id}`;
        return planningItem.item_name ? `${code} — ${planningItem.item_name}` : code;
      })()
    : '';
  const delivery = planningItem ? deliveryText(planningItem) : null;
  const usageCount = planningItem?.cnc_cuts_count ?? 0;

  return (
    <ModalSection title="Plaka Kaynağı" icon="fas fa-layer-group">
      <Group gap="xs" mb="xs">
        <Button
          variant="outline"
          color="cyan"
          leftSection={<FaIcon icon="fas fa-layer-group" />}
          onClick={() => setPicking('remnant')}
        >
          {remnant ? 'Fire Plaka Değiştir' : 'Fire Plaka Seç'}
        </Button>
        <Button
          variant="outline"
          leftSection={<FaIcon icon="fas fa-box-open" />}
          onClick={() => setPicking('item')}
        >
          {planningItem ? 'Plaka Kalemi Değiştir' : 'Plaka Kalemi Seç'}
        </Button>
        {remnant ? (
          <Group gap={4}>
            <Badge
              color="green"
              leftSection={<FaIcon icon="fas fa-check" />}
              style={{ cursor: 'pointer' }}
              title="Fire plaka detayları"
              onClick={() => setRemnantDetails(remnant.id)}
            >
              Seçili: ID: {remnant.id}
            </Badge>
            <CloseButton
              size="sm"
              aria-label="Fire plakayı kaldır"
              onClick={() => {
                setQuantityError('');
                onChange({ ...value, remnant: null, quantityUsed: 1 });
              }}
            />
          </Group>
        ) : null}
        {planningItem ? (
          <Group gap={4}>
            <Badge color="green" leftSection={<FaIcon icon="fas fa-check" />}>
              Seçili: {itemLabel}
            </Badge>
            <CloseButton
              size="sm"
              aria-label="Plaka kalemini kaldır"
              onClick={() => onChange({ ...value, planningItem: null, markConsumed: false })}
            />
          </Group>
        ) : null}
      </Group>
      <Text size="xs" c="dimmed" mb="xs">
        Her kesim için fire plaka veya plaka kalemi seçilmelidir; malzeme ve kalınlık seçilen
        kaynaktan otomatik alınır.
      </Text>

      {planningItem && delivery ? (
        <Stack gap={4} mb="xs">
          <Text size="xs">
            {usageCount > 0
              ? `Bu kalemden daha önce ${usageCount} kesim yapıldı (adetler dahil).`
              : 'Bu kalemden daha önce hiç kesim yapılmadı.'}
          </Text>
          <Text size="xs" c={delivery.color}>
            {delivery.text}
          </Text>
          <Checkbox
            label="Kullanıldı olarak işaretle (bu kalemin son plakası kesiliyor)"
            checked={value.markConsumed}
            onChange={(event) => onChange({ ...value, markConsumed: event.currentTarget.checked })}
          />
        </Stack>
      ) : null}

      {remnant ? (
        <NumberInput
          label="Kullanılacak Adet"
          min={1}
          max={available ?? undefined}
          step={1}
          allowDecimal={false}
          placeholder="1"
          value={value.quantityUsed}
          onChange={setQuantity}
          error={quantityError || undefined}
          description={
            available !== null
              ? `Bu plakadan kaç adet kullanılacak (Maksimum: ${available})`
              : 'Bu plakadan kaç adet kullanılacak (varsayılan: 1)'
          }
          maw={320}
        />
      ) : null}

      {picking === 'remnant' ? (
        <RemnantPickerModal
          onClose={() => setPicking(null)}
          onPick={(picked, fallback) => {
            setQuantityError('');
            onChange(pickRemnant(picked, fallback));
            setPicking(null);
          }}
        />
      ) : null}
      {picking === 'item' ? (
        <PlanningItemPickerModal
          onClose={() => setPicking(null)}
          onPick={(item) => {
            setQuantityError('');
            onChange({
              remnant: null,
              quantityUsed: 1,
              planningItem: item,
              markConsumed: item.is_consumed === true,
            });
            setPicking(null);
            notify.success('Plaka kalemi seçildi');
          }}
        />
      ) : null}
      {remnantDetails !== null ? (
        <RemnantDetailsModal id={remnantDetails} onClose={() => setRemnantDetails(null)} />
      ) : null}
    </ModalSection>
  );
}

// ---- remnant plate details (the selected badge) ----

function RemnantDetailsModal({ id, onClose }: { id: number; onClose: () => void }) {
  const remnant = useQuery({
    queryKey: remnantKeys.detail(id),
    queryFn: () => fetchRemnantPlate(id),
  });
  useEffect(() => {
    if (!remnant.isError) return;
    notify.error('Fire plaka detayları yüklenirken hata oluştu');
    onClose();
  }, [remnant.isError, onClose]);
  const data = remnant.data;
  return (
    <DetailModal
      opened
      onClose={onClose}
      title="Fire Plaka Detayları"
      icon="fas fa-layer-group"
      loading={remnant.isPending}
      sections={[
        {
          title: 'Temel Bilgiler',
          icon: 'fas fa-info-circle',
          fields: [
            { label: 'ID', value: data?.id ?? '-' },
            { label: 'Kalınlık', value: data?.thickness_mm ? `${data.thickness_mm} mm` : '-' },
            { label: 'Boyutlar', value: data?.dimensions || '-' },
            { label: 'Adet', value: data?.quantity ? String(data.quantity) : '-' },
            { label: 'Malzeme', value: data?.material || '-', span: 12 },
          ],
        },
      ]}
    />
  );
}

// ---- "Fire Plaka Seç" ----

type RemnantFilters = { thickness_mm: string; dimensions: string; material: string };
const EMPTY_REMNANT_FILTERS: RemnantFilters = { thickness_mm: '', dimensions: '', material: '' };

const REMNANT_FILTERS: FilterConfig<keyof RemnantFilters>[] = [
  { type: 'text', key: 'thickness_mm', label: 'Kalınlık (mm)', placeholder: 'örn. 10' },
  { type: 'text', key: 'dimensions', label: 'Boyutlar', placeholder: 'örn. 1200x800' },
  { type: 'text', key: 'material', label: 'Malzeme', placeholder: 'Malzeme türü' },
];

const REMNANT_COLUMNS: DataTableColumn<RemnantChoice>[] = [
  { key: 'id', header: 'ID', width: '8%' },
  {
    key: 'thickness_mm',
    header: 'Kalınlık (mm)',
    width: '12%',
    render: (r) => (r.thickness_mm ? `${r.thickness_mm} mm` : '-'),
  },
  { key: 'dimensions', header: 'Boyutlar', width: '15%' },
  {
    key: 'available_quantity',
    header: 'Adet',
    width: '10%',
    render: (r) =>
      r.available_quantity !== undefined && r.available_quantity !== null
        ? String(r.available_quantity)
        : '-',
  },
  { key: 'material', header: 'Malzeme', width: '15%' },
];

const EMPTY_REMNANTS: RemnantChoice[] = [];

interface RemnantPickerProps {
  onClose: () => void;
  /** `fallbackAvailable`: the created quantity when the backend sends no available_quantity. */
  onPick: (remnant: RemnantChoice, fallbackAvailable?: number | null) => void;
}

export function RemnantPickerModal({ onClose, onPick }: RemnantPickerProps) {
  // Legacy loads nothing until the filters are applied (or cleared).
  const [applied, setApplied] = useState<RemnantFilters | null>(null);
  const [page, setPage] = useState(1);
  const [ordering, setOrdering] = useState('id');
  const sort = fromOrdering(ordering);

  const params = {
    page,
    page_size: 20,
    ordering,
    thickness_mm: applied?.thickness_mm.trim() || undefined,
    dimensions: applied?.dimensions.trim() || undefined,
    material: applied?.material.trim() || undefined,
  };
  const list = useQuery({
    ...remnantPlatesQueryOptions(params),
    enabled: applied !== null,
    placeholderData: keepPreviousData,
  });
  useEffect(() => {
    if (list.isError) notify.error('Fire plakalar yüklenirken hata oluştu');
  }, [list.isError, list.errorUpdatedAt]);

  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({
    thickness: '',
    dimensions: '',
    quantity: '1',
    material: '',
  });
  const create = useCreateRemnantPlate();

  const toggleCreate = () => {
    if (!creating) {
      // Prefill empty fields from the search: likely the very plate to create.
      const filters = applied ?? EMPTY_REMNANT_FILTERS;
      setDraft((d) => ({
        thickness: d.thickness || filters.thickness_mm.trim(),
        dimensions: d.dimensions || filters.dimensions.trim(),
        quantity: d.quantity,
        material: d.material || filters.material.trim(),
      }));
    }
    setCreating(!creating);
  };

  const submitCreate = async () => {
    const thickness = draft.thickness.trim();
    const dimensions = draft.dimensions.trim();
    const material = draft.material.trim();
    const quantityRaw = draft.quantity.trim();
    if (!thickness || !dimensions || !quantityRaw || !material) {
      notify.warning('Kalınlık, boyutlar, adet ve malzeme alanları zorunludur');
      return;
    }
    const quantity = parseInt(quantityRaw, 10);
    if (!Number.isFinite(quantity) || quantity < 1) {
      notify.warning('Adet en az 1 olmalıdır');
      return;
    }
    const normalized = normalizeDimensions(dimensions);
    if (!normalized) {
      notify.warning(DIMENSIONS_ERROR);
      return;
    }
    try {
      const created = await create.mutateAsync({
        thickness_mm: thickness,
        dimensions: normalized,
        quantity,
        material,
      });
      onPick(created as RemnantChoice, quantity);
      notify.success('Fire plaka oluşturuldu ve seçildi');
    } catch {
      notify.error('Fire plaka oluşturulurken hata oluştu');
    }
  };

  const rowActions = (): RowAction<RemnantChoice>[] => [
    {
      key: 'select',
      label: 'Seç',
      icon: 'fas fa-check',
      color: 'success',
      onClick: (row) => {
        onPick(row);
        notify.success('Fire plaka seçildi');
      },
    },
  ];

  return (
    <Modal opened onClose={onClose} size="xl" withCloseButton={false} classNames={modalClassNames}>
      <ModalHeader title="Fire Plaka Seç" icon="fas fa-layer-group" />
      <ModalBody>
        <ModalSection title="Fire Plakalar" icon="fas fa-table">
          <DataTable
            title="Fire Plakalar Listesi"
            filters={
              <FilterBar
                inline
                filters={REMNANT_FILTERS}
                values={applied ?? EMPTY_REMNANT_FILTERS}
                onApply={(next) => {
                  setPage(1);
                  setApplied(next);
                }}
                onClear={() => {
                  setPage(1);
                  setApplied(EMPTY_REMNANT_FILTERS);
                }}
              />
            }
            data={list.data?.results ?? EMPTY_REMNANTS}
            columns={REMNANT_COLUMNS}
            getRowId={(row) => String(row.id)}
            loading={list.isFetching}
            sortable
            sort={{
              sortBy: sort.sortBy,
              sortDir: sort.sortDir,
              onSortChange: (by, dir) => {
                setOrdering(toOrdering(by, dir) ?? 'id');
                setPage(1);
              },
            }}
            pagination={{ page, pageSize: 20, total: list.data?.count ?? 0, onPageChange: setPage }}
            rowActions={rowActions}
            emptyMessage="Fire plaka bulunamadı"
          />
        </ModalSection>

        <ModalSection title="Yeni Fire Plaka Oluştur" icon="fas fa-plus-circle">
          <Button
            variant="outline"
            color="green"
            size="xs"
            mb="xs"
            leftSection={<FaIcon icon="fas fa-plus" />}
            onClick={toggleCreate}
          >
            Aradığınız fire plaka yok mu? Yeni oluşturun
          </Button>
          {creating ? (
            <>
              <Grid align="flex-end">
                <Grid.Col span={{ base: 12, md: 3 }}>
                  <TextInput
                    label="Kalınlık (mm)*"
                    type="number"
                    step="0.01"
                    min={0}
                    placeholder="örn. 10"
                    value={draft.thickness}
                    onChange={(e) => setDraft({ ...draft, thickness: e.currentTarget.value })}
                    data-autofocus
                  />
                </Grid.Col>
                <Grid.Col span={{ base: 12, md: 3 }}>
                  <TextInput
                    label="Boyutlar*"
                    placeholder="örn. 1200x800"
                    value={draft.dimensions}
                    onChange={(e) => setDraft({ ...draft, dimensions: e.currentTarget.value })}
                  />
                </Grid.Col>
                <Grid.Col span={{ base: 12, md: 2 }}>
                  <TextInput
                    label="Adet*"
                    type="number"
                    step="1"
                    min={1}
                    value={draft.quantity}
                    onChange={(e) => setDraft({ ...draft, quantity: e.currentTarget.value })}
                  />
                </Grid.Col>
                <Grid.Col span={{ base: 12, md: 3 }}>
                  <TextInput
                    label="Malzeme*"
                    placeholder="örn. ST 37-2"
                    value={draft.material}
                    onChange={(e) => setDraft({ ...draft, material: e.currentTarget.value })}
                  />
                </Grid.Col>
                <Grid.Col span={{ base: 12, md: 1 }}>
                  <Button
                    color="green"
                    fullWidth
                    title="Oluştur ve seç"
                    aria-label="Oluştur ve seç"
                    loading={create.isPending}
                    onClick={() => void submitCreate()}
                  >
                    <FaIcon icon="fas fa-check" />
                  </Button>
                </Grid.Col>
              </Grid>
              <Text size="xs" c="dimmed" mt={4}>
                Oluşturulan fire plaka otomatik olarak bu kesim için seçilir.
              </Text>
            </>
          ) : null}
        </ModalSection>
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={onClose} leftSection={<FaIcon icon="fas fa-times" />}>
            İptal
          </Button>
        </Group>
      </ModalBody>
    </Modal>
  );
}

// ---- "Plaka Kalemi Seç" ----

type ItemFilters = { job_no: string; search: string; is_delivered: string };
const EMPTY_ITEM_FILTERS: ItemFilters = { job_no: '', search: '', is_delivered: '' };

const ITEM_FILTERS: FilterConfig<keyof ItemFilters>[] = [
  {
    type: 'text',
    key: 'job_no',
    label: 'İş Emri No',
    placeholder: 'örn. 270-01',
    suggestions: 'jobOrders',
  },
  { type: 'text', key: 'search', label: 'Kalem Kodu / Adı', placeholder: 'örn. 10 mm' },
  {
    type: 'select',
    key: 'is_delivered',
    label: 'Teslim Durumu',
    placeholder: 'Tümü',
    searchable: false,
    options: [
      { value: 'true', label: 'Teslim Edildi' },
      { value: 'false', label: 'Teslim Bekleniyor' },
    ],
  },
];

const ITEM_COLUMNS: DataTableColumn<PlanningItem>[] = [
  { key: 'item_code', header: 'Kalem Kodu', width: '18%' },
  { key: 'item_name', header: 'Kalem Adı', width: '24%' },
  { key: 'job_no', header: 'İş Emri', width: '10%' },
  {
    key: 'quantity',
    header: 'Miktar',
    width: '10%',
    render: (r) => (r.quantity ? `${r.quantity} ${r.item_unit || ''}`.trim() : '-'),
  },
  {
    key: 'is_delivered',
    header: 'Teslim',
    width: '8%',
    render: (r) =>
      r.is_delivered ? (
        <StatusBadge color="green">Teslim</StatusBadge>
      ) : Number(r.delivered_quantity || 0) > 0 ? (
        <span title={`${r.delivered_quantity} / ${r.quantity} alındı`}>
          <StatusBadge color="purple">Kısmi</StatusBadge>
        </span>
      ) : (
        <StatusBadge color="orange">Bekliyor</StatusBadge>
      ),
  },
  {
    key: 'cnc_cuts_count',
    header: 'Kullanım',
    width: '8%',
    render: (r) => `${r.cnc_cuts_count ?? 0} kesim`,
  },
  { key: 'planning_request_number', header: 'Talep No', width: '12%' },
];

const EMPTY_ITEMS: PlanningItem[] = [];

export function PlanningItemPickerModal({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (item: PlanningItem) => void;
}) {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<ItemFilters>(EMPTY_ITEM_FILTERS);
  const [page, setPage] = useState(1);

  // Unconsumed plate lines of the user's own planning requests (superusers: all).
  const params: PlanningItemsParams = {
    is_plate: 'true',
    is_consumed: 'false',
    mine: 'true',
    fields: 'simple',
    ordering: '-id',
    page,
    page_size: 20,
    job_no: filters.job_no.trim() || undefined,
    search: filters.search.trim() || undefined,
    is_delivered:
      filters.is_delivered === 'true' || filters.is_delivered === 'false'
        ? filters.is_delivered
        : undefined,
  };
  const list = useQuery({
    ...planningItemsQueryOptions(params),
    placeholderData: keepPreviousData,
  });
  useEffect(() => {
    if (list.isError) notify.error('Plaka kalemleri yüklenirken hata oluştu');
  }, [list.isError, list.errorUpdatedAt]);

  const consume = useMutation({
    mutationFn: (item: PlanningItem) => markPlanningItemConsumed(item.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: planningItemKeys.all }),
  });

  const markConsumed = async (row: PlanningItem) => {
    const ok = await confirm({
      title: 'Kullanıldı Olarak İşaretle',
      icon: 'fas fa-box',
      message: `${row.item_code || ''} kalemi kullanıldı olarak işaretlenecek.`,
      description:
        'Kullanıldı işaretlenen kalemler yeni kesimler için seçilemez. (Planlama Kalemleri sayfasından geri alınabilir.)',
      confirmLabel: 'Evet, Kullanıldı',
      cancelLabel: 'İptal',
    });
    if (!ok) return;
    try {
      await consume.mutateAsync(row);
      notify.success('Kalem kullanıldı olarak işaretlendi');
    } catch {
      notify.error('Kalem işaretlenirken hata oluştu');
    }
  };

  const rowActions = (): RowAction<PlanningItem>[] => [
    { key: 'select', label: 'Seç', icon: 'fas fa-check', color: 'success', onClick: onPick },
    {
      key: 'mark-consumed',
      label: 'Kullanıldı',
      icon: 'fas fa-box',
      color: 'danger',
      onClick: (row) => void markConsumed(row),
    },
  ];

  return (
    <Modal opened onClose={onClose} size="xl" withCloseButton={false} classNames={modalClassNames}>
      <ModalHeader title="Plaka Kalemi Seç" icon="fas fa-box-open" />
      <ModalBody>
        <ModalSection title="Plaka Kalemleri" icon="fas fa-table">
          <DataTable
            title="Plaka Kalemleri Listesi"
            filters={
              <FilterBar
                inline
                filters={ITEM_FILTERS}
                values={filters}
                onApply={(next) => {
                  setPage(1);
                  setFilters(next);
                }}
              />
            }
            data={list.data?.results ?? EMPTY_ITEMS}
            columns={ITEM_COLUMNS}
            getRowId={(row) => String(row.id)}
            loading={list.isFetching}
            pagination={{ page, pageSize: 20, total: list.data?.count ?? 0, onPageChange: setPage }}
            rowActions={rowActions}
            emptyMessage="Plaka kalemi bulunamadı"
          />
        </ModalSection>
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={onClose} leftSection={<FaIcon icon="fas fa-times" />}>
            İptal
          </Button>
        </Group>
      </ModalBody>
    </Modal>
  );
}
