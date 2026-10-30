import { hasRouteAccess } from '@legacy/apis/accessControl.js';
import { logout, stopImpersonation } from '@legacy/authService.js';
import { Menu, UnstyledButton, type FloatingPosition } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { displayName, useAuth } from '@/auth/AuthProvider';
import { useAppNavigate } from './AppLink';
import { FaIcon } from './FaIcon';
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
  const avatar = <span className={classes.avatar}>{initials(name || '?')}</span>;

  return (
    <>
      <Menu position={position} width={240} offset={variant === 'row' ? 10 : 14} withinPortal classNames={railMenuClassNames}>
        <Menu.Target>
          {variant === 'row' ? (
            <UnstyledButton className={classes.railRow} data-user aria-label={name}>
              {avatar}
              <span className={classes.userText}>
                <span className={classes.railRowLabel}>{name}</span>
                <span className={classes.userSub}>{department}</span>
              </span>
              <FaIcon icon="fas fa-ellipsis-vertical" className={classes.rowEnd} />
            </UnstyledButton>
          ) : (
            <UnstyledButton className={classes.railItem} aria-label={name} title={name}>
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
          {hasRouteAccess('/general/vacation/requests') && (
            <Menu.Item leftSection={<FaIcon icon="fas fa-calendar-plus" />} onClick={() => navigate('/general/vacation/requests')}>
              İzin Taleplerim
            </Menu.Item>
          )}
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
