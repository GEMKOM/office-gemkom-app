import { Button, Grid, Group, Modal, Stack, Table, Text, TextInput, Textarea } from '@mantine/core';
import { useForm } from '@mantine/form';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { z } from 'zod';
import {
  createLinearSession,
  type LinearConfirmResult,
  type LinearCuttingSession,
  type LinearStockBar,
} from '@/api/manufacturing/linearCuttingSessions';
import {
  FaIcon,
  FormModal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalSection,
  modalClassNames,
  notify,
} from '@/ui';
import { castNumber } from './partRows';

const createSchema = z.object({
  title: z.string().refine((v) => v.trim() !== '', 'Başlık zorunludur.'),
  stock_length_mm: z.string(),
  kerf_mm: z.string(),
  notes: z.string(),
});

type CreateValues = z.infer<typeof createSchema>;

/** Port of the "Yeni Kesim Planı" EditModal. Mount it when it should open. */
export function CreatePlanModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (session: LinearCuttingSession) => void;
}) {
  const form = useForm<CreateValues>({
    initialValues: { title: '', stock_length_mm: '6000', kerf_mm: '3', notes: '' },
    validate: zod4Resolver(createSchema),
  });

  const save = async (values: CreateValues) => {
    try {
      const created = await createLinearSession({
        title: values.title.trim(),
        stock_length_mm: castNumber(values.stock_length_mm, 6000),
        kerf_mm: castNumber(values.kerf_mm, 3),
        notes: values.notes || '',
        parts_data: [],
      });
      notify.success(`${created.key} oluşturuldu.`);
      onCreated(created);
      onClose();
    } catch (error) {
      notify.error(error);
    }
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title="Yeni Kesim Planı"
      icon="fas fa-plus-circle"
      size="lg"
      submitLabel="Plan Oluştur"
      submitting={form.submitting}
      onSubmit={form.onSubmit(save)}
    >
      <ModalSection title="Plan Bilgileri">
        <Grid gap="sm">
          <Grid.Col span={12}>
            <TextInput
              label="Başlık"
              placeholder="Örn: Bina Çelik Çerçeve - Blok A"
              withAsterisk
              {...form.getInputProps('title')}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput
              label="Stok Boyu (mm)"
              type="number"
              min={1}
              {...form.getInputProps('stock_length_mm')}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput label="Kerf (mm)" type="number" min={0} {...form.getInputProps('kerf_mm')} />
          </Grid.Col>
          <Grid.Col span={12}>
            <Textarea
              label="Not"
              placeholder="Opsiyonel notlar…"
              rows={2}
              {...form.getInputProps('notes')}
            />
          </Grid.Col>
        </Grid>
      </ModalSection>
    </FormModal>
  );
}

/** "Onay Sonucu": the bar tasks and the planning request a confirm created. */
export function ConfirmResultModal({
  result,
  onClose,
}: {
  result: LinearConfirmResult | null;
  onClose: () => void;
}) {
  const tasks = Array.isArray(result?.created_tasks) ? result.created_tasks : [];
  const prNo = result?.planning_request_number || '';
  return (
    <Modal
      opened={result !== null}
      onClose={onClose}
      size="lg"
      withCloseButton={false}
      classNames={modalClassNames}
    >
      <ModalHeader title="Onay Sonucu" icon="fas fa-check-circle" />
      <ModalBody>
        <ModalSection title="Oluşturulan Kayıtlar">
          <Grid gap="md">
            <Grid.Col span={{ base: 12, md: 6 }}>
              <Text fw={600} mb={6}>
                <FaIcon icon="fas fa-tasks" style={{ marginRight: 6 }} />
                Görevler
              </Text>
              {tasks.length ? (
                <Stack gap={4}>
                  {tasks.map((key) => (
                    <Group key={key} justify="space-between">
                      <Text fw={600}>{key}</Text>
                      <Button
                        component="a"
                        size="xs"
                        variant="outline"
                        target="_blank"
                        rel="noopener"
                        href={`/planning/linear-cutting/cuts/?task=${encodeURIComponent(key)}`}
                      >
                        Aç
                      </Button>
                    </Group>
                  ))}
                </Stack>
              ) : (
                <Text c="dimmed">—</Text>
              )}
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 6 }}>
              <Text fw={600} mb={6}>
                <FaIcon icon="fas fa-clipboard-list" style={{ marginRight: 6 }} />
                Planlama Talebi
              </Text>
              {prNo ? (
                <Group justify="space-between">
                  <Text fw={600}>{prNo}</Text>
                  <Button
                    component="a"
                    size="xs"
                    variant="outline"
                    target="_blank"
                    rel="noopener"
                    href={`/planning/department-requests/?talep=${encodeURIComponent(prNo)}`}
                  >
                    Aç
                  </Button>
                </Group>
              ) : (
                <Text c="dimmed">—</Text>
              )}
              <Text c="dimmed" size="sm" mt={8}>
                Not: Linkler yeni sekmede açılır.
              </Text>
            </Grid.Col>
          </Grid>
        </ModalSection>
      </ModalBody>
      <ModalFooter>
        <Button variant="default" onClick={onClose}>
          Kapat
        </Button>
      </ModalFooter>
    </Modal>
  );
}

/** "Stok Barlar": the bars the stock entry declared for the plan. */
export function StockBarsModal({
  bars,
  opened,
  onClose,
}: {
  bars: LinearStockBar[];
  opened: boolean;
  onClose: () => void;
}) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size="lg"
      withCloseButton={false}
      classNames={modalClassNames}
    >
      <ModalHeader title="Stok Barlar" icon="fas fa-bars-staggered" />
      <ModalBody>
        <ModalSection title="Stok Bar Listesi">
          {bars.length ? (
            <Table.ScrollContainer minWidth={560}>
              <Table striped highlightOnHover fz="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>#</Table.Th>
                    <Table.Th>Malzeme Kodu</Table.Th>
                    <Table.Th>Malzeme</Table.Th>
                    <Table.Th ta="right">Boy (mm)</Table.Th>
                    <Table.Th ta="right">Adet</Table.Th>
                    <Table.Th>Birim</Table.Th>
                    <Table.Th>Beyan Eden</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {bars.map((bar, i) => (
                    <Table.Tr key={i}>
                      <Table.Td>{i + 1}</Table.Td>
                      <Table.Td>{bar.item_code || '-'}</Table.Td>
                      <Table.Td>{bar.item_name || '-'}</Table.Td>
                      <Table.Td ta="right">{bar.length_mm ?? '-'}</Table.Td>
                      <Table.Td ta="right">{bar.quantity ?? '-'}</Table.Td>
                      <Table.Td>{bar.item_unit || '-'}</Table.Td>
                      <Table.Td>{bar.declared_by_username || '-'}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          ) : (
            <Text c="dimmed" py="xs">
              Bu planda tanımlı stok bar bulunmuyor.
            </Text>
          )}
        </ModalSection>
      </ModalBody>
      <ModalFooter>
        <Button variant="default" onClick={onClose}>
          Kapat
        </Button>
      </ModalFooter>
    </Modal>
  );
}
