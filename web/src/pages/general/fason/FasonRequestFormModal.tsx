import {
  ActionIcon,
  Badge,
  Button,
  FileButton,
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
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { fasonKeys } from '@/api/fason/jobs';
import {
  useCreateDepartmentRequest,
  type DepartmentRequestItemInput,
} from '@/api/general/departmentRequests';
import { fasonOperationsQueryOptions, type Item } from '@/api/procurement/items';
import { useJobOrderOptions } from '@/api/reference';
import { errorMessage, FaIcon, FileDropInput, FormModal, ModalSection, notify } from '@/ui';

const REQUIRED = 'Bu alan gereklidir';

export interface FasonPartRow {
  key: number;
  /** Part no / description ("P-26", "304-02 kapak"); goes to item_description. */
  part: string;
  quantity: number | string;
  job_no: string | null;
  /** The part's own files (drawing, DXF…); they stay with the row when others are removed. */
  files: File[];
}

export interface FasonRequestFormValues {
  /** Code of the workshop-route F card. */
  operation: string | null;
  rows: FasonPartRow[];
  needed_date: string;
  note: string;
}

let nextKey = 1;
const emptyRow = (): FasonPartRow => ({
  key: nextKey++,
  part: '',
  quantity: 1,
  job_no: null,
  files: [],
});

/**
 * The upload of a fason request: the general files first, then each part's
 * own, and the department request's file_item_mapping ({file index: [row
 * index]}) that ties a part's files to its row.
 */
export function fasonUpload(
  general: readonly File[],
  rows: readonly Pick<FasonPartRow, 'files'>[],
): { files: File[]; file_item_mapping: Record<string, number[]> } {
  const files = [...general];
  const mapping: Record<string, number[]> = {};
  rows.forEach((row, rowIndex) => {
    for (const file of row.files) {
      mapping[String(files.length)] = [rowIndex];
      files.push(file);
    }
  });
  return { files, file_item_mapping: mapping };
}

/**
 * The department request a fason request is: one row per part, each on the
 * operation's F card (code, name, unit 'adet'), the part in item_description.
 */
export function buildFasonRequest(
  card: Pick<Item, 'id' | 'code' | 'name'>,
  values: FasonRequestFormValues,
): { title: string; items: DepartmentRequestItemInput[] } {
  const items = values.rows.map((row) => {
    const quantity = Number.parseInt(String(row.quantity ?? ''), 10);
    return {
      item_id: card.id,
      item_code: card.code,
      item_name: card.name,
      job_no: row.job_no || null,
      item_unit: 'adet',
      quantity: Number.isNaN(quantity) || quantity < 1 ? 1 : quantity,
      item_description: row.part.trim() || null,
      item_specifications: null,
    };
  });
  const jobNos = [...new Set(items.map((i) => i.job_no).filter(Boolean))];
  const title = jobNos.length ? `${card.name} · ${jobNos.join(', ')}` : card.name;
  return { title: title.slice(0, 200), items };
}

export interface FasonRequestFormModalProps {
  onClose: () => void;
  /** After a save, in place of onClose: the new request's fason job, to open it. */
  onCreated?: (jobId: number | null) => void;
}

/**
 * Yeni Fason Talebi: one workshop operation (büküm, işleme, galvaniz…) for a
 * list of parts. It is an ordinary department request (same endpoint, so
 * numbering, files and department approval are unchanged); submitting it
 * makes its fason job.
 */
export function FasonRequestFormModal({ onClose, onCreated }: FasonRequestFormModalProps) {
  const form = useForm<FasonRequestFormValues>({
    initialValues: { operation: null, rows: [emptyRow()], needed_date: '', note: '' },
    validate: {
      operation: (value) => (value ? null : 'İşlem seçin'),
      rows: {
        part: (value) => (value.trim() ? null : REQUIRED),
        quantity: (value) => (Number(value) >= 1 ? null : 'En az 1'),
        // Every fason part is for a job: its cost lands on that job.
        job_no: (value) => (value ? null : 'İş no gerekli'),
      },
    },
  });
  const [files, setFiles] = useState<File[]>([]);
  const queryClient = useQueryClient();
  const create = useCreateDepartmentRequest();

  const operations = useQuery(fasonOperationsQueryOptions());
  const operationData = useMemo(
    () => (operations.data ?? []).map((card) => ({ value: card.code, label: card.name })),
    [operations.data],
  );
  const jobOrders = useJobOrderOptions();
  const jobOrderData = useMemo(
    () =>
      (jobOrders.data ?? []).map((j) => ({ value: j.job_no, label: `${j.job_no} - ${j.title}` })),
    [jobOrders.data],
  );

  const save = async (values: FasonRequestFormValues) => {
    const card = operations.data?.find((c) => c.code === values.operation);
    if (!card) {
      form.setFieldError('operation', 'İşlem seçin');
      return;
    }
    if (values.rows.length === 0) {
      notify.error('En az bir parça ekleyin');
      return;
    }
    const { title, items } = buildFasonRequest(card, values);
    const upload = fasonUpload(files, values.rows);
    try {
      const created = await create.mutateAsync({
        title,
        description: values.note.trim() || null,
        priority: 'normal',
        needed_date: values.needed_date || null,
        items,
        files: upload.files,
        ...(Object.keys(upload.file_item_mapping).length > 0
          ? { file_item_mapping: upload.file_item_mapping }
          : {}),
      });
      void queryClient.invalidateQueries({ queryKey: fasonKeys.all });
      notify.success('Fason talebi oluşturuldu; departman onayına gönderildi');
      if (onCreated) onCreated(created.fason_job_id ?? null);
      else onClose();
    } catch (error) {
      notify.error(`Fason talebi oluşturulamadı: ${errorMessage(error)}`);
    }
  };

  const rows = form.values.rows;

  return (
    <FormModal
      opened
      onClose={onClose}
      title="Yeni Fason Talebi"
      subtitle="Departman onayından sonra planlama satınalmaya aktarır"
      icon="fas fa-people-carry"
      size="xl"
      submitting={create.isPending}
      submitLabel="Talep Oluştur"
      onSubmit={form.onSubmit(save)}
    >
      <Stack gap="md">
        <Select
          label="İşlem"
          description="Atölye fason işlemi (büküm, işleme, galvaniz…)"
          placeholder={operations.isError ? 'İşlemler yüklenemedi' : 'İşlem seçin'}
          withAsterisk
          searchable
          nothingFoundMessage="İşlem bulunamadı"
          data={operationData}
          {...form.getInputProps('operation')}
        />

        <ModalSection title="Parçalar" icon="fas fa-cubes">
          <Stack gap="xs">
            {rows.map((row, index) => (
              <Grid key={row.key} gap="xs" align="flex-end" data-testid="fason-part-row">
                <Grid.Col span={{ base: 12, sm: 4 }}>
                  <TextInput
                    size="xs"
                    label={index === 0 ? 'Parça No / Açıklama' : undefined}
                    aria-label={`Parça ${index + 1}`}
                    placeholder="ör. P-26, 304-02 kapak"
                    {...form.getInputProps(`rows.${index}.part`)}
                  />
                </Grid.Col>
                <Grid.Col span={{ base: 4, sm: 2 }}>
                  <NumberInput
                    size="xs"
                    label={index === 0 ? 'Adet' : undefined}
                    aria-label={`Adet ${index + 1}`}
                    min={1}
                    step={1}
                    allowDecimal={false}
                    {...form.getInputProps(`rows.${index}.quantity`)}
                  />
                </Grid.Col>
                <Grid.Col span={{ base: 6, sm: 4 }}>
                  <Select
                    size="xs"
                    label={index === 0 ? 'İş No' : undefined}
                    aria-label={`İş No ${index + 1}`}
                    placeholder="İş no seçin"
                    withAsterisk={index === 0}
                    searchable
                    limit={100}
                    data={jobOrderData}
                    {...form.getInputProps(`rows.${index}.job_no`)}
                  />
                </Grid.Col>
                <Grid.Col span={{ base: 2, sm: 2 }}>
                  <Group gap={4} wrap="nowrap">
                    {/* The part's own files: picked here, listed under the row. */}
                    <FileButton
                      multiple
                      onChange={(picked) => {
                        if (picked.length)
                          form.setFieldValue(`rows.${index}.files`, [...row.files, ...picked]);
                      }}
                    >
                      {(props) => (
                        <ActionIcon
                          {...props}
                          variant={row.files.length ? 'light' : 'default'}
                          aria-label={`Dosya ekle ${index + 1}`}
                          title="Bu parçaya dosya ekle"
                        >
                          <FaIcon icon="fas fa-paperclip" />
                        </ActionIcon>
                      )}
                    </FileButton>
                    {row.files.length ? (
                      <Badge size="sm" variant="light" aria-label={`Dosya sayısı ${index + 1}`}>
                        {row.files.length}
                      </Badge>
                    ) : null}
                    <ActionIcon
                      variant="default"
                      color="red"
                      aria-label={`Parçayı kaldır ${index + 1}`}
                      disabled={rows.length === 1}
                      onClick={() => form.removeListItem('rows', index)}
                    >
                      <FaIcon icon="fas fa-trash" />
                    </ActionIcon>
                  </Group>
                </Grid.Col>
                {row.files.length ? (
                  <Grid.Col span={12} data-testid={`fason-part-files-${index + 1}`}>
                    <Group gap={6}>
                      {row.files.map((file, fileIndex) => (
                        <Badge
                          key={`${file.name}-${fileIndex}`}
                          variant="outline"
                          size="sm"
                          leftSection={<FaIcon icon="fas fa-paperclip" />}
                          rightSection={
                            <ActionIcon
                              size="xs"
                              variant="transparent"
                              aria-label={`${file.name} dosyasını kaldır`}
                              onClick={() =>
                                form.setFieldValue(
                                  `rows.${index}.files`,
                                  row.files.filter((_, i) => i !== fileIndex),
                                )
                              }
                            >
                              <FaIcon icon="fas fa-times" />
                            </ActionIcon>
                          }
                        >
                          {file.name}
                        </Badge>
                      ))}
                    </Group>
                  </Grid.Col>
                ) : null}
              </Grid>
            ))}
            <Group>
              <Button
                size="xs"
                variant="default"
                leftSection={<FaIcon icon="fas fa-plus" />}
                onClick={() => {
                  const last = rows.at(-1);
                  // A new part usually belongs to the same job.
                  form.insertListItem('rows', { ...emptyRow(), job_no: last?.job_no ?? null });
                }}
              >
                Parça Ekle
              </Button>
            </Group>
          </Stack>
        </ModalSection>

        <Grid gap="md">
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput type="date" label="İhtiyaç Tarihi" {...form.getInputProps('needed_date')} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <FileDropInput
              multiple
              label="Genel Dosyalar"
              description="Tüm talep için (opsiyonel); parçaya ait dosyaları satırındaki ataşla ekleyin"
              leftSection={<FaIcon icon="fas fa-paperclip" />}
              value={files}
              onChange={(picked) => setFiles(picked ?? [])}
            />
          </Grid.Col>
        </Grid>
        <Textarea
          label="Not"
          description="Tedarikçiye / planlamaya iletilecek bilgiler (opsiyonel)"
          rows={3}
          {...form.getInputProps('note')}
        />
        {operations.isSuccess && operationData.length === 0 ? (
          <Text size="sm" c="red">
            Atölye fason işlemi tanımlı değil; planlamaya bildirin.
          </Text>
        ) : null}
      </Stack>
    </FormModal>
  );
}
