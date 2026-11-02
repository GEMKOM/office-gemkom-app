import { ActionIcon, Badge, Button, Center, Group, Loader, Stack, Text, TextInput, Tooltip } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  departmentLabel,
  positionTreeQueryOptions,
  usePosition,
  usePositionHolders,
  type PositionTreeNode,
} from '@/api/human_resources/organization';
import { AppLink } from '@/shell/AppLink';
import { FaIcon, notify, PageHeader, Panel } from '@/ui';
import { OrgChart } from './OrgChart';
import css from './OrgChartPage.module.css';

const EMPTY_NODES: PositionTreeNode[] = [];

/** Legacy computeStats: positions, holders, vacant seats and depth. */
export function treeStats(nodes: PositionTreeNode[]) {
  let positions = 0;
  let holders = 0;
  let vacant = 0;
  let maxDepth = 0;
  const walk = (list: PositionTreeNode[], depth: number) => {
    for (const n of list) {
      positions += 1;
      const count = Number(n.holder_count || 0);
      holders += count;
      if (count === 0) vacant += 1;
      maxDepth = Math.max(maxDepth, depth);
      if (Array.isArray(n.children) && n.children.length) walk(n.children, depth + 1);
    }
  };
  walk(nodes, 1);
  return { positions, holders, vacant, maxDepth };
}

/** Every node with children except the roots: "Tümünü Kapat" keeps the top level open. */
function collapsibleIds(nodes: PositionTreeNode[]): Set<number> {
  const out = new Set<number>();
  const walk = (list: PositionTreeNode[]) => {
    for (const n of list) {
      if (Array.isArray(n.children) && n.children.length) {
        out.add(Number(n.id));
        walk(n.children);
      }
    }
  };
  walk(nodes);
  for (const n of nodes) out.delete(Number(n.id));
  return out;
}

/**
 * Port of human_resources/org (org.js + components/organization-tree): the
 * position hierarchy as an org chart, with vacant seats and a detail card.
 */
export function OrgChartPage() {
  const tree = useQuery(positionTreeQueryOptions());
  const [collapsed, setCollapsed] = useState<ReadonlySet<number>>(() => new Set());
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (tree.isError) notify.error(tree.error, { fallback: 'Organizasyon ağacı yüklenemedi.' });
  }, [tree.isError, tree.error]);

  const nodes = tree.data ?? EMPTY_NODES;
  const stats = useMemo(() => treeStats(nodes), [nodes]);
  const figure = (value: number) => (tree.isPending ? '-' : value);

  const toggle = (id: number) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <>
      <PageHeader
        title="Organizasyon Şeması"
        subtitle="Ağaç görünümünde pozisyon hiyerarşisini ve boş koltukları inceleyin"
        icon="fas fa-sitemap"
        backTo="/human_resources/"
        stats={[
          { id: 'stat-positions', label: 'Toplam Pozisyon', value: figure(stats.positions) },
          { id: 'stat-holders', label: 'Atanmış Kişi', value: figure(stats.holders) },
          { id: 'stat-vacant', label: 'Boş Pozisyon', value: figure(stats.vacant) },
          { id: 'stat-depth', label: 'Maksimum Derinlik', value: figure(stats.maxDepth) },
        ]}
      />

      <div className={css.layout}>
        <Panel
          title="Organizasyon Ağacı"
          icon="fas fa-sitemap"
          padded={false}
          actions={
            <Button
              component={AppLink}
              to="/human_resources/org/positions/"
              size="xs"
              variant="default"
              leftSection={<FaIcon icon="fas fa-id-badge" />}
            >
              Pozisyonlar
            </Button>
          }
        >
          <div className={css.toolbar}>
            <TextInput
              className={css.search}
              size="xs"
              aria-label="Pozisyon ara"
              placeholder="Pozisyon ara..."
              leftSection={<FaIcon icon="fas fa-search" />}
              value={search}
              onChange={(event) => setSearch(event.currentTarget.value)}
            />
            <Group gap={4} ml="auto">
              <Tooltip label="Tümünü Aç">
                <ActionIcon variant="default" aria-label="Tümünü Aç" onClick={() => setCollapsed(new Set())}>
                  <FaIcon icon="fas fa-expand-arrows-alt" />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Tümünü Kapat">
                <ActionIcon variant="default" aria-label="Tümünü Kapat" onClick={() => setCollapsed(collapsibleIds(nodes))}>
                  <FaIcon icon="fas fa-compress-arrows-alt" />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Yenile">
                <ActionIcon
                  variant="default"
                  aria-label="Yenile"
                  loading={tree.isFetching}
                  onClick={() => {
                    setSelectedId(null);
                    void tree.refetch();
                  }}
                >
                  <FaIcon icon="fas fa-sync-alt" />
                </ActionIcon>
              </Tooltip>
            </Group>
          </div>
          {tree.isPending ? (
            <Center py="xl">
              <Loader size="sm" />
            </Center>
          ) : nodes.length === 0 ? (
            <div className={css.empty}>Organizasyon ağacı bulunamadı.</div>
          ) : (
            <OrgChart
              nodes={nodes}
              collapsed={collapsed}
              onToggle={toggle}
              selectedId={selectedId}
              onSelect={setSelectedId}
              search={search.trim().toLocaleLowerCase('tr-TR')}
            />
          )}
        </Panel>

        <Panel title="Pozisyon Detayı" icon="fas fa-id-badge" className={css.detail}>
          {selectedId === null ? (
            <Stack align="center" gap={6} py="lg" c="dimmed">
              <FaIcon icon="fas fa-mouse-pointer" style={{ fontSize: 22 }} />
              <Text size="sm">Detay görmek için ağaçtan bir pozisyon seçin.</Text>
            </Stack>
          ) : (
            <PositionDetail key={selectedId} positionId={selectedId} />
          )}
        </Panel>
      </div>
    </>
  );
}

/** Legacy showPositionDetail: the position, its holders and its permission codes. */
function PositionDetail({ positionId }: { positionId: number }) {
  const position = usePosition(positionId);
  const holders = usePositionHolders(positionId);
  const error = position.error ?? holders.error;

  useEffect(() => {
    if (error) notify.error(error, { fallback: 'Pozisyon detayı yüklenemedi.' });
  }, [error]);

  if (error) {
    return (
      <Text c="red" ta="center" py="md" size="sm">
        Pozisyon detayı yüklenemedi.
      </Text>
    );
  }
  if (!position.data || !holders.data) {
    return (
      <Center py="md" c="dimmed">
        <Loader size="xs" mr="xs" />
        <Text size="sm">Yükleniyor...</Text>
      </Center>
    );
  }

  const p = position.data;
  const people = holders.data;
  const permissions = Array.isArray(p.permission_codenames) ? p.permission_codenames : [];
  const dept = p.department_code ? departmentLabel(p.department_code) : null;

  return (
    <Stack gap="md" data-testid="org-position-detail">
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <div>
          <div className={css.detailTitle}>{p.title || '-'}</div>
          <div className={css.detailMeta}>
            Seviye {p.level || '-'}
            {dept ? ` · ${dept}` : ''}
            {p.parent_title ? ` · Bağlı: ${p.parent_title}` : ''}
          </div>
        </div>
        <Badge size="lg" color={people.length === 0 ? 'gray' : 'blue'} aria-label={`${people.length} kişi`}>
          {people.length}
        </Badge>
      </Group>

      <div>
        <div className={css.sectionTitle}>Mevcut Kullanıcılar</div>
        {people.length ? (
          <ul className={css.holders}>
            {people.map((h) => (
              <li key={h.id}>{h.full_name || h.username || '-'}</li>
            ))}
          </ul>
        ) : (
          <Text size="sm" c="dimmed">
            Atanmış kullanıcı yok (boş pozisyon).
          </Text>
        )}
      </div>

      <div>
        <div className={css.sectionTitle}>Yetkiler ({permissions.length})</div>
        {permissions.length ? (
          <Group gap={4}>
            {permissions.map((code) => (
              <span key={code} className={css.code}>
                {code}
              </span>
            ))}
          </Group>
        ) : (
          <Text size="sm" c="dimmed">
            Yetki tanımlı değil.
          </Text>
        )}
      </div>

      <Button
        component={AppLink}
        to="/human_resources/org/positions/"
        size="xs"
        variant="outline"
        fullWidth
        leftSection={<FaIcon icon="fas fa-cog" />}
      >
        Pozisyon Yönetimine Git
      </Button>
    </Stack>
  );
}
