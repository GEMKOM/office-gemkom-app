import { Alert, Button, Checkbox, Group, Modal, NumberInput, Stack, Text } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import {
  cncTaskKeys,
  cncTaskQueryOptions,
  finishCncTask,
  previewCncFinish,
  type CncTask,
  type ProcessInput,
  type ProcessPart,
  type ProcessRemnantInput,
} from '@/api/manufacturing/cncTasks';
import { pieceKeys, searchPlateCards } from '@/api/warehouse/pieces';
import { formatNumber } from '@/lib/format';
import {
  DataTable,
  errorMessage,
  FaIcon,
  ModalBody,
  ModalHeader,
  ModalSection,
  modalClassNames,
  notify,
  SelectRemote,
  StatCards,
  StatusBadge,
  type DataTableColumn,
} from '@/ui';
import { pieceText } from './PlateSource';

// Finishing a cut ("Kesimi Bitir"). The operator enters the remnants the cut
// left, or confirms it left none. On finish the backend issues the reserved
// sheets, brings the remnants back to stock as pieces of the same card and
// stores the fire: consumed − parts − remnants. Totals are previewed live.

/** The minimum short side of a remnant that goes back to stock (backend: MIN_REMNANT_SIDE_MM). */
export const MIN_REMNANT_SIDE_MM = 500;

export const kg = (value: string | number | null | undefined) =>
  value === null || value === undefined || value === ''
    ? '-'
    : `${formatNumber(Number(value), 2)} kg`;

export interface RemnantDraft {
  rowId: number;
  width: number | string;
  length: number | string;
  quantity: number | string;
}

let nextRowId = 1;
export const newRemnant = (): RemnantDraft => ({
  rowId: nextRowId++,
  width: '',
  length: '',
  quantity: 1,
});

const positive = (value: number | string) => Number(value) > 0;

/** Complete remnant rows, with the chosen card (else the cut sheet's card). */
export function remnantInputs(
  rows: readonly RemnantDraft[],
  card: string | null,
): ProcessRemnantInput[] {
  return rows
    .filter((r) => positive(r.width) && positive(r.length) && positive(r.quantity))
    .map((r) => ({
      width_mm: String(r.width),
      length_mm: String(r.length),
      quantity: Number(r.quantity),
      ...(card ? { item: Number(card) } : {}),
    }));
}

export function RemnantRows({
  rows,
  onChange,
  card,
  onCard,
}: {
  rows: RemnantDraft[];
  onChange: (rows: RemnantDraft[]) => void;
  card: string | null;
  onCard: (card: string | null) => void;
}) {
  const update = (rowId: number, patch: Partial<RemnantDraft>) =>
    onChange(rows.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)));
  return (
    <Stack gap="xs">
      {rows.map((r, index) => (
        <Group key={r.rowId} gap="xs" align="flex-end">
          <NumberInput
            size="xs"
            w={110}
            label={index === 0 ? 'En (mm)' : undefined}
            aria-label={`Fire sac eni ${index + 1}`}
            min={0}
            hideControls
            value={r.width}
            onChange={(value) => update(r.rowId, { width: value })}
          />
          <NumberInput
            size="xs"
            w={110}
            label={index === 0 ? 'Boy (mm)' : undefined}
            aria-label={`Fire sac boyu ${index + 1}`}
            min={0}
            hideControls
            value={r.length}
            onChange={(value) => update(r.rowId, { length: value })}
          />
          <NumberInput
            size="xs"
            w={80}
            label={index === 0 ? 'Adet' : undefined}
            aria-label={`Fire sac adedi ${index + 1}`}
            min={1}
            allowDecimal={false}
            value={r.quantity}
            onChange={(value) => update(r.rowId, { quantity: value })}
          />
          {positive(r.width) &&
          positive(r.length) &&
          Math.min(Number(r.width), Number(r.length)) < MIN_REMNANT_SIDE_MM ? (
            <StatusBadge color="orange">Fire (stoğa alınmaz)</StatusBadge>
          ) : null}
          <Button
            size="xs"
            variant="subtle"
            color="red"
            aria-label={`Fire sacı sil ${index + 1}`}
            onClick={() => onChange(rows.filter((x) => x.rowId !== r.rowId))}
          >
            <FaIcon icon="fas fa-trash" />
          </Button>
        </Group>
      ))}
      <Group gap="xs" align="flex-end">
        <Button
          size="xs"
          variant="light"
          leftSection={<FaIcon icon="fas fa-plus" />}
          onClick={() => onChange([...rows, newRemnant()])}
        >
          Fire Sac Ekle
        </Button>
        {rows.length ? (
          <SelectRemote
            size="xs"
            label="Sac kartı"
            aria-label="Fire sac kartı"
            description="Boş bırakılırsa kesilen sacın kartı"
            placeholder="Sac kartı ara…"
            minSearchLength={2}
            queryKey={[...pieceKeys.all, 'plate-card-search']}
            search={searchPlateCards}
            value={card}
            onChange={onCard}
          />
        ) : null}
      </Group>
    </Stack>
  );
}

export const PART_DEDUCT_COLUMNS: DataTableColumn<ProcessPart>[] = [
  { key: 'job_no', header: 'İş Emri No' },
  { key: 'image_no', header: 'Resim No', render: (p) => p.image_no || '-' },
  { key: 'position_no', header: 'Pozisyon No', render: (p) => p.position_no || '-' },
  { key: 'weight_kg', header: 'Ağırlık', align: 'right', render: (p) => kg(p.weight_kg) },
  { key: 'quantity', header: 'Miktar', align: 'right', render: (p) => p.quantity ?? '-' },
  { key: 'parts_kg', header: 'Parça kg', align: 'right', render: (p) => kg(p.parts_kg) },
  { key: 'fire_kg', header: 'Fire payı', align: 'right', render: (p) => kg(p.fire_kg) },
  { key: 'deduct_kg', header: 'Düşülecek', align: 'right', render: (p) => kg(p.deduct_kg) },
];

export interface KgFigures {
  consumed_kg?: string | null;
  consumed_estimated?: boolean | null;
  parts_kg?: string | null;
  remnant_kg?: string | null;
  fire_kg?: string | null;
}

/** Consumed / parts / remnants / fire, with the warnings that go with them. */
export function KgSummary({
  figures,
  task,
  partsWithoutWeight = 0,
  scrapped = false,
}: {
  figures: KgFigures;
  task: CncTask;
  partsWithoutWeight?: number;
  scrapped?: boolean;
}) {
  const fire = figures.fire_kg === null || figures.fire_kg === undefined ? null : Number(figures.fire_kg);
  return (
    <Stack gap="xs">
      <StatCards
        cols={4}
        cards={[
          {
            id: 'consumed',
            title: figures.consumed_estimated ? 'Kullanılan Sac (tahmini)' : 'Kullanılan Sac',
            value: kg(figures.consumed_kg),
            icon: 'fas fa-layer-group',
            color: 'blue',
            tooltip: figures.consumed_estimated
              ? `Kesimin ölçüsü (${task.dimensions || '-'}), kalınlığı ve sac adedinden`
              : undefined,
          },
          { id: 'parts', title: 'Parçalar', value: kg(figures.parts_kg), icon: 'fas fa-puzzle-piece', color: 'green' },
          {
            id: 'remnants',
            title: 'Stoğa Dönen Fire Sac',
            value: kg(figures.remnant_kg),
            icon: 'fas fa-undo',
            color: 'purple',
          },
          {
            id: 'fire',
            title: 'Fire',
            value: kg(figures.fire_kg),
            icon: 'fas fa-fire',
            color: fire !== null && fire < 0 ? 'red' : 'orange',
          },
        ]}
      />
      {figures.consumed_kg === null || figures.consumed_kg === undefined ? (
        <Alert color="yellow" icon={<FaIcon icon="fas fa-exclamation-triangle" />}>
          Kullanılan sacın ağırlığı hesaplanamadı (kartta kalınlık yok ya da kesimin ölçüsü
          okunamadı); fire hesaplanamaz.
        </Alert>
      ) : null}
      {fire !== null && fire < 0 ? (
        <Alert color="red" icon={<FaIcon icon="fas fa-exclamation-triangle" />}>
          Parçalar ve fire saclar kullanılan sactan ağır; parça ağırlıklarını veya fire sac
          ölçülerini kontrol edin.
        </Alert>
      ) : null}
      {partsWithoutWeight > 0 ? (
        <Alert color="yellow" icon={<FaIcon icon="fas fa-exclamation-triangle" />}>
          {partsWithoutWeight} parçanın ağırlığı girilmemiş; 0 kg sayıldı, fire o kadar yüksek
          çıkar.
        </Alert>
      ) : null}
      {scrapped ? (
        <Text size="xs" c="dimmed">
          Kısa kenarı {MIN_REMNANT_SIDE_MM} mm’den kısa fire sac stoğa alınmaz; fireye sayıldı.
        </Text>
      ) : null}
    </Stack>
  );
}

export function useFinishPreview(key: string, input: ProcessInput | null, enabled: boolean) {
  const [debounced] = useDebouncedValue(input, 300);
  return useQuery({
    queryKey: [...cncTaskKeys.all, 'finish-preview', key, debounced],
    queryFn: () => previewCncFinish(key, debounced!),
    enabled: enabled && debounced !== null,
    placeholderData: keepPreviousData,
    retry: false,
  });
}

/** "Kesimi Bitir": the remnants, the live totals, then finish. */
export function FinishCutModal({ cutKey, onClose }: { cutKey: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const task = useQuery(cncTaskQueryOptions(cutKey));
  const t = task.data;
  const reservation = t?.piece_reservations?.[0] ?? null;
  const [rows, setRows] = useState<RemnantDraft[]>(() => [newRemnant()]);
  const [card, setCard] = useState<string | null>(null);
  const [none, setNone] = useState(false);
  const remnants = useMemo(() => (none ? [] : remnantInputs(rows, card)), [none, rows, card]);
  const preview = useFinishPreview(cutKey, { remnants }, Boolean(t));
  const finish = useMutation({
    mutationFn: () => finishCncTask(cutKey, { remnants, no_remnant: none }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: cncTaskKeys.all }),
        queryClient.invalidateQueries({ queryKey: pieceKeys.all }),
      ]),
  });
  const result = preview.data;
  const previewError = preview.isError ? errorMessage(preview.error, 'Hesaplanamadı') : '';
  const ready = none || remnants.length > 0;

  const save = async () => {
    try {
      await finish.mutateAsync();
      notify.success('Kesim tamamlandı olarak işaretlendi');
      onClose();
    } catch (error) {
      notify.error(errorMessage(error, 'Kesim tamamlanamadı'));
    }
  };

  return (
    <Modal opened onClose={onClose} size="90%" withCloseButton={false} classNames={modalClassNames}>
      <ModalHeader title="Kesimi Bitir" subtitle={cutKey} icon="fas fa-check-circle" />
      <ModalBody>
        {!t ? (
          <Text c="dimmed">Yükleniyor…</Text>
        ) : (
          <Stack gap="md">
            <ModalSection title="Kesim" icon="fas fa-info-circle">
              <Text size="sm">
                {t.name || '-'} · Nesting {t.nesting_id || '-'} · {t.material || '-'} ·{' '}
                {t.dimensions || '-'} · {t.quantity ?? 1} sac
              </Text>
              <Text size="sm" c="dimmed">
                {reservation
                  ? `${pieceText(reservation.piece_details)} × ${reservation.quantity} sac stoktan düşülecek.`
                  : 'Kesime ayrılmış sac partisi yok; kullanılan sacın ağırlığı kesimin ölçüsünden tahmin edilir.'}
              </Text>
            </ModalSection>

            <ModalSection title="Fire Saclar" icon="fas fa-undo">
              <Text size="xs" c="dimmed" mb="xs">
                Kesimden artan dikdörtgen saclar. Kısa kenarı {MIN_REMNANT_SIDE_MM} mm ve üstü
                olanlar aynı sac kartıyla Hammadde deposuna döner; daha kısası fireye sayılır.
              </Text>
              {none ? null : (
                <RemnantRows rows={rows} onChange={setRows} card={card} onCard={setCard} />
              )}
              <Checkbox
                mt="sm"
                label="Kullanılabilir fire sac kalmadı"
                checked={none}
                onChange={(event) => setNone(event.currentTarget.checked)}
              />
            </ModalSection>

            {previewError ? (
              <Alert color="red" icon={<FaIcon icon="fas fa-exclamation-circle" />}>
                {previewError}
              </Alert>
            ) : result ? (
              <KgSummary
                figures={result}
                task={t}
                partsWithoutWeight={result.parts_without_weight}
                scrapped={result.remnants.some((r) => !r.kept)}
              />
            ) : null}

            <DataTable
              title="Parçalar"
              icon="fas fa-puzzle-piece"
              data={result?.parts ?? []}
              columns={PART_DEDUCT_COLUMNS}
              getRowId={(p) => String(p.id)}
              loading={preview.isFetching}
              striped
              verticalSpacing="xs"
              emptyMessage="Parça bulunamadı"
            />

            <Group justify="flex-end">
              <Button variant="default" onClick={onClose} leftSection={<FaIcon icon="fas fa-times" />}>
                Vazgeç
              </Button>
              <Button
                leftSection={<FaIcon icon="fas fa-check" />}
                disabled={!ready || Boolean(previewError) || preview.isFetching}
                title={ready ? undefined : 'Fire sacları girin ya da fire kalmadığını işaretleyin'}
                loading={finish.isPending}
                onClick={() => void save()}
              >
                Kesimi Bitir
              </Button>
            </Group>
          </Stack>
        )}
      </ModalBody>
    </Modal>
  );
}
