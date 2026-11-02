import { Center, Stack, Tabs, Text, Title } from '@mantine/core';
import { useState } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { AppLink } from '@/shell/AppLink';
import { FaIcon, PageHeader, Panel } from '@/ui';
import { PermissionsListTab } from './PermissionsListTab';
import { PositionsTab } from './PositionsTab';
import { UsersTab } from './UsersTab';

/**
 * Port of it/permissions (permissions.js), Yetki Yönetimi: users with their
 * effective permissions and overrides, positions with their permission sets,
 * and every permission with who holds it. Admins only, as legacy. Each tab
 * loads when first opened.
 */
export function PermissionsPage() {
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState('users');
  // A tab loads on its first visit and then stays mounted, so a selection or an
  // unsaved position draft survives switching tabs, as legacy's hidden panes did.
  const [visited, setVisited] = useState<ReadonlySet<string>>(() => new Set(['users']));
  // Kept across positions while the page is open (legacy sectionCollapseState).
  const [expandedSections, setExpandedSections] = useState<string[]>([]);

  const open = (value: string | null) => {
    const next = value ?? 'users';
    setTab(next);
    setVisited((prev) => (prev.has(next) ? prev : new Set([...prev, next])));
  };

  if (!isAdmin) {
    // Legacy showed this message and went back to /it/.
    return (
      <Center mih="60vh">
        <Stack align="center" gap="xs">
          <Title order={2}>Erişim yetkiniz yok</Title>
          <Text c="dimmed">Bu sayfaya erişim yetkiniz bulunmamaktadır.</Text>
          <AppLink to="/it/">Bilgi İşlem'e dön</AppLink>
        </Stack>
      </Center>
    );
  }

  return (
    <>
      <PageHeader
        title="Yetki Yönetimi"
        subtitle="Pozisyonlara göre yetki dağılımını yönetin"
        icon="fas fa-user-shield"
        backTo="/it/"
      />
      <Panel>
        <Tabs value={tab} onChange={open}>
          <Tabs.List mb="md">
            <Tabs.Tab value="users" leftSection={<FaIcon icon="fas fa-users" />}>
              Kullanıcılar
            </Tabs.Tab>
            <Tabs.Tab value="positions" leftSection={<FaIcon icon="fas fa-sitemap" />}>
              Pozisyonlar
            </Tabs.Tab>
            <Tabs.Tab value="perms" leftSection={<FaIcon icon="fas fa-key" />}>
              Yetkiler
            </Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="users">{visited.has('users') ? <UsersTab /> : null}</Tabs.Panel>
          <Tabs.Panel value="positions">
            {visited.has('positions') ? (
              <PositionsTab expandedSections={expandedSections} onExpandedSectionsChange={setExpandedSections} />
            ) : null}
          </Tabs.Panel>
          {/* Rebuilt on every visit: it reads the position details opened since. */}
          <Tabs.Panel value="perms">{tab === 'perms' ? <PermissionsListTab /> : null}</Tabs.Panel>
        </Tabs>
      </Panel>
    </>
  );
}
