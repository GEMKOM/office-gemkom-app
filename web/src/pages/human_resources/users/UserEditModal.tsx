import { Button, Checkbox, Grid, Modal, Select, Tabs, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { useState } from 'react';
import { z } from 'zod';
import { qk } from '@/api';
import {
  activeShiftRulesQueryOptions,
  assignShiftRuleToUser,
  patchUser,
  userErrorMessage,
  type HrUser,
  type OrgPosition,
} from '@/api/human_resources/users';
import {
  FaIcon,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalSection,
  modalClassNames,
  notify,
} from '@/ui';
import { AttendanceTab } from './tabs/AttendanceTab';
import { LeaveTab } from './tabs/LeaveTab';
import { PermissionsTab } from './tabs/PermissionsTab';
import { WagesTab } from './tabs/WagesTab';
import { EMAIL_RE, FIELD_HELP, REQUIRED, userDisplayName } from './userForm';

const schema = z.object({
  username: z.string().min(1, REQUIRED),
  email: z.string().refine((v) => v === '' || EMAIL_RE.test(v), 'Geçerli bir e-posta adresi girin'),
  first_name: z.string().min(1, REQUIRED),
  last_name: z.string().min(1, REQUIRED),
  tc_kimlik_no: z.string(),
  gender: z.string(),
  sigorta_yuzde_grubu: z.string(),
  birth_date: z.string(),
  shift_rule_id: z.string(),
  is_active: z.boolean(),
});

type Values = z.infer<typeof schema>;

function initialValues(user: HrUser): Values {
  const shift =
    user.shift_rule_id ??
    (typeof user.shift_rule === 'object' ? user.shift_rule?.id : user.shift_rule) ??
    '';
  return {
    username: user.username || '',
    email: user.email || '',
    first_name: user.first_name || '',
    last_name: user.last_name || '',
    tc_kimlik_no: user.tc_kimlik_no || '',
    gender: user.gender ? String(user.gender) : '',
    sigorta_yuzde_grubu: user.sigorta_yuzde_grubu ? String(user.sigorta_yuzde_grubu) : '',
    birth_date: user.birth_date || '',
    shift_rule_id: shift ? String(shift) : '',
    is_active: user.is_active !== false,
  };
}

/** The legacy update PATCH: blanks become null, unknown choices too. */
export function updateUserPayload(values: Values): Record<string, unknown> {
  const gender = values.gender.trim();
  const sigorta = values.sigorta_yuzde_grubu.trim();
  return {
    username: values.username,
    email: values.email,
    first_name: values.first_name,
    last_name: values.last_name,
    tc_kimlik_no: values.tc_kimlik_no.trim() || null,
    gender: gender === 'M' || gender === 'F' ? gender : null,
    sigorta_yuzde_grubu: sigorta === 'normal' || sigorta === 'emekli' ? sigorta : null,
    birth_date: values.birth_date.trim() || null,
    is_active: values.is_active,
  };
}

const FORM_ID = 'hr-user-edit-form';

type TabKey = 'info' | 'wages' | 'leave' | 'attendance' | 'permissions';

export interface UserEditModalProps {
  user: HrUser;
  positions: OrgPosition[];
  onClose: () => void;
}

/**
 * Port of window.editUser + ensureUserEditTabs: the employee form plus the
 * Maaşlar, İzinler, PDKS Özeti and Yetkiler & Gruplar tabs. A tab loads the
 * first time it is opened; the footer Kaydet saves the Bilgiler form and is
 * hidden on İzinler, which saves itself.
 */
export function UserEditModal({ user, positions, onClose }: UserEditModalProps) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TabKey>('info');
  const [visited, setVisited] = useState<Set<TabKey>>(() => new Set(['info']));
  const [submitting, setSubmitting] = useState(false);
  const shiftRules = useQuery(activeShiftRulesQueryOptions());
  const form = useForm<Values>({
    initialValues: initialValues(user),
    validate: zod4Resolver(schema),
  });

  const openTab = (next: string | null) => {
    if (!next) return;
    const key = next as TabKey;
    setTab(key);
    setVisited((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
  };

  const save = async (values: Values) => {
    setSubmitting(true);
    try {
      await patchUser(user.id, updateUserPayload(values));
      const shiftRuleId = values.shift_rule_id.trim() ? Number(values.shift_rule_id) : null;
      try {
        await assignShiftRuleToUser(user.id, shiftRuleId);
      } catch (error) {
        notify.warning(
          `Vardiya kuralı atanamadı: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      void queryClient.invalidateQueries({ queryKey: qk.users.all });
      onClose();
    } catch (error) {
      notify.error(userErrorMessage(error, 'Çalışan güncellenemedi'));
    } finally {
      setSubmitting(false);
    }
  };

  const shiftOptions = (shiftRules.data ?? []).map((r) => ({
    value: String(r.id),
    label: `${r.name} (${String(r.expected_start || '').slice(0, 5)}-${String(r.expected_end || '').slice(0, 5)})`,
  }));

  const optionalSelect = (field: 'gender' | 'sigorta_yuzde_grubu' | 'shift_rule_id') => ({
    value: form.values[field] || null,
    onChange: (value: string | null) => form.setFieldValue(field, value ?? ''),
    clearable: true,
  });

  return (
    <Modal
      opened
      onClose={() => {
        if (!submitting) onClose();
      }}
      size={1140}
      withCloseButton={false}
      classNames={modalClassNames}
    >
      <ModalHeader title="Çalışan Düzenle" subtitle={userDisplayName(user)} icon="fas fa-edit" />
      <ModalBody>
        <Tabs value={tab} onChange={openTab} keepMounted>
          <Tabs.List mb="md">
            <Tabs.Tab value="info" leftSection={<FaIcon icon="fas fa-user" />}>
              Bilgiler
            </Tabs.Tab>
            <Tabs.Tab value="wages" leftSection={<FaIcon icon="fas fa-money-bill-wave" />}>
              Maaşlar
            </Tabs.Tab>
            <Tabs.Tab value="leave" leftSection={<FaIcon icon="fas fa-calendar-check" />}>
              İzinler
            </Tabs.Tab>
            <Tabs.Tab value="attendance" leftSection={<FaIcon icon="fas fa-calendar-alt" />}>
              PDKS Özeti
            </Tabs.Tab>
            <Tabs.Tab value="permissions" leftSection={<FaIcon icon="fas fa-user-shield" />}>
              Yetkiler &amp; Gruplar
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="info">
            {/* Only this panel is the form: the other tabs open modals of their own,
                  whose submit events would bubble here through the React tree. */}
            <form id={FORM_ID} noValidate onSubmit={form.onSubmit(save, () => openTab('info'))}>
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
                    <TextInput label="TC Kimlik No" {...form.getInputProps('tc_kimlik_no')} />
                  </Grid.Col>
                  <Grid.Col span={{ base: 6, sm: 3 }}>
                    <Select
                      label="Cinsiyet"
                      placeholder="-"
                      data={[
                        { value: 'M', label: 'Erkek' },
                        { value: 'F', label: 'Kadın' },
                      ]}
                      {...optionalSelect('gender')}
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 6, sm: 3 }}>
                    <Select
                      label="Sigorta Yüzde Grubu"
                      placeholder="-"
                      data={[
                        { value: 'normal', label: 'Normal' },
                        { value: 'emekli', label: 'Emekli' },
                      ]}
                      {...optionalSelect('sigorta_yuzde_grubu')}
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, sm: 6 }}>
                    <TextInput
                      label="Doğum Tarihi"
                      type="date"
                      {...form.getInputProps('birth_date')}
                    />
                  </Grid.Col>
                </Grid>
              </ModalSection>
              <ModalSection title="İş Bilgileri" icon="fas fa-briefcase">
                <Grid gap="sm">
                  <Grid.Col span={12}>
                    <Select
                      label="Vardiya Kuralı"
                      placeholder="Varsayılan (otomatik)"
                      searchable
                      data={shiftOptions}
                      {...optionalSelect('shift_rule_id')}
                    />
                  </Grid.Col>
                  <Grid.Col span={12}>
                    <Checkbox
                      label="Aktif"
                      {...form.getInputProps('is_active', { type: 'checkbox' })}
                    />
                  </Grid.Col>
                </Grid>
              </ModalSection>
            </form>
          </Tabs.Panel>

          <Tabs.Panel value="wages">
            {visited.has('wages') ? <WagesTab user={user} /> : null}
          </Tabs.Panel>
          <Tabs.Panel value="leave">
            {visited.has('leave') ? <LeaveTab userId={user.id} /> : null}
          </Tabs.Panel>
          <Tabs.Panel value="attendance">
            {visited.has('attendance') ? <AttendanceTab user={user} /> : null}
          </Tabs.Panel>
          <Tabs.Panel value="permissions">
            {visited.has('permissions') ? (
              <PermissionsTab userId={user.id} positions={positions} />
            ) : null}
          </Tabs.Panel>
        </Tabs>
      </ModalBody>
      <ModalFooter>
        <Button
          variant="default"
          onClick={onClose}
          disabled={submitting}
          leftSection={<FaIcon icon="fas fa-times" />}
        >
          İptal
        </Button>
        {tab !== 'leave' ? (
          <Button
            type="submit"
            form={FORM_ID}
            loading={submitting}
            leftSection={<FaIcon icon="fas fa-save" />}
          >
            Kaydet
          </Button>
        ) : null}
      </ModalFooter>
    </Modal>
  );
}
