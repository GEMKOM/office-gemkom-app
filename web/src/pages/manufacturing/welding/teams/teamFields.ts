import type { UserOption } from '@/api/reference/users';
import type { WeldingTeam, WeldingTeamUser } from '@/api/welding/teams';

// Legacy teams.js reads the foreman and members from whichever shape the
// backend sent (ids, nested users, *_detail lists); these are its helpers.

export type UsersById = ReadonlyMap<number, UserOption>;

export function normalizeId(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isNaN(parsed) ? null : parsed;
}

export function normalizeIdArray(value: unknown): number[] {
  if (Array.isArray(value)) return value.map(normalizeId).filter((v): v is number => v !== null);
  const single = normalizeId(value);
  return single !== null ? [single] : [];
}

function personName(user: Partial<WeldingTeamUser>): string {
  return (
    user.full_name ||
    `${user.first_name || ''} ${user.last_name || ''}`.trim() ||
    user.username ||
    ''
  );
}

/** Legacy getUserNameById: the name from the user list, else `#<id>`. */
export function userNameById(users: UsersById, userId: number): string {
  const user = users.get(userId);
  return (user && personName(user)) || `#${userId}`;
}

export function foremanId(team: WeldingTeam): number | null {
  const foreman = team.foreman;
  if (foreman && typeof foreman === 'object') return normalizeId(foreman.id);
  return normalizeId(foreman ?? team.foreman_id);
}

export function foremanName(team: WeldingTeam, users: UsersById): string {
  if (team.foreman_full_name) return team.foreman_full_name;
  if (team.foreman_name) return team.foreman_name;
  if (team.foreman && typeof team.foreman === 'object') return personName(team.foreman) || '-';
  const id = foremanId(team);
  return id ? userNameById(users, id) : '-';
}

function memberObjects(team: WeldingTeam): WeldingTeamUser[] {
  if (Array.isArray(team.members_detail)) return team.members_detail;
  const members = team.members;
  if (Array.isArray(members) && members.length > 0 && typeof members[0] === 'object') {
    return members as WeldingTeamUser[];
  }
  return [];
}

export function memberIds(team: WeldingTeam | null | undefined): number[] {
  if (!team) return [];
  if (Array.isArray(team.member_ids)) return normalizeIdArray(team.member_ids);
  if (Array.isArray(team.members)) {
    const members = team.members;
    if (members.length > 0 && typeof members[0] === 'object') {
      return normalizeIdArray((members as WeldingTeamUser[]).map((m) => m.id));
    }
    return normalizeIdArray(members);
  }
  if (Array.isArray(team.members_detail))
    return normalizeIdArray(team.members_detail.map((m) => m.id));
  return [];
}

export function memberNames(team: WeldingTeam, users: UsersById): string[] {
  const objects = memberObjects(team);
  if (objects.length > 0) return objects.map((m) => personName(m) || `#${m.id}`);
  return memberIds(team).map((id) => userNameById(users, id));
}

export function membersCount(team: WeldingTeam, users: UsersById): number {
  return typeof team.members_count === 'number'
    ? team.members_count
    : memberNames(team, users).length;
}

/** Names the team row itself carries for its foreman and members, by id. */
export function knownTeamUsers(team: WeldingTeam | null | undefined): Map<number, string> {
  const known = new Map<number, string>();
  if (!team) return known;
  if (team.foreman && typeof team.foreman === 'object') {
    known.set(team.foreman.id, personName(team.foreman));
  } else {
    const id = foremanId(team);
    const name = team.foreman_full_name || team.foreman_name;
    if (id !== null && name) known.set(id, name);
  }
  for (const member of memberObjects(team)) known.set(member.id, personName(member));
  return known;
}
