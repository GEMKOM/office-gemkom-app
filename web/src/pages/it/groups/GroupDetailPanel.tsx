import { ActionIcon, Button, Center, Group, Loader, MultiSelect, Stack, Text, Tooltip } from '@mantine/core';
import { useEffect, useMemo, useState } from 'react';
import {
  groupMembers,
  groupPositionIds,
  groupPositions,
  positionIdOf,
  positionLabel,
  useOrganizationGroup,
  useSetGroupPositions,
  type GroupPosition,
} from '@/api/it/organizationGroups';
import { confirm, FaIcon, notify, Panel, StatusBadge } from '@/ui';
import css from './GroupsPage.module.css';

export interface GroupDetailPanelProps {
  groupId: number | null;
  positions: GroupPosition[];
}

/** The "Grup İşlemleri" side card of groups.js (showGroupDetail). */
export function GroupDetailPanel({ groupId, positions }: GroupDetailPanelProps) {
  return (
    <Panel title="Grup İşlemleri" icon="fas fa-object-group" className={css.detail}>
      {groupId === null ? (
        <Stack align="center" gap={6} py="lg" c="dimmed">
          <FaIcon icon="fas fa-mouse-pointer" style={{ fontSize: 22 }} />
          <Text size="sm">Detay görmek için listeden bir grup seçin.</Text>
        </Stack>
      ) : (
        <GroupDetail key={groupId} groupId={groupId} positions={positions} />
      )}
    </Panel>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className={css.miniStat}>
      <div className={css.miniStatLabel}>{label}</div>
      <div className={css.miniStatValue}>{value}</div>
    </div>
  );
}

function GroupDetail({ groupId, positions }: { groupId: number; positions: GroupPosition[] }) {
  const detail = useOrganizationGroup(groupId);
  const setPositions = useSetGroupPositions();
  const [toAdd, setToAdd] = useState<string[]>([]);

  useEffect(() => {
    if (detail.isError) notify.error(detail.error, { fallback: 'Grup detayı yüklenemedi.' });
  }, [detail.isError, detail.error]);

  const group = detail.data;
  const assigned = useMemo(() => groupPositionIds(group), [group]);
  const addable = useMemo(
    () =>
      positions
        .filter((p) => p.is_active !== false && !assigned.includes(Number(p.id)))
        .map((p) => ({ value: String(p.id), label: positionLabel(p) })),
    [positions, assigned],
  );

  if (detail.isPending) {
    return (
      <Center py="md">
        <Loader size="sm" />
      </Center>
    );
  }
  if (!group) {
    return (
      <Text c="red" ta="center" py="md" size="sm">
        Detay yüklenemedi.
      </Text>
    );
  }

  const posList = groupPositions(group);
  const members = groupMembers(group);
  const active = group.is_active !== false;

  const removePosition = async (position: GroupPosition) => {
    const positionId = positionIdOf(position);
    const ok = await confirm({
      title: 'Pozisyonu Gruptan Çıkar',
      message: `"${positionLabel(position)}" pozisyonu bu gruptan kaldırılacak.`,
      description: 'Devam edilsin mi?',
      confirmLabel: 'Kaldır',
      danger: true,
    });
    if (!ok) return;
    try {
      await setPositions.mutateAsync({ id: group.id, positionIds: assigned.filter((id) => id !== positionId) });
      notify.success('Pozisyon gruptan kaldırıldı.');
    } catch (error) {
      notify.error(error, { fallback: 'Pozisyon kaldırılamadı.' });
    }
  };

  const addPositions = async () => {
    const selected = toAdd.map(Number).filter(Boolean);
    if (!selected.length) {
      notify.warning('Önce en az bir pozisyon seçin.');
      return;
    }
    try {
      await setPositions.mutateAsync({ id: group.id, positionIds: [...assigned, ...selected] });
      setToAdd([]);
      notify.success(
        selected.length === 1 ? 'Pozisyon gruba eklendi.' : `${selected.length} pozisyon gruba eklendi.`,
      );
    } catch (error) {
      notify.error(error, { fallback: 'Pozisyonlar eklenemedi.' });
    }
  };

  return (
    <Stack gap="md" data-testid="group-detail">
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <div>
          <Text fw={700}>{group.name || '-'}</Text>
          <Text size="sm" c="dimmed">
            {group.description || 'Açıklama yok'}
          </Text>
        </div>
        <StatusBadge color={active ? 'green' : 'grey'}>{active ? 'Aktif' : 'Pasif'}</StatusBadge>
      </Group>

      <div className={css.miniStats}>
        <MiniStat label="Pozisyon" value={posList.length} />
        <MiniStat label="Üye" value={members.length} />
      </div>

      <div>
        <div className={css.sectionTitle}>Gruptaki Pozisyonlar</div>
        <div className={css.list}>
          {posList.length === 0 ? (
            <Text size="sm" c="dimmed" py={4}>
              Bu grupta pozisyon yok.
            </Text>
          ) : (
            posList.map((position) => (
              <div key={positionIdOf(position)} className={css.listRow}>
                <Text size="sm">{positionLabel(position)}</Text>
                <Tooltip label="Gruptan çıkar" withArrow>
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    color="red"
                    aria-label={`${positionLabel(position)} gruptan çıkar`}
                    onClick={() => void removePosition(position)}
                  >
                    <FaIcon icon="fas fa-times" />
                  </ActionIcon>
                </Tooltip>
              </div>
            ))
          )}
        </div>
      </div>

      <div>
        <div className={css.sectionTitle}>Çözümlenmiş Üyeler</div>
        <div className={css.list}>
          {members.length === 0 ? (
            <Text size="sm" c="dimmed" py={4}>
              Üye listesi boş.
            </Text>
          ) : (
            members.map((member, index) => (
              <div key={member.id ?? member.username ?? index} className={css.listRow}>
                <Text size="sm">
                  {member.full_name || member.name || member.username || '-'}
                  {member.username ? (
                    <Text span c="dimmed" size="sm">
                      {' '}
                      ({member.username})
                    </Text>
                  ) : null}
                </Text>
              </div>
            ))
          )}
        </div>
      </div>

      <div>
        <div className={css.sectionTitle}>Pozisyon ekle (çoklu)</div>
        <Stack gap="xs">
          <MultiSelect
            aria-label="Eklenecek pozisyonlar"
            placeholder="Eklenecek pozisyonları seçin..."
            data={addable}
            value={toAdd}
            onChange={setToAdd}
            searchable
            clearable
            nothingFoundMessage="Sonuç bulunamadı"
          />
          <Button
            size="xs"
            fullWidth
            loading={setPositions.isPending}
            onClick={() => void addPositions()}
            leftSection={<FaIcon icon="fas fa-layer-group" />}
          >
            Seçilenleri gruba ekle
          </Button>
        </Stack>
      </div>
    </Stack>
  );
}
