import {
  Button,
  Code,
  Group,
  ScrollArea,
  Select,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  Title,
  VisuallyHidden,
} from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { qk } from '@/api';
import {
  assignUserToPosition,
  deleteUserPermissionOverride,
  positionLabel,
  saveUserPermissionOverride,
  userPermissionsQueryOptions,
  type EffectivePermission,
  type OrgPosition,
  type UserPermissionsDetail,
} from '@/api/human_resources/users';
import { confirm, FaIcon, FormModal, ModalSection, notify, StatusBadge } from '@/ui';

function SourceBadge({ source, detail }: { source: string | undefined; detail?: string }) {
  const extra = detail ? (
    <Text span size="xs" c="dimmed" ml={4}>
      {detail}
    </Text>
  ) : null;
  let badge: ReactNode;
  switch (source) {
    case 'superuser':
      badge = <StatusBadge color="red">Süper kullanıcı</StatusBadge>;
      break;
    case 'override':
      badge = <StatusBadge color="yellow">Bireysel</StatusBadge>;
      break;
    case 'group':
      badge = <StatusBadge color="blue">Grup</StatusBadge>;
      break;
    case 'legacy':
      badge = <StatusBadge color="grey">Eski</StatusBadge>;
      break;
    default:
      return <StatusBadge color="grey">Yok</StatusBadge>;
  }
  return (
    <>
      {badge}
      {extra}
    </>
  );
}

function BoolBadge({ value }: { value: boolean }) {
  return value ? (
    <StatusBadge color="green">
      <FaIcon icon="fas fa-check" />
      <VisuallyHidden>Var</VisuallyHidden>
    </StatusBadge>
  ) : (
    <StatusBadge color="red">
      <FaIcon icon="fas fa-times" />
      <VisuallyHidden>Yok</VisuallyHidden>
    </StatusBadge>
  );
}

/** The user's current position id, from wherever the detail payload carries it. */
export function currentPositionId(detail: UserPermissionsDetail | null | undefined): string {
  const u = (detail?.user || {}) as Record<string, unknown>;
  const pick = (v: unknown): unknown =>
    v && typeof v === 'object' ? (v as { id?: unknown }).id : v;
  const profile = (u.profile || {}) as Record<string, unknown>;
  const id =
    Number(
      pick(detail?.position) ??
        u.position_id ??
        profile.position_id ??
        pick(profile.position) ??
        pick(u.position) ??
        '',
    ) || 0;
  return id ? String(id) : '';
}

const NONE: EffectivePermission = { value: false, source: 'none', source_detail: '' };

/** Port of loadPermissionsAndGroups: position, portal access, effective permissions and overrides. */
export function PermissionsTab({
  userId,
  positions,
}: {
  userId: number;
  positions: OrgPosition[];
}) {
  const queryClient = useQueryClient();
  const options = userPermissionsQueryOptions(userId);
  const detail = useQuery(options);
  const reload = () => queryClient.invalidateQueries({ queryKey: options.queryKey });
  // A pick not saved yet. Kept apart from the stored value so a reload after
  // a portal toggle does not reset it (legacy bug: Kaydet then sent null).
  const [pending, setPending] = useState<string | null>(null);
  const [overriding, setOverriding] = useState<string | null>(null);

  if (detail.isPending) {
    return (
      <Text size="sm" c="dimmed">
        <FaIcon icon="fas fa-spinner fa-spin" /> Yükleniyor...
      </Text>
    );
  }
  if (detail.isError) {
    return (
      <Text size="sm" c="red">
        Yüklenemedi: {detail.error.message}
      </Text>
    );
  }

  const data = detail.data ?? {};
  const isSuper = data.user?.is_superuser === true;
  const effective = data.effective_permissions || {};
  const overrides = Array.isArray(data.overrides) ? data.overrides : [];
  const office = effective.office_access ?? NONE;
  const workshop = effective.workshop_access ?? NONE;
  const stored = currentPositionId(data);
  const selected = pending !== null && pending !== stored ? pending : stored;
  const codes = Object.keys(effective).sort((a, b) => a.localeCompare(b, 'tr'));

  const savePosition = async () => {
    if (selected === stored) {
      notify.info('Pozisyon zaten güncel.');
      return;
    }
    // Empty means "remove the position", which also drops the position's
    // groups and permissions: never send that without asking.
    if (!selected) {
      const ok = await confirm({
        title: 'Onay',
        danger: true,
        message: 'Kullanıcının pozisyonu kaldırılacak.',
        description: 'Pozisyondan gelen grup üyelikleri ve yetkiler de kalkar. Devam edilsin mi?',
      });
      if (!ok) return;
    }
    try {
      await assignUserToPosition(userId, selected ? Number(selected) : null);
      setPending(null);
      notify.success(selected ? 'Pozisyon güncellendi' : 'Pozisyon kaldırıldı');
      await reload();
      // The Pozisyon column of the list behind the modal.
      void queryClient.invalidateQueries({ queryKey: qk.users.all });
    } catch (error) {
      notify.error(error, { fallback: 'Pozisyon güncellenemedi' });
    }
  };

  const togglePortal = async (codename: string, current: boolean) => {
    try {
      await saveUserPermissionOverride(userId, { codename, granted: !current, reason: '' });
      notify.success('Portal erişimi güncellendi');
      await reload();
    } catch (error) {
      notify.error(error, { fallback: 'Portal erişimi güncellenemedi' });
    }
  };

  const removeOverride = async (codename: string) => {
    try {
      await deleteUserPermissionOverride(userId, codename);
      notify.success('Geçersiz kılma kaldırıldı');
      await reload();
    } catch (error) {
      notify.error(error, { fallback: 'Geçersiz kılma silinemedi' });
    }
  };

  const portalButton = (
    codename: string,
    label: string,
    icon: string,
    perm: EffectivePermission,
  ) => {
    const on = perm.value === true;
    return (
      <Button
        size="xs"
        variant={on ? 'filled' : 'default'}
        color={on ? 'green' : undefined}
        leftSection={<FaIcon icon={icon} />}
        onClick={() => void togglePortal(codename, on)}
      >
        {label}: {on ? 'Açık' : 'Kapalı'}
      </Button>
    );
  };

  return (
    <Stack gap="sm">
      <Text fw={600}>Yetkiler &amp; Gruplar</Text>

      <Title order={6}>Pozisyon</Title>
      <Group gap="xs" align="flex-end" wrap="nowrap">
        <Select
          style={{ flex: 1 }}
          aria-label="Pozisyon"
          placeholder="Pozisyon seçin..."
          searchable
          clearable
          data={positions.map((p) => ({ value: String(p.id), label: positionLabel(p) }))}
          value={selected || null}
          onChange={(value) => setPending(value ?? '')}
        />
        <Button size="sm" variant="default" onClick={() => void savePosition()}>
          Kaydet
        </Button>
      </Group>

      <Title order={6} mt="xs">
        Portal Erişimi
      </Title>
      <Group gap="xs">
        {portalButton('office_access', 'Ofis', 'fas fa-building', office)}
        {portalButton('workshop_access', 'Atölye', 'fas fa-industry', workshop)}
      </Group>

      <Title order={6} mt="xs">
        Yetkiler
      </Title>
      <ScrollArea.Autosize mah={280}>
        <Table verticalSpacing={4} fz="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Kod</Table.Th>
              <Table.Th>Durum</Table.Th>
              <Table.Th>Kaynak</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {codes.map((code) => {
              const p = effective[code] ?? NONE;
              return (
                <Table.Tr key={code}>
                  <Table.Td>
                    <Code>{code}</Code>
                  </Table.Td>
                  <Table.Td>
                    <BoolBadge value={p.value === true} />
                  </Table.Td>
                  <Table.Td>
                    {isSuper ? (
                      <SourceBadge source="superuser" />
                    ) : (
                      <SourceBadge source={p.source} detail={p.source_detail} />
                    )}
                  </Table.Td>
                  <Table.Td ta="right">
                    {!isSuper ? (
                      <Button
                        size="compact-xs"
                        variant="default"
                        onClick={() => setOverriding(code)}
                      >
                        Geçersiz Kıl
                      </Button>
                    ) : null}
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </ScrollArea.Autosize>

      <Title order={6} mt="xs">
        Bireysel Geçersiz Kılmalar
      </Title>
      <ScrollArea.Autosize mah={180}>
        <Table verticalSpacing={4} fz="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Kod</Table.Th>
              <Table.Th>Durum</Table.Th>
              <Table.Th>Sebep</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {overrides.length ? (
              overrides.map((o) => (
                <Table.Tr key={o.codename}>
                  <Table.Td>
                    <Code>{o.codename}</Code>
                  </Table.Td>
                  <Table.Td>{o.granted ? 'İzin' : 'Yasak'}</Table.Td>
                  <Table.Td>{o.reason || '-'}</Table.Td>
                  <Table.Td ta="right">
                    <Button
                      size="compact-xs"
                      variant="default"
                      color="red"
                      onClick={() => void removeOverride(o.codename)}
                    >
                      Sil
                    </Button>
                  </Table.Td>
                </Table.Tr>
              ))
            ) : (
              <Table.Tr>
                <Table.Td colSpan={4}>
                  <Text size="sm" c="dimmed">
                    Bireysel geçersiz kılma yok.
                  </Text>
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </ScrollArea.Autosize>

      {overriding ? (
        <OverrideModal
          userId={userId}
          codename={overriding}
          onSaved={() => void reload()}
          onClose={() => setOverriding(null)}
        />
      ) : null}
    </Stack>
  );
}

function OverrideModal({
  userId,
  codename,
  onSaved,
  onClose,
}: {
  userId: number;
  codename: string;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [granted, setGranted] = useState('true');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const save = async () => {
    setSubmitting(true);
    try {
      await saveUserPermissionOverride(userId, { codename, granted: granted === 'true', reason });
      notify.success('Geçersiz kılma kaydedildi');
      onSaved();
      onClose();
    } catch (error) {
      notify.error(error, { fallback: 'Geçersiz kılma kaydedilemedi' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title="Yetki Geçersiz Kılma"
      icon="fas fa-user-shield"
      submitting={submitting}
      onSubmit={() => void save()}
    >
      <ModalSection title="Geçersiz Kılma" icon="fas fa-user-shield">
        <Stack gap="sm">
          <TextInput label="Yetki Kodu" value={codename} readOnly />
          <Select
            label="Durum"
            allowDeselect={false}
            data={[
              { value: 'true', label: 'Erişim Ver (grant)' },
              { value: 'false', label: 'Erişimi Engelle (deny)' },
            ]}
            value={granted}
            onChange={(v) => setGranted(v ?? 'true')}
          />
          <Textarea
            label="Sebep (opsiyonel)"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.currentTarget.value)}
          />
        </Stack>
      </ModalSection>
    </FormModal>
  );
}
