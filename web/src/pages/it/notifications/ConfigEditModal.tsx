import {
  Checkbox,
  Group,
  MultiSelect,
  Stack,
  Text,
  TextInput,
  Textarea,
  UnstyledButton,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useMemo, useRef } from 'react';
import {
  notificationConfigErrorMessage,
  useUpdateNotificationConfig,
  type NotificationConfig,
  type NotificationConfigPatch,
} from '@/api/it/notificationConfigs';
import type { UserOption } from '@/api/reference/users';
import { FaIcon, FormModal, ModalSection, notify } from '@/ui';
import { configUserGroupToSelectedId, normalizeConfigGroup, type Option } from './configRows';
import classes from './NotificationConfigsPage.module.css';

interface FormValues {
  title_template: string;
  body_template: string;
  link_template: string;
  default_send_email: boolean;
  default_send_in_app: boolean;
  enabled: boolean;
  user_ids: string[];
  groups: string[];
  user_groups: string[];
}

type TemplateField = 'title_template' | 'body_template' | 'link_template';

function userOptionLabel(user: {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
}) {
  const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim();
  return fullName || user.username || `#${user.id}`;
}

export interface ConfigEditModalProps {
  config: NotificationConfig;
  users: readonly UserOption[];
  /** Department choices from the config endpoint (legacy groupChoices). */
  groupChoices: readonly Option[];
  /** /organization/groups/ by name, used when the config sends no choices. */
  liveGroups: readonly Option[];
  /** /organization/groups/ by id. */
  orgUserGroups: readonly Option[];
  onClose: () => void;
}

/** Port of showEditConfigModal. Mount it to open it. */
export function ConfigEditModal({
  config,
  users,
  groupChoices,
  liveGroups,
  orgUserGroups,
  onClose,
}: ConfigEditModalProps) {
  const routable = Boolean(config.is_routable);
  const vars = config.available_vars ?? [];
  const varsHelp =
    vars.length > 0
      ? `Kullanılabilir değişkenler: ${vars.map((v) => `{${v}}`).join(', ')}`
      : undefined;

  // ---- routing options ----
  const userData = useMemo(() => {
    const options = users.map((u) => ({ value: String(u.id), label: userOptionLabel(u) }));
    // Assigned users missing from the active list stay selected (legacy dropped them on save).
    for (const u of config.users ?? []) {
      if (!options.some((o) => o.value === String(u.id))) {
        options.push({ value: String(u.id), label: u.full_name || userOptionLabel(u) });
      }
    }
    return options;
  }, [users, config.users]);

  const groupData = useMemo(() => {
    const options = groupChoices.length > 0 ? [...groupChoices] : [...liveGroups];
    for (const g of config.groups ?? []) {
      const n = normalizeConfigGroup(g);
      if (n && !options.some((o) => o.value === n.name))
        options.push({ value: n.name, label: n.display });
    }
    return options;
  }, [groupChoices, liveGroups, config.groups]);

  const { userGroupData, currentUserGroupIds } = useMemo(() => {
    const nameToId = new Map(orgUserGroups.map((o) => [o.label, o.value]));
    const ids = (config.user_groups ?? [])
      .map((ug) => configUserGroupToSelectedId(ug, nameToId))
      .filter((id): id is string => Boolean(id));
    const known = new Set(orgUserGroups.map((o) => o.value));
    const merged = [...orgUserGroups];
    for (const id of ids) {
      if (!known.has(id)) merged.push({ value: id, label: `#${id} (listeden eksik)` });
    }
    return { userGroupData: merged, currentUserGroupIds: ids };
  }, [orgUserGroups, config.user_groups]);

  const form = useForm<FormValues>({
    initialValues: {
      title_template: config.title_template || '',
      body_template: config.body_template || '',
      link_template: config.link_template || '',
      default_send_email:
        config.default_send_email !== undefined ? config.default_send_email : true,
      default_send_in_app:
        config.default_send_in_app !== undefined ? config.default_send_in_app : true,
      enabled: config.enabled || false,
      user_ids: (config.users ?? []).map((u) => String(u.id)),
      groups: (config.groups ?? [])
        .map(normalizeConfigGroup)
        .filter((g): g is { name: string; display: string } => g !== null)
        .map((g) => g.name),
      user_groups: currentUserGroupIds,
    },
  });

  // ---- variable chips: insert {var} at the caret ----
  const inputs = useRef<
    Partial<Record<TemplateField, HTMLInputElement | HTMLTextAreaElement | null>>
  >({});
  const insertVariable = (field: TemplateField, name: string) => {
    const el = inputs.current[field];
    const variable = `{${name}}`;
    const text = form.getValues()[field] || '';
    const start = el?.selectionStart ?? 0;
    const end = el?.selectionEnd ?? 0;
    form.setFieldValue(field, text.substring(0, start) + variable + text.substring(end));
    const pos = start + variable.length;
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(pos, pos);
    });
  };
  const chips = (field: TemplateField, label: string) =>
    vars.length > 0 ? (
      <div className={classes.chips}>
        <Text size="xs" c="dimmed" mb={4}>
          {label} için değişkenler:
        </Text>
        <Group gap={4}>
          {vars.map((v) => (
            <UnstyledButton
              key={v}
              className={classes.chip}
              onClick={() => insertVariable(field, v)}
              aria-label={`${label}: {${v}} ekle`}
            >
              {`{${v}}`}
            </UnstyledButton>
          ))}
        </Group>
      </div>
    ) : null;

  const update = useUpdateNotificationConfig();
  const save = async (values: FormValues) => {
    const data: NotificationConfigPatch = {
      title_template: values.title_template || '',
      body_template: values.body_template || '',
      link_template: values.link_template || '',
      default_send_email: values.default_send_email || false,
      default_send_in_app: values.default_send_in_app || false,
    };
    if (routable) {
      data.enabled = values.enabled || false;
      data.user_ids = values.user_ids
        .map((id) => Number.parseInt(id, 10))
        .filter((id) => !Number.isNaN(id));
      data.groups = values.groups.map(String).filter(Boolean);
      data.user_groups = values.user_groups
        .map((id) => Number.parseInt(id, 10))
        .filter((id) => !Number.isNaN(id));
    }
    try {
      await update.mutateAsync({ type: config.notification_type, data });
      onClose();
      notify.success('Bildirim yapılandırması güncellendi');
    } catch (error) {
      console.error('Error updating notification config:', error);
      notify.error(
        notificationConfigErrorMessage(
          error,
          'update notification config',
          'Bildirim yapılandırması güncellenirken hata oluştu',
        ),
      );
    }
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title="Bildirim Yapılandırması Düzenle"
      subtitle={config.notification_type_display || config.notification_type}
      icon="fas fa-edit"
      size="xl"
      submitting={update.isPending}
      onSubmit={form.onSubmit(save)}
    >
      <ModalSection title="Bildirim Türü" icon="fas fa-tag">
        <Stack gap="sm">
          <TextInput
            label="Bildirim Türü"
            value={config.notification_type_display || config.notification_type}
            readOnly
            leftSection={<FaIcon icon="fas fa-tag" />}
          />
          {config.always_notified ? (
            <TextInput
              label="Her Zaman Bildirilenler"
              description="Bu bildirim türünde her zaman şu kişiler bildirilir"
              value={config.always_notified}
              readOnly
              leftSection={<FaIcon icon="fas fa-info-circle" />}
            />
          ) : null}
        </Stack>
      </ModalSection>

      <ModalSection title="Şablonlar" icon="fas fa-code">
        <Stack gap="sm">
          <div>
            <TextInput
              label="Başlık Şablonu"
              description={varsHelp}
              placeholder="Örn: [İş Emri Beklemede] {job_no}"
              ref={(el) => {
                inputs.current.title_template = el;
              }}
              {...form.getInputProps('title_template')}
            />
            {chips('title_template', 'Başlık Şablonu')}
          </div>
          <div>
            <Textarea
              label="İçerik Şablonu"
              description={varsHelp}
              placeholder="Örn: {job_no} numaralı iş emri bekletilmiştir."
              rows={5}
              ref={(el) => {
                inputs.current.body_template = el;
              }}
              {...form.getInputProps('body_template')}
            />
            {chips('body_template', 'İçerik Şablonu')}
          </div>
          <div>
            <TextInput
              label="Link Şablonu"
              description={varsHelp}
              placeholder="Örn: https://ofis.gemcore.com.tr/projects/project-tracking/?job_no={job_no}"
              ref={(el) => {
                inputs.current.link_template = el;
              }}
              {...form.getInputProps('link_template')}
            />
            {chips('link_template', 'Link Şablonu')}
          </div>
        </Stack>
      </ModalSection>

      <ModalSection title="Varsayılan Teslimat Yöntemleri" icon="fas fa-paper-plane">
        <Stack gap="sm">
          <Checkbox
            label="E-posta ile Gönder"
            description="Varsayılan olarak bu bildirim türü e-posta ile gönderilir"
            {...form.getInputProps('default_send_email', { type: 'checkbox' })}
          />
          <Checkbox
            label="Uygulama İçi Bildirim"
            description="Varsayılan olarak bu bildirim türü uygulama içi bildirim olarak gönderilir"
            {...form.getInputProps('default_send_in_app', { type: 'checkbox' })}
          />
        </Stack>
      </ModalSection>

      {routable ? (
        <ModalSection title="Yönlendirme" icon="fas fa-route">
          <Stack gap="sm">
            <Checkbox label="Aktif" {...form.getInputProps('enabled', { type: 'checkbox' })} />
            <MultiSelect
              label="Atanan Kullanıcılar"
              placeholder="Kullanıcı seçin"
              searchable
              data={userData}
              {...form.getInputProps('user_ids')}
            />
            <MultiSelect
              label="Departmanlar (department_code)"
              description="Pozisyon departman koduna göre geniş yönlendirme (ör. planning, manufacturing)."
              placeholder="Departman kodu seçin"
              searchable
              data={groupData}
              {...form.getInputProps('groups')}
            />
            <MultiSelect
              label="Organizasyon kullanıcı grupları"
              description="Organizasyon /organization/groups/ altındaki gruplar; aynı departmandan daha ince kırılım (ör. yalnızca Planlama Ofisi)."
              placeholder="Org. grup seçin"
              searchable
              data={userGroupData}
              {...form.getInputProps('user_groups')}
            />
          </Stack>
        </ModalSection>
      ) : null}
    </FormModal>
  );
}
