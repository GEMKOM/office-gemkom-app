import { ActionIcon, Group, Text, Tooltip } from '@mantine/core';
import type { WeldingTeam } from '@/api/welding/teams';
import { formatDateTime, toDate } from '@/lib/format';
import { FaIcon, notify, StatusBadge, type DataTableColumn } from '@/ui';
import { foremanName, memberNames, membersCount, type UsersById } from './teamFields';

/** Legacy copyMembersToClipboardFallback, for browsers without the async clipboard. */
function copyWithTextarea(text: string): boolean {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.top = '0';
  textarea.style.left = '0';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch (error) {
    console.error('Copy failed:', error);
  }
  document.body.removeChild(textarea);
  return copied;
}

function reportCopy(copied: boolean) {
  if (copied) notify.success('Üyeler kopyalandı');
  else notify.error('Üyeler kopyalanamadı');
}

/** Legacy copyMembersToClipboard. */
export function copyMembers(text: string) {
  if (!text) {
    notify.error('Kopyalanacak üye yok');
    return;
  }
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(
      () => reportCopy(true),
      () => reportCopy(copyWithTextarea(text)),
    );
    return;
  }
  reportCopy(copyWithTextarea(text));
}

/** Legacy formatMembers: the first two names, "+N" for the rest, and a copy button. */
function MembersCell({ names }: { names: string[] }) {
  if (names.length === 0) return <>-</>;
  const full = names.join(', ');
  return (
    <Group gap={8} wrap="nowrap">
      <Text size="sm" title={full}>
        {names.length <= 2 ? (
          full
        ) : (
          <>
            {names.slice(0, 2).join(', ')}{' '}
            <Text span size="sm" c="dimmed">
              +{names.length - 2}
            </Text>
          </>
        )}
      </Text>
      <Tooltip label="Üyeleri kopyala">
        <ActionIcon
          variant="subtle"
          color="gray"
          size="sm"
          aria-label="Üyeleri kopyala"
          onClick={(event) => {
            event.stopPropagation();
            copyMembers(full);
          }}
        >
          <FaIcon icon="fas fa-copy" />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}

/**
 * The legacy table's columns. Names of plain-id foremen and members come from
 * the user list, so the set is rebuilt when it arrives (memoize on `users`).
 */
export function weldingTeamColumns(users: UsersById): DataTableColumn<WeldingTeam>[] {
  return [
    {
      key: 'name',
      header: 'Ekip Adı',
      sortable: true,
      render: (row) => (
        <Text size="sm" fw={600}>
          {row.name || '-'}
        </Text>
      ),
    },
    {
      key: 'foreman',
      header: 'Ustabaşı',
      sortable: false,
      accessor: (row) => foremanName(row, users),
    },
    {
      key: 'members',
      header: 'Üyeler',
      sortable: false,
      accessor: (row) => memberNames(row, users).join(', '),
      render: (row) => <MembersCell names={memberNames(row, users)} />,
    },
    {
      key: 'members_count',
      header: 'Üye Sayısı',
      sortable: true,
      accessor: (row) => membersCount(row, users),
      render: (row) => String(membersCount(row, users)),
    },
    {
      key: 'is_active',
      header: 'Durum',
      sortable: true,
      render: (row) =>
        row.is_active ? (
          <StatusBadge color="green">Aktif</StatusBadge>
        ) : (
          <StatusBadge color="grey">Pasif</StatusBadge>
        ),
      exportValue: (row) => (row.is_active ? 'Aktif' : 'Pasif'),
    },
    {
      key: 'updated_at',
      header: 'Güncelleme',
      sortable: true,
      render: (row) => formatDateTime(row.updated_at),
      exportValue: (row) => toDate(row.updated_at),
    },
  ];
}
