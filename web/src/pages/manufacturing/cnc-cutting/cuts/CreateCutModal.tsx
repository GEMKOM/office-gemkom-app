import {
  ActionIcon,
  Button,
  Grid,
  Group,
  NumberInput,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { useRef, useState, type FormEvent } from 'react';
import { cncTaskKeys, createCncTask, type CncPartInput } from '@/api/manufacturing/cncTasks';
import { FaIcon, FileDropInput, FormModal, ModalSection, notify } from '@/ui';
import { CutBasicFields, cutInput, cutSchema, EMPTY_CUT_FORM, useJobOrderChoices } from './cutForm';
import { parsePartsFromText } from './partsPaste';
import { EMPTY_PLATE_SOURCE, PlateSourceSection, type PlateSourceValue } from './PlateSource';

export const PASTE_HELP =
  'İlk satır: İş No  Resim No  Pozisyon No. Sonraki satırlar: genişlik (mm), yükseklik (mm), alan (m²), ağırlık (kg), malzeme, kalınlık (mm), proje, talep eden, not.';

export interface PartDraft {
  rowId: number;
  job_no: string;
  image_no: string;
  position_no: string;
  weight: number | string;
  quantity: number | string;
}

/** The rows a user filled in (any field), as parts_data. */
export function draftsToParts(rows: readonly PartDraft[]): CncPartInput[] {
  const parts: CncPartInput[] = [];
  for (const row of rows) {
    const image = row.image_no.trim();
    const position = row.position_no.trim();
    const weight = String(row.weight).trim();
    const quantity = String(row.quantity).trim();
    if (!(row.job_no || image || position || weight || quantity)) continue;
    parts.push({
      job_no: row.job_no || '',
      image_no: image,
      position_no: position,
      weight_kg: parseFloat(weight) || 0,
      quantity: quantity ? parseInt(quantity, 10) : null,
    });
  }
  return parts;
}

const DEFAULT_FILES_HELP =
  'Nesting ve diğer dosyalar (opsiyonel) - Birden fazla dosya seçebilirsiniz';

export function CreateCutModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const form = useForm({ initialValues: EMPTY_CUT_FORM, validate: zod4Resolver(cutSchema) });
  const [plate, setPlate] = useState<PlateSourceValue>(EMPTY_PLATE_SOURCE);
  const [files, setFiles] = useState<File[]>([]);
  const [rows, setRows] = useState<PartDraft[]>([]);
  const [paste, setPaste] = useState('');
  // Row ids only grow, so removing a middle row never hands its id to a new one.
  const nextId = useRef(0);
  const jobChoices = useJobOrderChoices(rows.map((r) => r.job_no));

  const newRow = (part?: Partial<CncPartInput>): PartDraft => ({
    rowId: nextId.current++,
    job_no: part?.job_no ?? '',
    image_no: part?.image_no ?? '',
    position_no: part?.position_no ?? '',
    weight: part?.weight_kg ?? '',
    quantity: part?.quantity ?? '',
  });
  const updateRow = (rowId: number, patch: Partial<PartDraft>) =>
    setRows((list) => list.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)));

  const create = useMutation({
    mutationFn: createCncTask,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: cncTaskKeys.all }),
  });

  const save = async (values: typeof form.values) => {
    // Every cut needs exactly one plate source.
    if (!plate.remnant && !plate.planningItem) {
      notify.error('Fire plaka veya plaka kalemi seçmelisiniz');
      return;
    }
    const parts = draftsToParts(rows);
    if (!parts.length) {
      notify.error('En az bir parça eklemelisiniz');
      return;
    }
    try {
      await create.mutateAsync({ ...cutInput(values, plate), files, parts_data: parts });
      notify.success('Kesim başarıyla oluşturuldu');
      onClose();
    } catch {
      notify.error('Kesim oluşturulurken hata oluştu');
    }
  };

  const parsePaste = () => {
    const parsed = parsePartsFromText(paste);
    if (!parsed.length) {
      notify.warning('Yapıştırılan veriler ayrıştırılamadı');
      return;
    }
    setRows((list) => [...list, ...parsed.map(newRow)]);
    notify.success(`${parsed.length} parça eklendi`);
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title="Yeni Kesim Oluştur"
      icon="fas fa-plus-circle"
      size="xl"
      submitLabel="Kesim Oluştur"
      submitting={create.isPending}
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        // Nested pickers render inside this form's React tree; their events are not ours.
        if (event.target !== event.currentTarget) return;
        form.onSubmit((values) => void save(values))(event);
      }}
    >
      <PlateSourceSection value={plate} onChange={setPlate} />

      <ModalSection title="Temel Bilgiler" icon="fas fa-info-circle">
        <CutBasicFields
          form={form}
          dimensionsHelp="Plaka boyutları (opsiyonel; fire plaka seçilirse otomatik alınır)"
        />
        <FileDropInput
          mt="sm"
          label="Dosyalar"
          multiple
          clearable
          value={files}
          onChange={setFiles}
          description={
            files.length
              ? `${files.length} dosya seçildi - ${files.map((f) => f.name).join(', ')}`
              : DEFAULT_FILES_HELP
          }
          leftSection={<FaIcon icon="fas fa-paperclip" />}
          maw={{ md: '50%' }}
        />
      </ModalSection>

      <ModalSection title="Parça Bilgileri *" icon="fas fa-puzzle-piece">
        <Group justify="space-between" mb="xs">
          <div>
            <Text fw={600} size="sm">
              Parça Listesi
            </Text>
            <Text size="xs" c="red">
              <FaIcon icon="fas fa-exclamation-circle" /> En az bir parça eklemelisiniz
            </Text>
          </div>
          <Group gap="xs">
            <Button
              size="xs"
              variant="outline"
              leftSection={<FaIcon icon="fas fa-plus" />}
              onClick={() => setRows((list) => [...list, newRow()])}
            >
              Parça Ekle
            </Button>
            <Button
              size="xs"
              variant="outline"
              color="red"
              leftSection={<FaIcon icon="fas fa-trash-alt" />}
              onClick={() => {
                setRows([]);
                notify.info('Tüm parçalar temizlendi');
              }}
            >
              Tümünü Temizle
            </Button>
          </Group>
        </Group>

        <Textarea
          label="Toplu Yapıştır (Excel kopyasını buraya yapıştırın)"
          placeholder="Excel'den kopyaladığınız verileri buraya yapıştırın"
          rows={4}
          value={paste}
          onChange={(e) => setPaste(e.currentTarget.value)}
        />
        <Group gap="xs" mt="xs" mb="md" wrap="nowrap" align="flex-start">
          <Button
            size="xs"
            variant="outline"
            color="green"
            leftSection={<FaIcon icon="fas fa-magic" />}
            onClick={parsePaste}
            style={{ flexShrink: 0 }}
          >
            Yapıştırılanı Ayrıştır ve Ekle
          </Button>
          <Text size="xs" c="dimmed">
            {PASTE_HELP}
          </Text>
        </Group>

        <Stack gap="xs">
          {rows.length ? (
            <Grid gap="xs" visibleFrom="md">
              {['İş No', 'Resim No', 'Pozisyon No', 'Ağırlık (kg)', 'Adet', 'İşlem'].map((h) => (
                <Grid.Col key={h} span={2}>
                  <Text size="xs" fw={700} c="dimmed">
                    {h}
                  </Text>
                </Grid.Col>
              ))}
            </Grid>
          ) : null}
          {rows.map((row, index) => (
            <Grid key={row.rowId} gap="xs" data-testid="part-row">
              <Grid.Col span={{ base: 12, md: 2 }}>
                <Select
                  size="xs"
                  aria-label={`İş No ${index + 1}`}
                  placeholder="İş emri seçin"
                  data={jobChoices}
                  searchable
                  clearable
                  limit={100}
                  value={row.job_no || null}
                  onChange={(value) => updateRow(row.rowId, { job_no: value ?? '' })}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 6, md: 2 }}>
                <TextInput
                  size="xs"
                  aria-label={`Resim No ${index + 1}`}
                  placeholder="Resim numarası"
                  value={row.image_no}
                  onChange={(e) => updateRow(row.rowId, { image_no: e.currentTarget.value })}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 6, md: 2 }}>
                <TextInput
                  size="xs"
                  aria-label={`Pozisyon No ${index + 1}`}
                  placeholder="Pozisyon numarası"
                  value={row.position_no}
                  onChange={(e) => updateRow(row.rowId, { position_no: e.currentTarget.value })}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 5, md: 2 }}>
                <NumberInput
                  size="xs"
                  aria-label={`Ağırlık ${index + 1}`}
                  placeholder="0.00"
                  step={0.01}
                  min={0}
                  hideControls
                  value={row.weight}
                  onChange={(value) => updateRow(row.rowId, { weight: value })}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 5, md: 2 }}>
                <NumberInput
                  size="xs"
                  aria-label={`Adet ${index + 1}`}
                  placeholder="0"
                  step={1}
                  min={0}
                  allowDecimal={false}
                  hideControls
                  value={row.quantity}
                  onChange={(value) => updateRow(row.rowId, { quantity: value })}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 2, md: 2 }}>
                <ActionIcon
                  variant="outline"
                  color="red"
                  title="Parçayı Kaldır"
                  aria-label="Parçayı Kaldır"
                  onClick={() => setRows((list) => list.filter((r) => r.rowId !== row.rowId))}
                >
                  <FaIcon icon="fas fa-trash" />
                </ActionIcon>
              </Grid.Col>
            </Grid>
          ))}
        </Stack>
      </ModalSection>
    </FormModal>
  );
}
