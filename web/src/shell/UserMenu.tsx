import { hasRouteAccess } from '@/auth/accessControl';
import { logout, stopImpersonation } from '@/auth/authService';
import { Badge, Menu, UnstyledButton, type FloatingPosition } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { displayName, useAuth } from '@/auth/AuthProvider';
import { useAppNavigate } from './AppLink';
import { badgeText } from '@/ui';
import { FaIcon } from './FaIcon';
import { useWaitingSummary } from './navBadges';
import { ProfileModal } from './ProfileModal';
import { railMenuClassNames } from './railMenu';
import classes from './shell.module.css';

function impersonatorLabel(): string {
  try {
    const admin = JSON.parse(localStorage.getItem('impersonatorUser') || '{}');
    return admin?.username || admin?.email || 'admin';
  } catch {
    return 'admin';
  }
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? [parts[0]![0], parts.at(-1)![0]] : [name[0]];
  return letters.join('').toLocaleUpperCase('tr-TR');
}

/** A strip above the page while an admin is acting as someone else. */
export function ImpersonationBadge() {
  const { user, isImpersonating } = useAuth();
  if (!isImpersonating) return null;
  return (
    <div
      style={{ background: '#fdf3d8', color: '#8a5a00', fontSize: 13, padding: '6px var(--gk-page-pad)', borderBottom: '1px solid #f2d999' }}
    >
      <FaIcon icon="fas fa-user-secret" /> Impersonating as <strong>{user.username}</strong> (admin: {impersonatorLabel()})
    </div>
  );
}

/** The avatar and its menu; `row` is the expanded rail's version with the name next to it. */
// Personal pages: the user's own leave / overtime requests (moved here from
// Genel, 2026-11-19) and Onaylar, every approval waiting on them in one page.
const MY_LEAVE = '/general/vacation/requests';
const MY_OVERTIME = '/human_resources/overtime/registry';
const APPROVALS_ROUTE = '/approvals';

export function UserMenu({
  position = 'bottom-end',
  variant = 'icon',
}: {
  position?: FloatingPosition;
  variant?: 'icon' | 'row';
}) {
  const { user, isImpersonating } = useAuth();
  const navigate = useAppNavigate();
  const [profileOpened, profile] = useDisclosure(false);
  const department = user.position?.department_code || user.department_code || 'Atanmamış';
  const name = displayName(user) || user.username;
  // Onaylar lives in this pop-up, so everything waiting on the user sits on the avatar.
  const { total: waiting, anyQueue } = useWaitingSummary();
  const label = waiting > 0 ? `${name}, ${waiting} onay bekliyor` : name;
  const avatar = (
    <span className={classes.avatar} style={{ position: 'relative' }}>
      {initials(name || '?')}
      {waiting > 0 ? (
        <span className={classes.badgeDot} style={{ top: -4, right: -6 }} aria-hidden>
          {badgeText(waiting)}
        </span>
      ) : null}
    </span>
  );

  return (
    <>
      <Menu position={position} width={240} offset={variant === 'row' ? 10 : 14} withinPortal classNames={railMenuClassNames}>
        <Menu.Target>
          {variant === 'row' ? (
            <UnstyledButton className={classes.railRow} data-user aria-label={label}>
              {avatar}
              <span className={classes.userText}>
                <span className={classes.railRowLabel}>{name}</span>
                <span className={classes.userSub}>{department}</span>
              </span>
              <FaIcon icon="fas fa-ellipsis-vertical" className={classes.rowEnd} />
            </UnstyledButton>
          ) : (
            <UnstyledButton className={classes.railItem} aria-label={label} title={label}>
              {avatar}
            </UnstyledButton>
          )}
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>Kullanıcı Bilgileri</Menu.Label>
          <Menu.Item leftSection={<FaIcon icon="fas fa-user-edit" />} onClick={profile.open}>
            Profili Düzenle
          </Menu.Item>
          <Menu.Item leftSection={<FaIcon icon="fas fa-comments" />} onClick={() => navigate('/general/discussions')}>
            Tartışmalarım
          </Menu.Item>
          {hasRouteAccess(MY_LEAVE) && (
            <Menu.Item leftSection={<FaIcon icon="fas fa-calendar-plus" />} onClick={() => navigate(MY_LEAVE)}>
              İzin Taleplerim
            </Menu.Item>
          )}
          {hasRouteAccess(MY_OVERTIME) && (
            <Menu.Item leftSection={<FaIcon icon="fas fa-clock" />} onClick={() => navigate(MY_OVERTIME)}>
              Mesai Taleplerim
            </Menu.Item>
          )}
          {anyQueue ? (
            <Menu.Item
              leftSection={<FaIcon icon="fas fa-check-double" />}
              rightSection={
                waiting > 0 ? (
                  <Badge size="sm" color="yellow" variant="filled" aria-label={`${waiting} bekliyor`}>
                    {badgeText(waiting)}
                  </Badge>
                ) : null
              }
              onClick={() => navigate(APPROVALS_ROUTE)}
            >
              Onaylar
            </Menu.Item>
          ) : null}
          <Menu.Label>Departman: {department}</Menu.Label>
          <Menu.Divider />
          {isImpersonating && (
            <Menu.Item
              data-tone="warning"
              leftSection={<FaIcon icon="fas fa-user-slash" />}
              onClick={() =>
                stopImpersonation().catch((error: Error) =>
                  notifications.show({ color: 'red', message: error.message }),
                )
              }
            >
              Impersonation&apos;ı Bitir
            </Menu.Item>
          )}
          <Menu.Item data-tone="danger" leftSection={<FaIcon icon="fas fa-sign-out-alt" />} onClick={() => logout()}>
            Çıkış Yap
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
      {profileOpened && <ProfileModal opened onClose={profile.close} />}
    </>
  );
}
