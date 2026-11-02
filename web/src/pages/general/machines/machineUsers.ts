import type { AssignedUser } from '@/api/general/machines';
import type { UserOption } from '@/api/reference/users';

/** assigned_users holds user objects, or bare ids on older rows. */
export function assignedUserId(user: AssignedUser | number): number {
  return typeof user === 'object' && user !== null ? user.id : user;
}

/** "Ad Soyad", else the username; a bare id is looked up in `users`. */
export function assignedUserName(
  user: AssignedUser | number,
  users: readonly UserOption[],
): string {
  const found = typeof user === 'object' && user !== null ? user : users.find((u) => u.id === user);
  if (!found) return `Kullanıcı ID: ${String(user)}`;
  return (
    `${found.first_name || ''} ${found.last_name || ''}`.trim() ||
    found.username ||
    `Kullanıcı ID: ${found.id}`
  );
}
