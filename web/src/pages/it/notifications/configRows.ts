import type {
  ConfigGroup,
  ConfigGroupChoice,
  ConfigUserGroup,
  NotificationConfig,
  NotificationConfigsResponse,
} from '@/api/it/notificationConfigs';
import type { OrganizationGroup } from '@/api/it/organizationGroups';

// Row building and option normalisation from it/notifications/notifications.js.

export interface Option {
  value: string;
  label: string;
}

/** A table row (legacy loadConfigs' tableData). */
export interface ConfigRow {
  id: string;
  notification_type: string;
  label: string;
  category: string;
  category_display: string;
  always_notified: string | null;
  routing: string;
  default_send_email: boolean;
  default_send_in_app: boolean;
  updated_at: string | null | undefined;
  is_default: boolean;
  is_routable: boolean;
  raw_data: NotificationConfig;
}

export function normalizeGroupChoice(item: ConfigGroupChoice | null | undefined): Option | null {
  if (!item) return null;
  if (typeof item === 'string') return { value: item, label: item };
  const value = item.value ?? item.name ?? item.id;
  const label = item.label ?? item.display ?? value;
  if (!value) return null;
  return { value: String(value), label: String(label ?? value) };
}

export function normalizeConfigGroup(
  item: ConfigGroup | null | undefined,
): { name: string; display: string } | null {
  if (!item) return null;
  if (typeof item === 'string') return { name: item, display: item };
  const name = item.name ?? item.value ?? item.id;
  const display = item.display ?? item.label ?? name;
  if (!name) return null;
  return { name: String(name), display: String(display ?? name) };
}

export function normalizeConfigUserGroupDisplay(
  item: ConfigUserGroup | null | undefined,
): string | null {
  if (item == null || item === '') return null;
  if (typeof item === 'string') return item;
  if (typeof item === 'number') return String(item);
  const name = item.name ?? item.title;
  if (name) return String(name);
  if (item.id != null) return `#${item.id}`;
  return null;
}

export function configUserGroupToSelectedId(
  ug: ConfigUserGroup | null | undefined,
  nameToId: Map<string, string>,
): string | null {
  if (ug == null || ug === '') return null;
  if (typeof ug === 'object') {
    if (ug.id != null && ug.id !== '') return String(ug.id);
    const n = ug.name ?? ug.title;
    if (n != null && nameToId.has(String(n))) return nameToId.get(String(n)) ?? null;
    return null;
  }
  const s = String(ug).trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) return s;
  return nameToId.get(s) ?? null;
}

/** "N kullanıcı + Departman: … + Org. gruplar: …", or '-'. */
export function routingText(config: NotificationConfig): string {
  const userCount = config.users ? config.users.length : 0;
  const groupLabels = (config.groups || [])
    .map(normalizeConfigGroup)
    .filter((g): g is { name: string; display: string } => g !== null)
    .map((g) => g.display || g.name)
    .filter(Boolean);
  const userGroupLabels = (config.user_groups || [])
    .map(normalizeConfigUserGroupDisplay)
    .filter((g): g is string => Boolean(g));
  const parts: string[] = [];
  if (userCount > 0) parts.push(`${userCount} kullanıcı`);
  if (groupLabels.length > 0) parts.push(`Departman: ${groupLabels.join(', ')}`);
  if (userGroupLabels.length > 0) parts.push(`Org. gruplar: ${userGroupLabels.join(', ')}`);
  return parts.length > 0 ? parts.join(' + ') : '-';
}

export function configRows(response: NotificationConfigsResponse | undefined): ConfigRow[] {
  return (response?.configs || []).map((config) => ({
    id: config.notification_type,
    notification_type: config.notification_type,
    label: config.notification_type_display || config.notification_type,
    category: config.category || 'other',
    category_display: config.category_display || 'Diğer',
    always_notified: config.always_notified || null,
    routing: routingText(config),
    default_send_email: config.default_send_email !== undefined ? config.default_send_email : true,
    default_send_in_app:
      config.default_send_in_app !== undefined ? config.default_send_in_app : true,
    updated_at: config.updated_at,
    is_default: config.is_default || false,
    is_routable: config.is_routable || false,
    raw_data: config,
  }));
}

/** The department choices the config endpoint sends with the configs. */
export function groupChoices(response: NotificationConfigsResponse | undefined): Option[] {
  const raw = response?.groups || response?.group_choices || response?.team_choices || [];
  return raw.map(normalizeGroupChoice).filter((g): g is Option => g !== null);
}

/** /organization/groups/ as department options (legacy fetchGroupsWithPermissions). */
export function liveGroupOptions(groups: readonly OrganizationGroup[]): Option[] {
  return groups
    .map((g) =>
      normalizeGroupChoice({
        value: g.name,
        label:
          (g.display_name as string | undefined) || (g.display as string | undefined) || g.name,
      }),
    )
    .filter((g): g is Option => g !== null);
}

/** /organization/groups/ as org user group options: id → name (or #id). */
export function orgUserGroupOptions(groups: readonly OrganizationGroup[]): Option[] {
  return groups
    .filter((g) => g != null && g.id != null && String(g.id) !== '')
    .map((g) => ({
      value: String(g.id),
      label: g.name != null && String(g.name).trim() !== '' ? String(g.name) : `#${g.id}`,
    }));
}
