import { AppShell, Burger, Group } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { Outlet } from 'react-router';
import { RequireRoute } from '@/auth/RequireRoute';
import { AppLink } from './AppLink';
import { NotificationBell } from './NotificationBell';
import { Rail } from './Rail';
import classes from './shell.module.css';
import { SideNav } from './SideNav';
import { ImpersonationBadge, UserMenu } from './UserMenu';

/**
 * Chrome around every React page: the icon rail on the left; on small
 * screens a top bar whose burger opens the whole menu in a drawer.
 */
export function AppLayout() {
  const [drawerOpened, drawer] = useDisclosure(false);

  return (
    <AppShell
      header={{ height: { base: 56, sm: 0 } }}
      navbar={{ width: { base: 280, sm: 72 }, breakpoint: 'sm', collapsed: { mobile: !drawerOpened } }}
      padding={0}
    >
      <AppShell.Header className={classes.topbar} hiddenFrom="sm">
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap">
            <Burger opened={drawerOpened} onClick={drawer.toggle} size="sm" color="white" aria-label="Menü" />
            <AppLink to="/" className={classes.topbarBrand}>
              <img src="/images/gemkom.png" alt="Gemkom Logo" />
              GEMKOM
            </AppLink>
          </Group>
          <Group gap={4} wrap="nowrap">
            <NotificationBell />
            <UserMenu />
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar className={classes.navbar}>
        <div style={{ height: '100%' }}>
          <AppShell.Section h="100%" visibleFrom="sm">
            <Rail />
          </AppShell.Section>
          <AppShell.Section h="100%" p="xs" hiddenFrom="sm">
            <SideNav onNavigate={drawer.close} />
          </AppShell.Section>
        </div>
      </AppShell.Navbar>

      <AppShell.Main>
        <ImpersonationBadge />
        <div className={classes.content}>
          <RequireRoute>
            <Outlet />
          </RequireRoute>
        </div>
      </AppShell.Main>
    </AppShell>
  );
}
