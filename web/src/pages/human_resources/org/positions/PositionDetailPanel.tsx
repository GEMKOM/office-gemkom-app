import { ActionIcon, Button, Group, Loader, MultiSelect, Stack, Text } from '@mantine/core';
import { useEffect, useState } from 'react';
import type { UserOption } from '@/api';
import {
  departmentLabel,
  useAssignUserToPosition,
  usePosition,
  usePositionHolders,
  type PositionHolder,
} from '@/api/human_resources/organization';
import { AppLink } from '@/shell/AppLink';
import { confirm, FaIcon, notify, Panel, StatusBadge } from '@/ui';
import classes from './positions.module.css';

/** positions.js getUserDisplayName. */
function userName(user: Pick<UserOption, 'first_name' | 'last_name' | 'username'>): string {
  return `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username || '-';
}

const EMPTY_HOLDERS: PositionHolder[] = [];

function Placeholder() {
  return (
    <Stack align="center" gap={6} py="lg">
      <FaIcon icon="fas fa-mouse-pointer" style={{ fontSize: 22, color: 'var(--gk-muted)' }} />
      <Text size="sm" c="dimmed" ta="center">
        Detay görmek için listeden bir pozisyon seçin.
      </Text>
    </Stack>
  );
}

export interface PositionDetailPanelProps {
  positionId: number | null;
  /** Active users, for the assign picker. */
  users: UserOption[];
}

/** The "Pozisyon İşlemleri" side panel of positions.js (showPositionDetail). */
export function PositionDetailPanel({ positionId, users }: PositionDetailPanelProps) {
  return (
    <Panel title="Pozisyon İşlemleri" icon="fas fa-cog" className={classes.detail}>
      {positionId === null ? (
        <Placeholder />
      ) : (
        <Detail key={positionId} positionId={positionId} users={users} />
      )}
    </Panel>
  );
}

function Detail({ positionId, users }: { positionId: number; users: UserOption[] }) {
  const position = usePosition(positionId);
  const holdersQuery = usePositionHolders(positionId);
  const holders = holdersQuery.data ?? EMPTY_HOLDERS;
  const assign = useAssignUserToPosition();
  const [selected, setSelected] = useState<string[]>([]);
  const [assigning, setAssigning] = useState(false);

  const failed = position.isError || holdersQuery.isError;
  const failure = position.error ?? holdersQuery.error;
  useEffect(() => {
    if (failed) notify.error(failure, { fallback: 'Pozisyon detayı yüklenemedi.' });
  }, [failed, failure]);

  if (failed) {
    return (
      <Text c="red" ta="center" py="md" size="sm">
        Detay yüklenemedi.
      </Text>
    );
  }
  if (position.isPending || holdersQuery.isPending) {
    return (
      <Group justify="center" gap={8} py="md">
        <Loader size="xs" />
        <Text size="sm" c="dimmed">
          Yükleniyor...
        </Text>
      </Group>
    );
  }

  const p = position.data;
  const holderIds = new Set(holders.map((h) => Number(h.id)));
  const assignable = users
    .filter((u) => u.is_active !== false && !holderIds.has(Number(u.id)))
    .map((u) => ({ value: String(u.id), label: userName(u) }));
  // Drop picks that became holders meanwhile.
  const picked = selected.filter((id) => !holderIds.has(Number(id)));

  const removeHolder = async (holder: PositionHolder) => {
    const ok = await confirm({
      title: 'Pozisyonu Kaldır',
      icon: 'fas fa-times',
      message: `"${holder.full_name || holder.username || ''}" kullanıcısının pozisyonu kaldırılacak.`,
      description: 'Bu işlem pozisyon bazlı yetkilerini de temizler. Devam edilsin mi?',
      confirmLabel: 'Kaldır',
      danger: true,
    });
    if (!ok) return;
    try {
      await assign.mutateAsync({ userId: Number(holder.id), positionId: null });
      notify.success('Kullanıcının pozisyonu kaldırıldı.');
    } catch (error) {
      notify.error(error, { fallback: 'Pozisyon kaldırılamadı.' });
    }
  };

  const assignSelected = async () => {
    const ids = picked.map(Number).filter(Boolean);
    if (!ids.length) {
      notify.warning('Önce en az bir kullanıcı seçin.');
      return;
    }
    setAssigning(true);
    try {
      await Promise.all(ids.map((userId) => assign.mutateAsync({ userId, positionId })));
      setSelected([]);
      notify.success(
        ids.length === 1
          ? 'Kullanıcı pozisyona atandı.'
          : `${ids.length} kullanıcı pozisyona atandı.`,
      );
    } catch (error) {
      notify.error(error, { fallback: 'Kullanıcı atanamadı.' });
    } finally {
      setAssigning(false);
    }
  };

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-start" wrap="nowrap" gap="sm">
        <div style={{ minWidth: 0 }}>
          <Text fw={600}>{p.title || '-'}</Text>
          <Text size="sm" c="dimmed">
            <span className={classes.level} data-family="blue">
              L{p.level ?? '-'}
            </span>
            {p.department_code ? <> · {departmentLabel(p.department_code)}</> : null}
            {p.parent_title ? (
              <>
                {' '}
                · Bağlı: <strong>{p.parent_title}</strong>
              </>
            ) : null}
          </Text>
        </div>
        {p.is_active ? (
          <StatusBadge color="green">Aktif</StatusBadge>
        ) : (
          <StatusBadge color="grey">Pasif</StatusBadge>
        )}
      </Group>

      <div>
        <p className={classes.sectionTitle}>Atanmış Kullanıcı</p>
        <Text fw={600} size="lg" data-testid="position-holder-count">
          {holders.length}
        </Text>
      </div>

      <div>
        <p className={classes.sectionTitle}>Mevcut Kullanıcılar</p>
        {holders.length ? (
          <ul className={classes.holders}>
            {holders.map((h) => (
              <li key={h.id}>
                <span>{h.full_name || h.username || '-'}</span>
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  color="red"
                  aria-label="Pozisyonu Kaldır"
                  title="Pozisyonu Kaldır"
                  onClick={() => void removeHolder(h)}
                >
                  <FaIcon icon="fas fa-times" />
                </ActionIcon>
              </li>
            ))}
          </ul>
        ) : (
          <Text size="sm" c="dimmed">
            Bu pozisyonda kullanıcı yok.
          </Text>
        )}
      </div>

      <div>
        <p className={classes.sectionTitle}>Kullanıcı Atama</p>
        <Stack gap="xs">
          <MultiSelect
            aria-label="Kullanıcı Atama"
            placeholder="Kullanıcı seçin..."
            data={assignable}
            value={picked}
            onChange={setSelected}
            searchable
            clearable
            nothingFoundMessage="Sonuç bulunamadı"
          />
          <Button
            size="xs"
            fullWidth
            loading={assigning}
            leftSection={<FaIcon icon="fas fa-user-plus" />}
            onClick={() => void assignSelected()}
          >
            Ata
          </Button>
        </Stack>
      </div>

      <div>
        <p className={classes.sectionTitle}>Yetkiler</p>
        <Text size="sm" c="dimmed" mb="xs">
          Bu pozisyonun yetkileri Yetki Yönetimi sayfasından düzenlenir.
        </Text>
        <Button
          component={AppLink}
          to="/it/permissions/"
          size="xs"
          variant="default"
          fullWidth
          leftSection={<FaIcon icon="fas fa-user-shield" />}
        >
          Yetki Yönetimine Git
        </Button>
      </div>
    </Stack>
  );
}
