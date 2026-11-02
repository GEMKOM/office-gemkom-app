import { Badge, Button, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  notificationConfigErrorMessage,
  notificationConfigsQueryOptions,
  useResetNotificationConfigs,
  type NotificationConfig,
} from '@/api/it/notificationConfigs';
import { organizationGroupsQueryOptions } from '@/api/it/organizationGroups';
import { useUsers, type UserOption } from '@/api/reference/users';
import { useAuth } from '@/auth/AuthProvider';
import { formatDateTime } from '@/lib/format';
import { useAppNavigate } from '@/shell/AppLink';
import {
  confirm,
  DataTable,
  FaIcon,
  notify,
  PageHeader,
  StatusBadge,
  type DataTableColumn,
  type DataTableGrouping,
  type RowAction,
} from '@/ui';
import { ConfigEditModal } from './ConfigEditModal';
import {
  configRows,
  groupChoices,
  liveGroupOptions,
  orgUserGroupOptions,
  type ConfigRow,
} from './configRows';
import classes from './NotificationConfigsPage.module.css';

const EMPTY_USERS: UserOption[] = [];

function onOff(value: boolean) {
  return value ? (
    <StatusBadge color="green">
      <FaIcon icon="fas fa-check" /> Aktif
    </StatusBadge>
  ) : (
    <StatusBadge color="grey">
      <FaIcon icon="fas fa-times" /> Pasif
    </StatusBadge>
  );
}

const columns: DataTableColumn<ConfigRow>[] = [
  {
    key: 'label',
    header: 'Bildirim Türü',
    sortable: true,
    render: (row) => (
      <>
        <Text span size="sm" fw={600}>
          {row.label || '-'}
        </Text>
        {row.is_default ? (
          <Badge color="gray" variant="light" size="sm" ml={8}>
            Varsayılan
          </Badge>
        ) : null}
      </>
    ),
  },
  {
    key: 'always_notified',
    header: 'Otomatik Bildirilenler',
    width: 300,
    render: (row) =>
      row.always_notified ? (
        <Text span size="sm">
          <Text span c="dimmed">
            <FaIcon icon="fas fa-info-circle" />
          </Text>{' '}
          {row.always_notified}
        </Text>
      ) : (
        <Text span c="dimmed">
          -
        </Text>
      ),
  },
  {
    key: 'routing',
    header: 'Yönlendirme',
    width: 250,
    render: (row) => {
      if (!row.is_routable) {
        return (
          <Text span size="sm" c="dimmed">
            Yönlendirilemez
          </Text>
        );
      }
      if (row.routing === '-') {
        return (
          <Text span c="dimmed">
            -
          </Text>
        );
      }
      return <StatusBadge color="grey">{row.routing}</StatusBadge>;
    },
  },
  {
    key: 'default_send_email',
    header: 'E-posta',
    sortable: true,
    width: 100,
    exportValue: (row) => (row.default_send_email ? 'Aktif' : 'Pasif'),
    render: (row) => onOff(row.default_send_email),
  },
  {
    key: 'default_send_in_app',
    header: 'Uygulama İçi',
    sortable: true,
    width: 120,
    exportValue: (row) => (row.default_send_in_app ? 'Aktif' : 'Pasif'),
    render: (row) => onOff(row.default_send_in_app),
  },
  {
    key: 'updated_at',
    header: 'Son Güncelleme',
    sortable: true,
    width: 180,
    render: (row) => (
      <Text span size="sm" c="dimmed">
        {row.updated_at
          ? formatDateTime(row.updated_at, { day: 'numeric', month: 'short', year: 'numeric' })
          : '-'}
      </Text>
    ),
  },
];

// Legacy groupBy 'category' with its header formatter: the category's display
// name and a count; collapsible, open by default.
const grouping: DataTableGrouping<ConfigRow> = {
  by: 'category',
  header: (group) => {
    const display = group.rows[0]?.category_display || String(group.value ?? '') || 'Diğer';
    return (
      <span className={classes.groupHeader}>
        <strong>{display}</strong>
        <Badge color="gray" variant="filled" size="sm">
          {group.rows.length} bildirim
        </Badge>
      </span>
    );
  },
};

/** Port of it/notifications (notifications.js): the admin notification config list. */
export function NotificationConfigsPage() {
  const { isAdmin } = useAuth();
  const navigate = useAppNavigate();

  // Legacy sent non-admins back to /it/ with an error.
  useEffect(() => {
    if (!isAdmin) {
      notify.error('Bu sayfaya erişim yetkiniz bulunmamaktadır.');
      navigate('/it/', { replace: true });
    }
  }, [isAdmin, navigate]);

  const list = useQuery({ ...notificationConfigsQueryOptions(), enabled: isAdmin });
  const rows = useMemo(() => configRows(list.data), [list.data]);
  const choices = useMemo(() => groupChoices(list.data), [list.data]);
  useEffect(() => {
    if (list.isError) notify.error('Bildirim yapılandırmaları yüklenirken hata oluştu');
  }, [list.isError, list.errorUpdatedAt]);

  // Edit-modal pickers, loaded once like legacy loadUsers / org groups catalog.
  const usersQuery = useUsers({}, { enabled: isAdmin });
  const users = usersQuery.data ?? EMPTY_USERS;
  const groupsQuery = useQuery({ ...organizationGroupsQueryOptions(), enabled: isAdmin });
  const liveGroups = useMemo(() => liveGroupOptions(groupsQuery.data ?? []), [groupsQuery.data]);
  const orgUserGroups = useMemo(
    () => orgUserGroupOptions(groupsQuery.data ?? []),
    [groupsQuery.data],
  );

  const [editing, setEditing] = useState<NotificationConfig | null>(null);

  const reset = useResetNotificationConfigs();
  const resetAll = async () => {
    const ok = await confirm({
      title: 'Tümünü Sıfırla',
      message:
        'Tüm özel bildirim yapılandırmaları silinecek ve varsayılan değerlere dönecektir. ' +
        'Bu işlem geri alınamaz. Devam etmek istediğinizden emin misiniz?',
      confirmLabel: 'Tümünü Sıfırla',
      cancelLabel: 'İptal',
      danger: true,
    });
    if (!ok) return;
    try {
      const response = await reset.mutateAsync();
      notify.success(response?.message || 'Tüm yapılandırmalar varsayılan değerlere sıfırlandı');
    } catch (error) {
      console.error('Error resetting notification configs:', error);
      notify.error(
        notificationConfigErrorMessage(
          error,
          'reset notification configs',
          'Bildirim yapılandırmaları sıfırlanırken hata oluştu',
        ),
      );
    }
  };

  if (!isAdmin) return null;

  const rowActions = (): RowAction<ConfigRow>[] => [
    {
      key: 'edit',
      label: 'Düzenle',
      icon: 'fas fa-edit',
      color: 'primary',
      onClick: (row) => setEditing(row.raw_data),
    },
  ];

  const refresh = () => void list.refetch();
  const routable = rows.filter((r) => r.is_routable).length;

  return (
    <>
      <PageHeader
        title="Bildirim Yapılandırmaları"
        subtitle="Bildirim şablonlarını ve yönlendirmelerini yönetin"
        icon="fas fa-bell"
        backTo="/it/"
        stats={[
          {
            id: 'notification-config-count',
            label: 'Bildirim Türü',
            value: list.isPending ? '–' : rows.length,
          },
          {
            id: 'notification-routable-count',
            label: 'Yönlendirilebilir',
            value: list.isPending ? '–' : routable,
          },
        ]}
        actions={
          // Legacy's header Yenile is the table's Yenile button.
          <Button
            variant="default"
            leftSection={<FaIcon icon="fas fa-undo" />}
            onClick={() => void resetAll()}
            loading={reset.isPending}
          >
            Tümünü Sıfırla
          </Button>
        }
      />

      <DataTable
        title="Bildirim Yapılandırmaları"
        icon="fas fa-bell"
        data={rows}
        columns={columns}
        getRowId={(row) => row.id}
        loading={list.isFetching}
        grouping={grouping}
        rowActions={rowActions}
        emptyMessage="Bildirim yapılandırması bulunamadı."
        onRefresh={refresh}
      />

      {editing ? (
        <ConfigEditModal
          key={editing.notification_type}
          config={editing}
          users={users}
          groupChoices={choices}
          liveGroups={liveGroups}
          orgUserGroups={orgUserGroups}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </>
  );
}
