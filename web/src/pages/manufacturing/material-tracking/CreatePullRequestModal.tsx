import { Box, Grid, Group, NumberInput, Radio, Select, Stack, Text, Textarea } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { materialTrackingErrorMessage } from '@/api/materialTracking/errors';
import {
  useCreateMaterialPullRequest,
  type MaterialPullRequest,
  type MaterialPullRequestInput,
} from '@/api/materialTracking/pullRequests';
import { subcontractorsQueryOptions } from '@/api/subcontracting/subcontractors';
import type { MaterialPiece } from '@/api/warehouse/pieces';
import { weldingTeamsQueryOptions } from '@/api/welding/teams';
import { barMetres } from '@/lib/format';
import { FormModal, ModalSection, notify } from '@/ui';
import uiClasses from '@/ui/ui.module.css';
import { fmtQty } from './deliveryState';
import { amountText, type JobStockRow } from './jobStock';

const REQUIRED = 'Bu alan gereklidir';

// The same lists legacy ensureDestinationOptions() loaded.
const SUBCONTRACTOR_PARAMS = { page_size: 1000, ordering: 'name' };
const TEAM_PARAMS = { is_active: true, ordering: 'name', page_size: 1000 };

type DestinationType = 'subcontractor' | 'team';

interface PullFormValues {
  destination_type: DestinationType;
  subcontractor: string | null;
  team: string | null;
  /** Cards: quantity per row key. */
  quantities: Record<string, number | string>;
  /** Bars: bars picked per lot (row key → lot id → count). */
  bars: Record<string, Record<string, number | string>>;
  note: string;
}

/** "3 boy · 36 m" for the bars picked on a row (lengths from its lots). */
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

const freeBars = (lot: MaterialPiece) => lot.available_quantity ?? lot.quantity;

function BarPicker({
  row,
  jobNo,
  picked,
  onPick,
}: {
  row: JobStockRow;
  jobNo: string;
  picked: Record<string, number | string>;
  onPick: (lotId: number, count: number | string) => void;
}) {
  const lots = row.lots.filter((lot) => freeBars(lot) > 0);
  return (
    <Stack gap={4} mt={6}>
      <Text size="xs" fw={600}>
        {jobNo} iş emri stoğundaki boylar
      </Text>
      {lots.map((lot) => (
        <Group key={lot.id} gap="xs" wrap="nowrap">
          <Text size="sm" w={120} style={{ fontFamily: 'var(--gk-font-mono)' }}>
            {barMetres(lot.length_mm)}
          </Text>
          <NumberInput
            size="xs"
            w={90}
            min={0}
            max={freeBars(lot)}
            allowDecimal={false}
            hideControls
            placeholder="0"
            aria-label={`${row.item_code} ${barMetres(lot.length_mm)} boy adedi`}
            value={picked[String(lot.id)] ?? ''}
            onChange={(value) => onPick(lot.id, value)}
          />
          <Text size="xs" c="dimmed">
            / {freeBars(lot)} boş boy
            {lot.heat_number ? ` · döküm ${lot.heat_number}` : ''}
          </Text>
        </Group>
      ))}
    </Stack>
  );
}

export interface CreatePullRequestModalProps {
  jobNo: string;
  /** The picked rows of the job's İş Emri stock (cards and bars, never plate). */
  rows: JobStockRow[];
  onClose: () => void;
  onCreated?: (request: MaterialPullRequest) => void;
}

/**
 * İmalata Çıkış Talebi from a job's İş Emri stock: a destination (welding team
 * or subcontractor), a quantity per card (preset to what can still go out),
 * the bars per lot for a bar card, and a note. Mount it to open it.
 */
export function CreatePullRequestModal({
  jobNo,
  rows,
  onClose,
  onCreated,
}: CreatePullRequestModalProps) {
  const subcontractors = useQuery(subcontractorsQueryOptions(SUBCONTRACTOR_PARAMS));
  const teams = useQuery(weldingTeamsQueryOptions(TEAM_PARAMS));
  const create = useCreateMaterialPullRequest();

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
      // The workshop mostly hands material to its own welding teams.
      destination_type: 'team',
      subcontractor: null,
      team: null,
      quantities: Object.fromEntries(
        rows.filter((r) => r.kind === 'card').map((r) => [r.key, r.available || '']),
      ),
      bars: {},
      note: '',
    },
    validate: (values) => {
      const errors: Record<string, string> = {};
      // Only the visible destination dropdown is required.
      if (values.destination_type === 'subcontractor' && !values.subcontractor)
        errors.subcontractor = REQUIRED;
      if (values.destination_type === 'team' && !values.team) errors.team = REQUIRED;
      for (const row of rows) {
        if (row.kind !== 'card') continue;
        const raw = values.quantities[row.key];
        const path = `quantities.${row.key}`;
        if (raw === '' || raw === undefined || raw === null) {
          errors[path] = REQUIRED;
          continue;
        }
        const n = typeof raw === 'number' ? raw : Number.parseFloat(raw);
        if (!Number.isFinite(n) || n <= 0) errors[path] = "Miktar 0'dan büyük olmalıdır";
        else if (n > row.available)
          errors[path] = `En fazla ${amountText(row, row.available)} imalata çıkabilir`;
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
    const picksOf = (row: JobStockRow) =>
      Object.entries(values.bars[row.key] ?? {})
        .map(([piece, count]) => ({ piece: Number(piece), quantity: Math.trunc(Number(count)) }))
        .filter((pick) => pick.quantity > 0);
    const noBars = rows.find((row) => row.kind === 'bar' && picksOf(row).length === 0);
    if (noBars) {
      notify.warning(`${noBars.item_code}: iş emri stoğundan en az bir boy seçin`);
      return;
    }
    const items: MaterialPullRequestInput['items'] = rows.map((row) =>
      row.kind === 'bar'
        ? { item: row.item, job_no: jobNo, pieces: picksOf(row) }
        : {
            item: row.item,
            job_no: jobNo,
            quantity: Number.parseFloat(String(values.quantities[row.key])),
          },
    );
    const payload: MaterialPullRequestInput = { note: values.note.trim(), items };
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
      title={`İmalata Çıkış Talebi · ${jobNo}`}
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
                <Radio value="team" label="Kaynak Ekibi" />
                <Radio value="subcontractor" label="Taşeron" />
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

      <ModalSection title={`Kalemler (${rows.length})`} icon="fas fa-list">
        {rows.map((row, index) => (
          <Box
            key={row.key}
            py="xs"
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) 130px',
              columnGap: 12,
              alignItems: 'center',
              borderBottom:
                index < rows.length - 1 ? '1px solid var(--mantine-color-gray-2)' : undefined,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <Text size="sm" fw={500} component="label" htmlFor={`pull-qty-${row.key}`}>
                <span className={uiClasses.code}>{row.item_code}</span> — {row.item_name || '-'}
              </Text>
              <Text size="xs" c="dimmed">
                Stokta {amountText(row, row.onHand)}
                {row.held > 0 ? ` · bekleyen taleplerde ${amountText(row, row.held)}` : ''} ·
                çıkabilir {amountText(row, row.available)}
              </Text>
              {row.kind === 'bar' ? (
                <BarPicker
                  row={row}
                  jobNo={jobNo}
                  picked={form.values.bars[row.key] ?? {}}
                  onPick={(lotId, count) =>
                    // The whole row's picks: a nested path fails while the row has none.
                    form.setFieldValue(`bars.${row.key}`, {
                      ...(form.values.bars[row.key] ?? {}),
                      [lotId]: count,
                    })
                  }
                />
              ) : null}
            </div>
            {row.kind === 'bar' ? (
              <Text size="xs" c="dimmed" ta="right">
                {pickedText(form.values.bars[row.key], row.lots)}
              </Text>
            ) : (
              <NumberInput
                id={`pull-qty-${row.key}`}
                aria-label={`Miktar: ${row.item_code}`}
                min={0.01}
                max={row.available || undefined}
                step={0.01}
                decimalScale={2}
                clampBehavior="none"
                hideControls
                rightSection={
                  <Text size="xs" c="dimmed" pr={6}>
                    {row.item_unit}
                  </Text>
                }
                rightSectionWidth={52}
                {...form.getInputProps(`quantities.${row.key}`)}
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
