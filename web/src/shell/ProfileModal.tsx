import { getUser } from '@legacy/authService.js';
import { Button, Modal, Stack, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { useState } from 'react';
import { apiFetch } from '@/api/client';
import { useAuth } from '@/auth/AuthProvider';

/** "Profili Düzenle": the same PUT /users/me/ the legacy navbar modal sends. */
export function ProfileModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const form = useForm({
    initialValues: {
      first_name: user.first_name ?? '',
      last_name: user.last_name ?? '',
      email: user.email ?? '',
    },
    validate: {
      first_name: (v) => (v.trim() ? null : 'Ad gerekli'),
      last_name: (v) => (v.trim() ? null : 'Soyad gerekli'),
      email: (v) => (/^\S+@\S+$/.test(v) ? null : 'Geçerli bir e-posta girin'),
    },
  });

  const submit = form.onSubmit(async (values) => {
    setSaving(true);
    try {
      await apiFetch('/users/me/', { method: 'PUT', body: values });
      const fresh = await getUser();
      if (fresh) localStorage.setItem('user', JSON.stringify(fresh));
      // The name is shown by both legacy and React chrome; a reload refreshes both.
      window.location.reload();
    } catch (error) {
      notifications.show({ color: 'red', message: (error as Error).message || 'Güncelleme başarısız.' });
      setSaving(false);
    }
  });

  return (
    <Modal opened={opened} onClose={onClose} title="Kullanıcı Bilgileri" centered>
      <form onSubmit={submit}>
        <Stack>
          <TextInput label="Ad" required {...form.getInputProps('first_name')} />
          <TextInput label="Soyad" required {...form.getInputProps('last_name')} />
          <TextInput label="Email" type="email" required {...form.getInputProps('email')} />
          <Button type="submit" loading={saving} fullWidth>
            Kaydet
          </Button>
        </Stack>
      </form>
    </Modal>
  );
}
