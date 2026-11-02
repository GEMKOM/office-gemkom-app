import {
  ActionIcon,
  Button,
  Center,
  Grid,
  Loader,
  NumberInput,
  Stack,
  TextInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import {
  qcCostLinesQueryOptions,
  useSubmitQcCostLines,
  type QcCostLine,
  type QcCostLineInput,
} from '@/api/quality-control/costLines';
import { FaIcon, FormModal, ModalSection, notify } from '@/ui';

export interface LineDraft {
  description: string;
  amount_eur: string | number;
  date: string;
  notes: string;
}

const emptyLine = (): LineDraft => ({ description: '', amount_eur: '0.00', date: '', notes: '' });

function toDraft(line: QcCostLine): LineDraft {
  return {
    description: line.description ?? '',
    amount_eur: line.amount_eur != null ? String(line.amount_eur) : '0.00',
    date: line.date ? line.date.slice(0, 10) : '',
    notes: line.notes ?? '',
  };
}

/** Legacy saveLines: lines without a description are dropped; empty date / notes are left out. */
export function linesToSubmit(lines: LineDraft[]): QcCostLineInput[] {
  return lines
    .map((line) => ({
      description: line.description.trim(),
      amount_eur:
        line.amount_eur !== '' && line.amount_eur != null ? String(line.amount_eur) : '0.00',
      date: line.date.trim() || undefined,
      notes: line.notes.trim() || undefined,
    }))
    .filter((line) => line.description !== '');
}

export interface QcCostLinesModalProps {
  jobNo: string;
  onClose: () => void;
}

/** The "Satırları Aç" modal of quality-control/cost-lines: edit and replace a job order's QC cost lines. */
export function QcCostLinesModal({ jobNo, onClose }: QcCostLinesModalProps) {
  const lines = useQuery(qcCostLinesQueryOptions(jobNo));
  const submit = useSubmitQcCostLines();
  const form = useForm<{ lines: LineDraft[] }>({ initialValues: { lines: [] } });
  const loading = lines.isPending;

  const { initialize } = form;
  useEffect(() => {
    if (lines.isSuccess) {
      initialize({ lines: lines.data.length ? lines.data.map(toDraft) : [emptyLine()] });
    } else if (lines.isError) {
      notify.error(lines.error, { fallback: 'Satırlar yüklenemedi' });
      initialize({ lines: [emptyLine()] });
    }
    // initialize only runs once per form; that is the point.
  }, [lines.isSuccess, lines.isError, lines.data, lines.error, initialize]);

  const drafts = form.values.lines;
  const total = drafts.reduce(
    (sum, line) => sum + (Number.parseFloat(String(line.amount_eur)) || 0),
    0,
  );

  const removeLine = (index: number) => {
    if (drafts.length === 1) form.setFieldValue('lines', [emptyLine()]);
    else form.removeListItem('lines', index);
  };

  const save = async (values: { lines: LineDraft[] }) => {
    if (loading) return;
    try {
      await submit.mutateAsync({ jobNo, lines: linesToSubmit(values.lines) });
      notify.success('Satırlar kaydedildi.');
      onClose();
    } catch (error) {
      console.error(error);
      notify.error(error, { fallback: 'Kaydetme başarısız' });
    }
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title={`KK Maliyet Satırları — ${jobNo}`}
      icon="fas fa-clipboard-check"
      size="xl"
      submitting={submit.isPending}
      submitDisabled={loading}
      onSubmit={form.onSubmit(save)}
      footerActions={
        <Button
          variant="default"
          mr="auto"
          disabled={loading}
          leftSection={<FaIcon icon="fas fa-plus" />}
          onClick={() => form.insertListItem('lines', emptyLine())}
        >
          Satır Ekle
        </Button>
      }
    >
      {loading ? (
        <Center py="xl">
          <Loader size="sm" />
        </Center>
      ) : (
        <Stack gap="xs">
          <ModalSection
            title={`${drafts.length} satır, Toplam: €${total.toFixed(2)}`}
            icon="fas fa-calculator"
          />
          {drafts.map((_, index) => (
            <ModalSection key={index} title={`Satır ${index + 1}`} icon="fas fa-list">
              <Grid gap="sm" align="flex-end">
                <Grid.Col span={{ base: 12, sm: 4 }}>
                  <TextInput
                    label="Açıklama"
                    placeholder="Açıklama"
                    {...form.getInputProps(`lines.${index}.description`)}
                  />
                </Grid.Col>
                <Grid.Col span={{ base: 6, sm: 2 }}>
                  <NumberInput
                    label="Tutar (EUR)"
                    min={0}
                    step={0.01}
                    decimalScale={2}
                    hideControls
                    {...form.getInputProps(`lines.${index}.amount_eur`)}
                  />
                </Grid.Col>
                <Grid.Col span={{ base: 6, sm: 3 }}>
                  <TextInput
                    label="Tarih"
                    type="date"
                    {...form.getInputProps(`lines.${index}.date`)}
                  />
                </Grid.Col>
                <Grid.Col span={{ base: 10, sm: 2 }}>
                  <TextInput
                    label="Notlar"
                    placeholder="Notlar"
                    {...form.getInputProps(`lines.${index}.notes`)}
                  />
                </Grid.Col>
                <Grid.Col span={{ base: 2, sm: 1 }}>
                  <ActionIcon
                    variant="default"
                    color="red"
                    size="lg"
                    title="Satırı sil"
                    aria-label={`Satır ${index + 1} sil`}
                    onClick={() => removeLine(index)}
                  >
                    <FaIcon icon="fas fa-trash" />
                  </ActionIcon>
                </Grid.Col>
              </Grid>
            </ModalSection>
          ))}
        </Stack>
      )}
    </FormModal>
  );
}
