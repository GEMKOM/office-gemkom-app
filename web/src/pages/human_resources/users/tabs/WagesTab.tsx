import { ActionIcon, Button, Group, Stack, Table, Text, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { useMemo, useState } from 'react';
import { z } from 'zod';
import type { HrUser } from '@/api/human_resources/users';
import {
  createWageRate,
  deleteWageRate,
  formatWage,
  userWagesKey,
  userWagesQueryOptions,
} from '@/api/human_resources/wages';
import { formatDate } from '@/lib/format';
import { confirm, FaIcon, FormModal, ModalSection, notify } from '@/ui';
import { REQUIRED, todayIso, userDisplayName } from '../userForm';

const time = (v: string | null | undefined) => (v ? new Date(v).getTime() || 0 : 0);

/** Port of renderWages: the user's wage history with add and delete. */
export function WagesTab({ user }: { user: HrUser }) {
  const queryClient = useQueryClient();
  const wages = useQuery(userWagesQueryOptions(user.id));
  const [adding, setAdding] = useState(false);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: userWagesKey(user.id) });

  // Newest first by created_at, else effective_from.
  const sorted = useMemo(
    () =>
      (wages.data ?? [])
        .slice()
        .sort(
          (a, b) => time(b.created_at || b.effective_from) - time(a.created_at || a.effective_from),
        ),
    [wages.data],
  );

  const remove = async (id: number) => {
    const ok = await confirm({
      title: 'Onay',
      icon: 'fas fa-exclamation-triangle',
      message: 'Bu ücret kaydını silmek istediğinize emin misiniz?',
      confirmLabel: 'Evet',
      cancelLabel: 'İptal',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteWageRate(id);
      notify.success('Ücret kaydı silindi');
      refresh();
    } catch (error) {
      notify.error(error, { fallback: 'Ücret kaydı silinemedi' });
    }
  };

  let body;
  if (wages.isPending) {
    body = (
      <Text size="sm" c="dimmed">
        <FaIcon icon="fas fa-spinner fa-spin" /> Yükleniyor...
      </Text>
    );
  } else if (wages.isError) {
    body = (
      <Text size="sm" c="red">
        Ücretler yüklenemedi: {wages.error.message}
      </Text>
    );
  } else {
    body = (
      <>
        <Group justify="space-between">
          <Text fw={600} size="sm">
            Ücret Geçmişi
          </Text>
          <Button
            size="xs"
            variant="default"
            leftSection={<FaIcon icon="fas fa-plus" />}
            onClick={() => setAdding(true)}
          >
            Yeni Ücret
          </Button>
        </Group>
        {sorted.length ? (
          <Table highlightOnHover verticalSpacing="xs">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Tarih</Table.Th>
                <Table.Th>Ücret</Table.Th>
                <Table.Th ta="right">Sil</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {sorted.map((r) => {
                const amount = r.base_monthly ?? r.base_hourly ?? null;
                return (
                  <Table.Tr key={r.id}>
                    <Table.Td>{r.effective_from ? formatDate(r.effective_from) : '-'}</Table.Td>
                    <Table.Td>
                      {amount !== null && amount !== ''
                        ? formatWage(Number(amount), r.currency || 'TRY')
                        : '-'}
                    </Table.Td>
                    <Table.Td ta="right">
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        aria-label="Sil"
                        onClick={() => void remove(r.id)}
                      >
                        <FaIcon icon="fas fa-trash" />
                      </ActionIcon>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        ) : (
          <Text size="sm" c="dimmed">
            Ücret kaydı bulunamadı.
          </Text>
        )}
      </>
    );
  }

  return (
    <Stack gap="sm">
      <Group justify="space-between">
        <Text fw={600}>Ücret Geçmişi</Text>
        <Button
          size="xs"
          variant="default"
          leftSection={<FaIcon icon="fas fa-sync-alt" />}
          onClick={refresh}
        >
          Yenile
        </Button>
      </Group>
      <Text size="xs" c="dimmed">
        Bu sekme sadece görüntüleme amaçlıdır.
      </Text>
      {body}
      {adding ? (
        <WageFormModal user={user} onClose={() => setAdding(false)} onSaved={refresh} />
      ) : null}
    </Stack>
  );
}

const wageSchema = z.object({
  effective_from: z.string().min(1, 'Geçerlilik tarihi gereklidir'),
  base_monthly: z
    .string()
    .min(1, REQUIRED)
    .refine(
      (v) => Number.isFinite(Number(v)) && Number(v) > 0,
      "Aylık ücret 0'dan büyük olmalıdır",
    ),
});
type WageValues = z.infer<typeof wageSchema>;

function WageFormModal({
  user,
  onClose,
  onSaved,
}: {
  user: HrUser;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const form = useForm<WageValues>({
    initialValues: { effective_from: todayIso(), base_monthly: '' },
    validate: zod4Resolver(wageSchema),
  });

  const save = async (values: WageValues) => {
    setSubmitting(true);
    try {
      await createWageRate({
        user: user.id,
        effective_from: values.effective_from,
        base_monthly: Number(values.base_monthly).toFixed(4),
      });
      notify.success('Ücret oranı başarıyla kaydedildi');
      onSaved();
      onClose();
    } catch (error) {
      notify.error(error, { fallback: 'Ücret kaydedilemedi' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title="Yeni Ücret Ekle"
      icon="fas fa-money-bill-wave"
      submitLabel="Ücret Ekle"
      submitting={submitting}
      onSubmit={form.onSubmit(save)}
    >
      <ModalSection title="Yeni Ücret" icon="fas fa-plus-circle">
        <Stack gap="sm">
          <TextInput label="Kullanıcı" value={userDisplayName(user)} readOnly />
          <Group grow align="flex-start">
            <TextInput
              label="Geçerlilik Tarihi"
              type="date"
              withAsterisk
              {...form.getInputProps('effective_from')}
            />
            <TextInput
              label="Aylık Ücret"
              type="number"
              step={0.01}
              min={0}
              withAsterisk
              {...form.getInputProps('base_monthly')}
            />
          </Group>
        </Stack>
      </ModalSection>
    </FormModal>
  );
}
