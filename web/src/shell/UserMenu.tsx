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

export function UserMenu({ position = 'bottom-end' }: { position?: FloatingPosition }) {
  const { user, isImpersonating } = useAuth();
  const navigate = useAppNavigate();
  const [profileOpened, profile] = useDisclosure(false);
  const department = user.position?.department_code || user.department_code || 'Atanmamış';

  return (
    <>
      <Menu position={position} width={240} offset={14} withinPortal classNames={railMenuClassNames}>
        <Menu.Target>
          <UnstyledButton className={classes.railItem} aria-label={displayName(user)} title={displayName(user)}>
            <span className={classes.avatar}>{initials(displayName(user) || user.username || '?')}</span>
          </UnstyledButton>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>Kullanıcı Bilgileri</Menu.Label>
          <Menu.Item leftSection={<FaIcon icon="fas fa-user-edit" />} onClick={profile.open}>
            Profili Düzenle
          </Menu.Item>
          <Menu.Item leftSection={<FaIcon icon="fas fa-comments" />} onClick={() => navigate('/general/discussions')}>
            Tartışmalarım
          </Menu.Item>
          <Menu.Label>Departman: {department}</Menu.Label>
          <Menu.Divider />
          {isImpersonating && (
            <Menu.Item
              color="yellow"
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
          <Menu.Item color="red" leftSection={<FaIcon icon="fas fa-sign-out-alt" />} onClick={() => logout()}>
            Çıkış Yap
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
      {profileOpened && <ProfileModal opened onClose={profile.close} />}
    </>
  );
}
