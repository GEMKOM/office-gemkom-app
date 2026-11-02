import { Anchor, Group, Text } from '@mantine/core';
import dayjs from 'dayjs';
import type { ReactNode } from 'react';
import { formatNumber } from '@/lib/format';
import { FaIcon, StatusBadge, type DataTableColumn } from '@/ui';
import uiClasses from '@/ui/ui.module.css';

// Pieces the daily-efficiency and performance reports share: both list a
// user's tasks grouped under the user (legacy groupBy '_userId').

export const DAY = 'YYYY-MM-DD';

/** The user a task row belongs to, copied onto every row like legacy did. */
export interface UserFields {
  _userId: number;
  _username: string;
  _firstName?: string;
  _lastName?: string;
  /** "Ad Soyad", or the username when either name is missing. */
  _displayName: string;
}

export function userFields(user: {
  user_id: number;
  username: string;
  first_name?: string;
  last_name?: string;
}): UserFields {
  return {
    _userId: user.user_id,
    _username: user.username,
    _firstName: user.first_name,
    _lastName: user.last_name,
    _displayName:
      user.first_name && user.last_name ? `${user.first_name} ${user.last_name}` : user.username,
  };
}

const hasFullName = (row: UserFields) => Boolean(row._firstName && row._lastName);

/** The export's Kullanıcı column: "Ad Soyad (@kullanici)" or the username. */
export function userExportLabel(row: UserFields): string {
  return hasFullName(row) ? `${row._displayName} (@${row._username})` : row._username || '';
}

/** Kullanıcı, in the Excel file only (legacy patched prepareExportData for it). */
export function userExportColumn<T extends UserFields>(): DataTableColumn<T> {
  return {
    key: '_user',
    header: 'Kullanıcı',
    exportOnly: true,
    accessor: (row) => userExportLabel(row),
  };
}

/** Name, @username and the task count at the start of a group header. */
export function UserGroupTitle({ row, count }: { row: UserFields; count: number }) {
  return (
    <Group gap={8} wrap="nowrap" component="span">
      <FaIcon icon="fas fa-user" style={{ color: 'var(--gk-red-700)' }} />
      <strong>
        {row._displayName}
        {hasFullName(row) ? (
          <Text span size="xs" c="dimmed" fw={400} ml={6}>
            (@{row._username})
          </Text>
        ) : null}
      </strong>
      <StatusBadge color="green">{count} görev</StatusBadge>
    </Group>
  );
}

/** A figure in a group header: icon, label, value. */
export function GroupFigure({
  icon,
  label,
  children,
}: {
  icon: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <Text span size="sm" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
      <FaIcon icon={icon} style={{ marginRight: 4 }} />
      {label}: {children}
    </Text>
  );
}

// ---- cells ------------------------------------------------------------------

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

export const hours = (value: number | null | undefined) =>
  isNumber(value) ? formatNumber(value, 2) : '-';

/** Links to the task list in a new tab, like legacy renderTaskKeyBadge. */
export function TaskKeyLink({ value }: { value: string | null | undefined }) {
  if (!value) return <>-</>;
  return (
    <Anchor
      href={`/manufacturing/machining/tasks/list/?task=${encodeURIComponent(value)}`}
      target="_blank"
      rel="noopener noreferrer"
      className={uiClasses.code}
      c="inherit"
    >
      {value}
    </Anchor>
  );
}

/** Long names cut at `max` with the whole text in a tooltip. */
export function Truncated({
  value,
  max,
  ellipsis,
}: {
  value: string | null | undefined;
  max: number;
  ellipsis: string;
}) {
  if (!value) return <>-</>;
  if (value.length <= max) return <>{value}</>;
  return <span title={value}>{`${value.slice(0, max)}${ellipsis}`}</span>;
}

/** Green from 100%, yellow from 80%, red below (legacy text-success/warning/danger). */
export function efficiencyColor(value: number): string {
  if (value >= 100) return 'green.8';
  if (value >= 80) return 'yellow.8';
  return 'red.7';
}

export function Efficiency({ value }: { value: number | null | undefined }) {
  if (!isNumber(value)) return <>-</>;
  return (
    <Text span size="sm" fw={700} c={efficiencyColor(Math.round(value))}>
      {Math.round(value)}%
    </Text>
  );
}

export const efficiencyText = (value: number | null | undefined) =>
  isNumber(value) ? `${Math.round(value)}%` : '-';

export function BoldHours({ value }: { value: number | null | undefined }) {
  if (!isNumber(value)) return <>-</>;
  return (
    <Text span size="sm" fw={700} c="green.8">
      {formatNumber(value, 2)}
    </Text>
  );
}

/** Evet / Hayır pill; `empty` when the value is missing. */
export function YesNo({
  value,
  noColor = 'grey',
  empty = '-',
}: {
  value: boolean | null | undefined;
  noColor?: 'grey' | 'red';
  empty?: ReactNode;
}) {
  if (value === true) return <StatusBadge color="green">Evet</StatusBadge>;
  if (value === false) return <StatusBadge color={noColor}>Hayır</StatusBadge>;
  return <>{empty}</>;
}

export const yesNoText = (value: boolean | null | undefined) =>
  value === true ? 'Evet' : value === false ? 'Hayır' : '-';

/** Hours as numbers in the Excel file (legacy wrote "1.50" text). */
export const hoursExport = (value: number | null | undefined) => (isNumber(value) ? value : '-');

/** Local day, so a late-evening load in Istanbul does not pick the day before. */
export const localDay = (date: dayjs.Dayjs) => date.format(DAY);
