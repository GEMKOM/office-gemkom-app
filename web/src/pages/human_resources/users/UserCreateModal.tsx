import { Checkbox, Grid, Select, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useQueryClient } from '@tanstack/react-query';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { useState } from 'react';
import { z } from 'zod';
import { qk } from '@/api';
import {
  createUser,
  positionLabel,
  userErrorMessage,
  type OrgPosition,
} from '@/api/human_resources/users';
import { createWageRate } from '@/api/human_resources/wages';
import { FormModal, ModalSection, notify } from '@/ui';
import { EMAIL_RE, FIELD_HELP, REQUIRED, todayIso } from './userForm';

const schema = z.object({
  username: z.string().trim().min(1, REQUIRED),
  email: z
    .string()
    .refine((v) => v.trim() === '' || EMAIL_RE.test(v.trim()), 'Geçerli bir e-posta adresi girin'),
  first_name: z.string().trim().min(1, REQUIRED),
  last_name: z.string().trim().min(1, REQUIRED),
  birth_date: z.string(),
  wage_effective_from: z.string(),
  // min: 0 on the legacy number field.
  wage_base_monthly: z.string().refine((v) => v.trim() === '' || Number(v) >= 0, REQUIRED),
  position: z.string(),
  is_active: z.boolean(),
});

type Values = z.infer<typeof schema>;

/**
 * The legacy create payload: trimmed names, email/birth_date/position only
 * when filled in (position as a number: the serializer writes `position`).
 */
export function createUserPayload(values: Values): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    username: values.username.trim(),
    first_name: values.first_name.trim(),
    last_name: values.last_name.trim(),
    is_active: values.is_active !== false,
  };
  const email = values.email.trim();
  if (email) payload.email = email;
  const birthDate = values.birth_date.trim();
  if (birthDate) payload.birth_date = birthDate;
  const position = values.position.trim();
  if (position) payload.position = Number(position);
  return payload;
}

export interface UserCreateModalProps {
  positions: OrgPosition[];
  onClose: () => void;
  onSaved?: () => void;
}

/** Port of showCreateUserModal / createUser. */
export function UserCreateModal({ positions, onClose, onSaved }: UserCreateModalProps) {
  const queryClient = useQueryClient();
  const [submitting, setSubmitting] = useState(false);
  const form = useForm<Values>({
    initialValues: {
      username: '',
      email: '',
      first_name: '',
      last_name: '',
      birth_date: '',
      wage_effective_from: todayIso(),
      wage_base_monthly: '',
      position: '',
      is_active: true,
    },
    validate: zod4Resolver(schema),
  });

  const save = async (values: Values) => {
    setSubmitting(true);
    try {
      const created = (await createUser(createUserPayload(values))) as
        { id?: number; user?: { id?: number } } | null | undefined;
      const userId = created?.id ?? created?.user?.id ?? null;

      // Wage, best effort: a failure only warns.
      const raw = values.wage_base_monthly.trim();
      const amount = raw === '' ? null : Number(raw);
      if (
        userId &&
        values.wage_effective_from &&
        amount !== null &&
        Number.isFinite(amount) &&
        amount > 0
      ) {
        try {
          await createWageRate({
            user: userId,
            effective_from: values.wage_effective_from,
            base_monthly: amount.toFixed(4),
          });
        } catch (error) {
          notify.warning(
            `Ücret eklenemedi: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      notify.success('Çalışan başarıyla oluşturuldu');
      void queryClient.invalidateQueries({ queryKey: qk.users.all });
      onSaved?.();
      onClose();
    } catch (error) {
      notify.error(userErrorMessage(error, 'Çalışan oluşturulamadı'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title="Yeni Çalışan Oluştur"
      icon="fas fa-plus-circle"
      size="lg"
      submitting={submitting}
      onSubmit={form.onSubmit(save)}
    >
      <ModalSection title="Temel Bilgiler" icon="fas fa-info-circle">
        <Grid gap="sm">
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput
              label="Kullanıcı Adı"
              withAsterisk
              description={FIELD_HELP.username}
              {...form.getInputProps('username')}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput label="E-posta" type="email" {...form.getInputProps('email')} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput
              label="Ad"
              withAsterisk
              description={FIELD_HELP.first_name}
              {...form.getInputProps('first_name')}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput
              label="Soyad"
              withAsterisk
              description={FIELD_HELP.last_name}
              {...form.getInputProps('last_name')}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput label="Doğum Tarihi" type="date" {...form.getInputProps('birth_date')} />
          </Grid.Col>
        </Grid>
      </ModalSection>

      <ModalSection title="Maaş" icon="fas fa-money-bill-wave">
        <Grid gap="sm">
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput
              label="Geçerlilik Tarihi"
              type="date"
              {...form.getInputProps('wage_effective_from')}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput
              label="Aylık Ücret"
              type="number"
              step={0.01}
              min={0}
              {...form.getInputProps('wage_base_monthly')}
            />
          </Grid.Col>
        </Grid>
      </ModalSection>

      <ModalSection title="İş Bilgileri" icon="fas fa-briefcase">
        <Grid gap="sm">
          <Grid.Col span={12}>
            <Select
              label="Pozisyon"
              placeholder="Pozisyon yok"
              searchable
              clearable
              data={positions.map((p) => ({ value: String(p.id), label: positionLabel(p) }))}
              value={form.values.position || null}
              onChange={(value) => form.setFieldValue('position', value ?? '')}
            />
          </Grid.Col>
          <Grid.Col span={12}>
            <Checkbox label="Aktif" {...form.getInputProps('is_active', { type: 'checkbox' })} />
          </Grid.Col>
        </Grid>
      </ModalSection>
    </FormModal>
  );
}
