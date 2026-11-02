import { Box, Grid, Group, NumberInput, Radio, Select, Text, Textarea } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { materialTrackingErrorMessage } from '@/api/materialTracking/errors';
import type { PlanningItem } from '@/api/materialTracking/planningItems';
import {
  useCreateMaterialPullRequest,
  type MaterialPullRequest,
  type MaterialPullRequestInput,
} from '@/api/materialTracking/pullRequests';
import { subcontractorsQueryOptions } from '@/api/subcontracting/subcontractors';
import { weldingTeamsQueryOptions } from '@/api/welding/teams';
import { FormModal, ModalSection, notify } from '@/ui';
import uiClasses from '@/ui/ui.module.css';
import { availableToPull } from './columns';
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
  note: string;
}

interface PullLine {
  id: number;
  item_code?: string;
  item_name?: string;
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
    item_code: row.item_code,
    item_name: row.item_name,
    job_no: row.job_no,
    item_unit: row.item_unit,
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
    (line.pulled > 0 ? ` · Daha önce çekilen ${fmtQty(line.pulled)}` : '') +
    ` · Çekilebilir ${fmtQty(line.available)}`
  );
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
export function CreatePullRequestModal({ items, onClose, onCreated }: CreatePullRequestModalProps) {
  const lines = useMemo(() => items.map(toLine), [items]);
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
      destination_type: 'subcontractor',
      subcontractor: null,
      team: null,
      quantities: Object.fromEntries(lines.map((line) => [String(line.id), line.available || ''])),
      note: '',
    },
    validate: (values) => {
      const errors: Record<string, string> = {};
      // Only the visible destination dropdown is required (legacy skips hidden fields).
      if (values.destination_type === 'subcontractor' && !values.subcontractor)
        errors.subcontractor = REQUIRED;
      if (values.destination_type === 'team' && !values.team) errors.team = REQUIRED;
      for (const line of lines) {
        const raw = values.quantities[String(line.id)];
        const path = `quantities.${line.id}`;
        if (raw === '' || raw === undefined || raw === null) {
          errors[path] = REQUIRED;
          continue;
        }
        const n = typeof raw === 'number' ? raw : Number.parseFloat(raw);
        if (!Number.isFinite(n) || n <= 0) errors[path] = "Miktar 0'dan büyük olmalıdır";
        else if (line.available > 0 && n > line.available)
          errors[path] = `En fazla ${fmtQty(line.available)} çekilebilir`;
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
    const payloadItems = lines.map((line) => ({
      planning_item: line.id,
      quantity: Number.parseFloat(String(values.quantities[String(line.id)])),
    }));
    if (payloadItems.some((item) => !Number.isFinite(item.quantity) || item.quantity <= 0)) {
      notify.warning("Tüm kalemlerin miktarı 0'dan büyük olmalıdır");
      return;
    }

    const payload: MaterialPullRequestInput = { note: values.note.trim(), items: payloadItems };
    payload[destinationType] = Number(destinationId);

    try {
      const result = await create.mutateAsync(payload);
      notify.success(`Malzeme çekme talebi oluşturuldu: ${result.number}`);
      onCreated?.(result);
      onClose();
    } catch (error) {
      console.error('Error creating pull request:', error);
      notify.error(
        materialTrackingErrorMessage(error, 'Depo çekme talebi oluşturulurken hata oluştu'),
      );
    }
  };

  const isSubcontractor = form.values.destination_type === 'subcontractor';

  return (
    <FormModal
      opened={!listError}
      onClose={onClose}
      title="Depodan Çekme Talebi Oluştur"
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
              <Text size="xs" c="dimmed">
                {lineHelp(line)}
              </Text>
            </div>
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
