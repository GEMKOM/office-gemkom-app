import {
  Box,
  Checkbox,
  Grid,
  Group,
  NumberInput,
  Radio,
  Select,
  Stack,
  Text,
  Textarea,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { materialTrackingErrorMessage } from '@/api/materialTracking/errors';
import type { PlanningItem } from '@/api/planning/planningItems';
import {
  useCreateMaterialPullRequest,
  type MaterialPullRequest,
  type MaterialPullRequestInput,
} from '@/api/materialTracking/pullRequests';
import { subcontractorsQueryOptions } from '@/api/subcontracting/subcontractors';
import { piecesQueryOptions, type MaterialPiece } from '@/api/warehouse/pieces';
import { weldingTeamsQueryOptions } from '@/api/welding/teams';
import { FormModal, ModalSection, notify, SizeNote } from '@/ui';
import uiClasses from '@/ui/ui.module.css';
import { availableToPull, isBarLine } from './columns';
import { fmtQty, isPartiallyDelivered, qty } from './deliveryState';

const REQUIRED = 'Bu alan gereklidir';

// The same lists legacy ensureDestinationOptions() loaded.
const SUBCONTRACTOR_PARAMS = { page_size: 1000, ordering: 'name' };
const TEAM_PARAMS = { is_active: true, ordering: 'name', page_size: 1000 };

type DestinationType = 'subcontractor' | 'team';

interface PullFormValues {
  destination_type: DestinationType;
  subcontractor: string | null;
  team: string | null;
  quantities: Record<string, number | string>;
  /** Bar lines: bars picked per lot (line id → lot id → count). */
  bars: Record<string, Record<string, number | string>>;
  /** Bar lines handed over without pieces ("parçasız": bars that are not in piece stock). */
  parcasiz: Record<string, boolean>;
  note: string;
}

interface PullLine {
  id: number;
  /** The stock card (bar lines: whose lots to list). */
  item: number | null;
  bar: boolean;
  item_code?: string;
  item_name?: string;
  size_summary?: string;
  job_no?: string;
  item_unit?: string;
  received: number;
  pulled: number;
  available: number;
  partial: boolean;
  planned: PlanningItem['quantity'];
}

function toLine(row: PlanningItem): PullLine {
  return {
    id: row.id,
    item: row.item ?? null,
    bar: isBarLine(row),
    item_code: row.item_code ?? undefined,
    item_name: row.item_name ?? undefined,
    size_summary: row.size_summary ?? undefined,
    job_no: row.job_no ?? undefined,
    item_unit: row.item_unit ?? undefined,
    received: qty(row.delivered_quantity),
    pulled: qty(row.pulled_quantity),
    // What can still leave the warehouse: received minus what earlier pulls
    // claimed (the backend refuses more than that).
    available: availableToPull(row),
    partial: isPartiallyDelivered(row),
    planned: row.quantity,
  };
}

function lineHelp(line: PullLine): string {
  return (
    `İş No: ${line.job_no || '-'} · Birim: ${line.item_unit || '-'}` +
    ` · Teslim alınan ${fmtQty(line.received)}${line.partial ? ` / ${fmtQty(line.planned)} (kısmi teslim)` : ''}` +
    (line.pulled > 0 ? ` · Daha önce çıkan ${fmtQty(line.pulled)}` : '') +
    ` · Çıkabilir ${fmtQty(line.available)}`
  );
}

/** "3 boy · 16 m" for the bars picked on a line (lengths from its lots). */
export function pickedText(
  picked: Record<string, number | string> | undefined,
  lots: Pick<MaterialPiece, 'id' | 'length_mm'>[] | undefined,
): string {
  let bars = 0;
  let mm = 0;
  for (const [id, count] of Object.entries(picked ?? {})) {
    const n = Math.trunc(Number(count));
    if (!(n > 0)) continue;
    bars += n;
    const lot = (lots ?? []).find((l) => String(l.id) === id);
    mm += lot ? Number(lot.length_mm) * n : 0;
  }
  if (!bars) return 'Boy seçilmedi';
  return `${bars} boy · ${fmtQty(Math.round(mm / 10) / 100)} m`;
}

export interface CreatePullRequestModalProps {
  /** The selected planning item rows (only pullable ones). */
  items: PlanningItem[];
  onClose: () => void;
  onCreated?: (request: MaterialPullRequest) => void;
}

/**
 * Port of openCreatePullRequestModal / submitPullRequest: a destination
 * (subcontractor or welding team), one quantity per selected line (preset to
 * what is still in the warehouse) and a note. Mount it to open it.
 */
/** "6000 mm" of a lot. */
const lotLength = (lot: Pick<MaterialPiece, 'length_mm'>) => `${String(Number(lot.length_mm))} mm`;

/**
 * A bar line's bars from the job's İş Emri piece stock: one count per lot (length × free
 * bars). The quantity follows from them on the backend.
 */
function BarPicker({
  line,
  picked,
  onPick,
  onLots,
}: {
  line: PullLine;
  picked: Record<string, number | string>;
  onPick: (lotId: number, count: number | string) => void;
  onLots: (lots: MaterialPiece[]) => void;
}) {
  const lots = useQuery({
    ...piecesQueryOptions({
      item: line.item ?? 0,
      warehouse: 'IS_EMRI',
      job_no: line.job_no || '',
      available: 'true',
      page_size: 100,
    }),
    enabled: line.item !== null && Boolean(line.job_no),
  });
  const rows = lots.data?.results ?? [];
  useEffect(() => {
    if (lots.data) onLots(lots.data.results);
  }, [lots.data, onLots]);
  if (lots.isPending) return <Text size="xs">İş emri stoğu yükleniyor…</Text>;
  if (rows.length === 0)
    return (
      <Text size="xs" c="dimmed">
        {line.job_no} iş emri stoğunda bu karttan boy yok.
      </Text>
    );
  return (
    <Stack gap={4}>
      <Text size="xs" fw={600}>
        {line.job_no} iş emri stoğundaki boylar
      </Text>
      {rows.map((lot) => (
        <Group key={lot.id} gap="xs" wrap="nowrap">
          <Text size="sm" w={120} style={{ fontFamily: 'var(--gk-font-mono)' }}>
            {lotLength(lot)}
          </Text>
          <NumberInput
            size="xs"
            w={90}
            min={0}
            max={lot.available_quantity ?? lot.quantity}
            allowDecimal={false}
            hideControls
            placeholder="0"
            aria-label={`${line.item_code || line.id} ${lotLength(lot)} boy adedi`}
            value={picked[String(lot.id)] ?? ''}
            onChange={(value) => onPick(lot.id, value)}
          />
          <Text size="xs" c="dimmed">
            / {lot.available_quantity ?? lot.quantity} boş boy
            {lot.heat_number ? ` · döküm ${lot.heat_number}` : ''}
          </Text>
        </Group>
      ))}
    </Stack>
  );
}

export function CreatePullRequestModal({ items, onClose, onCreated }: CreatePullRequestModalProps) {
  const lines = useMemo(() => items.map(toLine), [items]);
  const subcontractors = useQuery(subcontractorsQueryOptions(SUBCONTRACTOR_PARAMS));
  const teams = useQuery(weldingTeamsQueryOptions(TEAM_PARAMS));
  const create = useCreateMaterialPullRequest();
  // The lots each bar line found in its job's İş Emri stock (line id → lots).
  const [barLots, setBarLots] = useState<Record<string, MaterialPiece[]>>({});
  const setLotsOf = useCallback(
    (lineId: number) => (lots: MaterialPiece[]) =>
      setBarLots((prev) => (prev[String(lineId)] === lots ? prev : { ...prev, [lineId]: lots })),
    [],
  );
  const lotSetters = useMemo(
    () => Object.fromEntries(lines.map((line) => [String(line.id), setLotsOf(line.id)])),
    [lines, setLotsOf],
  );

  const subcontractorOptions = useMemo(
    () =>
      (subcontractors.data?.results ?? [])
        .filter((s) => s.is_active !== false)
        .map((s) => ({ value: String(s.id), label: s.name || s.short_name || `#${s.id}` })),
    [subcontractors.data],
  );
  const teamOptions = useMemo(
    () =>
      (teams.data?.results ?? []).map((t) => ({
        value: String(t.id),
        label: t.name || `#${t.id}`,
      })),
    [teams.data],
  );

  // Legacy does not open the modal when the lists fail to load.
  const listError = subcontractors.isError || teams.isError;
  useEffect(() => {
    if (!listError) return;
    notify.error(subcontractors.error ?? teams.error, {
      fallback: 'Hedef listeleri yüklenirken hata oluştu',
    });
    onClose();
  }, [listError, subcontractors.error, teams.error, onClose]);

  const form = useForm<PullFormValues>({
    initialValues: {
      destination_type: 'subcontractor',
      subcontractor: null,
      team: null,
      quantities: Object.fromEntries(lines.map((line) => [String(line.id), line.available || ''])),
      bars: {},
      parcasiz: {},
      note: '',
    },
    validate: (values) => {
      const errors: Record<string, string> = {};
      // Only the visible destination dropdown is required (legacy skips hidden fields).
      if (values.destination_type === 'subcontractor' && !values.subcontractor)
        errors.subcontractor = REQUIRED;
      if (values.destination_type === 'team' && !values.team) errors.team = REQUIRED;
      for (const line of lines) {
        // A bar line by its picked bars (checked on save), unless handed over parçasız.
        if (line.bar && !values.parcasiz[String(line.id)]) continue;
        const raw = values.quantities[String(line.id)];
        const path = `quantities.${line.id}`;
        if (raw === '' || raw === undefined || raw === null) {
          errors[path] = REQUIRED;
          continue;
        }
        const n = typeof raw === 'number' ? raw : Number.parseFloat(raw);
        if (!Number.isFinite(n) || n <= 0) errors[path] = "Miktar 0'dan büyük olmalıdır";
        else if (line.available > 0 && n > line.available)
          errors[path] = `En fazla ${fmtQty(line.available)} imalata çıkabilir`;
      }
      return errors;
    },
  });

  const save = async (values: PullFormValues) => {
    const destinationType = values.destination_type;
    const destinationId = destinationType === 'subcontractor' ? values.subcontractor : values.team;
    if (!destinationId) {
      notify.warning(
        destinationType === 'subcontractor' ? 'Lütfen bir taşeron seçin' : 'Lütfen bir ekip seçin',
      );
      return;
    }
    if (lines.length === 0) {
      notify.warning('Lütfen en az bir kalem ekleyin');
      return;
    }
    const byPieces = (line: PullLine) => line.bar && !values.parcasiz[String(line.id)];
    const picksOf = (line: PullLine) =>
      Object.entries(values.bars[String(line.id)] ?? {})
        .map(([piece, count]) => ({ piece: Number(piece), quantity: Math.trunc(Number(count)) }))
        .filter((pick) => pick.quantity > 0);
    const noBars = lines.find((line) => byPieces(line) && picksOf(line).length === 0);
    if (noBars) {
      notify.warning(
        `${noBars.item_code || noBars.id}: iş emri stoğundan en az bir boy seçin ` +
          '(stokta parça kaydı olmayan boylar için "Parçasız" işaretleyin)',
      );
      return;
    }
    const payloadItems: MaterialPullRequestInput['items'] = lines.map((line) =>
      byPieces(line)
        ? { planning_item: line.id, pieces: picksOf(line) }
        : {
            planning_item: line.id,
            quantity: Number.parseFloat(String(values.quantities[String(line.id)])),
          },
    );
    if (
      payloadItems.some(
        (item) => 'quantity' in item && (!Number.isFinite(item.quantity) || item.quantity <= 0),
      )
    ) {
      notify.warning("Tüm kalemlerin miktarı 0'dan büyük olmalıdır");
      return;
    }

    const payload: MaterialPullRequestInput = { note: values.note.trim(), items: payloadItems };
    payload[destinationType] = Number(destinationId);

    try {
      const result = await create.mutateAsync(payload);
      notify.success(`İmalata çıkış talebi oluşturuldu: ${result.number}`);
      onCreated?.(result);
      onClose();
    } catch (error) {
      console.error('Error creating pull request:', error);
      notify.error(
        materialTrackingErrorMessage(error, 'İmalata çıkış talebi oluşturulurken hata oluştu'),
      );
    }
  };

  const isSubcontractor = form.values.destination_type === 'subcontractor';

  return (
    <FormModal
      opened={!listError}
      onClose={onClose}
      title="İmalata Çıkış Talebi Oluştur"
      icon="fas fa-dolly"
      size="lg"
      submitLabel="Talep Gönder"
      submitIcon="fas fa-dolly"
      submitting={create.isPending}
      onSubmit={form.onSubmit(save)}
    >
      <ModalSection title="Hedef" icon="fas fa-truck">
        <Grid gap="sm">
          <Grid.Col span={12}>
            <Radio.Group label="Hedef Tipi" {...form.getInputProps('destination_type')}>
              <Group gap="lg" mt={6}>
                <Radio value="subcontractor" label="Taşeron" />
                <Radio value="team" label="Kaynak Ekibi" />
              </Group>
            </Radio.Group>
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            {isSubcontractor ? (
              <Select
                key="subcontractor"
                label="Taşeron"
                placeholder={subcontractors.isPending ? 'Yükleniyor...' : 'Taşeron seçin...'}
                withAsterisk
                searchable
                nothingFoundMessage="Sonuç bulunamadı"
                data={subcontractorOptions}
                {...form.getInputProps('subcontractor')}
              />
            ) : (
              <Select
                key="team"
                label="Kaynak Ekibi"
                placeholder={teams.isPending ? 'Yükleniyor...' : 'Ekip seçin...'}
                withAsterisk
                searchable
                nothingFoundMessage="Sonuç bulunamadı"
                data={teamOptions}
                {...form.getInputProps('team')}
              />
            )}
          </Grid.Col>
        </Grid>
      </ModalSection>

      <ModalSection title={`Kalemler (${lines.length})`} icon="fas fa-list">
        {lines.map((line, index) => (
          <Box
            key={line.id}
            py="xs"
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) 130px',
              columnGap: 12,
              alignItems: 'center',
              borderBottom:
                index < lines.length - 1 ? '1px solid var(--mantine-color-gray-2)' : undefined,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <Text size="sm" fw={500} component="label" htmlFor={`pull-qty-${line.id}`}>
                <span className={uiClasses.code}>{line.item_code || '-'}</span> —{' '}
                {line.item_name || '-'}
              </Text>
              <SizeNote text={line.size_summary} />
              <Text size="xs" c="dimmed">
                {lineHelp(line)}
              </Text>
              {line.bar ? (
                <Stack gap={4} mt={6}>
                  {!form.values.parcasiz[String(line.id)] ? (
                    <BarPicker
                      line={line}
                      picked={form.values.bars[String(line.id)] ?? {}}
                      onPick={(lotId, count) =>
                        // The whole line's picks: a nested path fails while the line has none.
                        form.setFieldValue(`bars.${line.id}`, {
                          ...(form.values.bars[String(line.id)] ?? {}),
                          [lotId]: count,
                        })
                      }
                      onLots={lotSetters[String(line.id)]!}
                    />
                  ) : null}
                  <Checkbox
                    size="xs"
                    label="Parçasız (stokta parça kaydı olmayan boylar, miktarla)"
                    checked={Boolean(form.values.parcasiz[String(line.id)])}
                    onChange={(event) =>
                      form.setFieldValue(`parcasiz.${line.id}`, event.currentTarget.checked)
                    }
                  />
                </Stack>
              ) : null}
            </div>
            {line.bar && !form.values.parcasiz[String(line.id)] ? (
              <Text size="xs" c="dimmed" ta="right">
                {pickedText(form.values.bars[String(line.id)], barLots[String(line.id)])}
              </Text>
            ) : (
              <NumberInput
                id={`pull-qty-${line.id}`}
                aria-label={`Miktar: ${line.item_code || line.id}`}
                min={0.01}
                max={line.available || undefined}
                step={0.01}
                decimalScale={2}
                clampBehavior="none"
                hideControls
                {...form.getInputProps(`quantities.${line.id}`)}
              />
            )}
          </Box>
        ))}
      </ModalSection>

      <ModalSection title="Not" icon="fas fa-sticky-note">
        <Textarea
          label="Not (opsiyonel)"
          placeholder="Depoya iletmek istediğiniz not..."
          rows={3}
          {...form.getInputProps('note')}
        />
      </ModalSection>
    </FormModal>
  );
}
