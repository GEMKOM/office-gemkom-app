import { isSuperuser } from '@legacy/authService.js';
import { Alert, Button, Text } from '@mantine/core';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { qk } from '@/api';
import {
  deleteUser,
  hrUsersQueryOptions,
  impersonateUser,
  orgPositionsQueryOptions,
  positionLabel,
  type HrUser,
  type HrUsersParams,
} from '@/api/human_resources/users';
import {
  confirm,
  DataTable,
  FaIcon,
  FilterBar,
  fromOrdering,
  notify,
  PageHeader,
  toOrdering,
  useUrlFilters,
  type FilterConfig,
  type RowAction,
} from '@/ui';
import { useUserIssues, userIssue, visibleUserIssues } from '../dataQuality';
import { userColumns } from './columns';
import { UserCreateModal } from './UserCreateModal';
import { UserEditModal } from './UserEditModal';

// Filter keys follow the legacy request params. is_active starts at 'true'
// (legacy's default pick); cleared, it is left out and the backend lists the
// active accounts anyway. 'all' has to be sent explicitly.
const URL_DEFAULTS = {
  username: '',
  position: '',
  position_level: '',
  department_code: '',
  is_active: 'true',
  page: '1',
  page_size: '20',
  ordering: 'username',
  // A data check from the HR hub (dataQuality.tsx): lists the employees it
  // flags instead of the server page.
  issue: '',
};

type FilterKeys = 'username' | 'position' | 'position_level' | 'department_code' | 'is_active';
type FilterState = Record<FilterKeys, string>;

const FILTER_DEFAULTS: FilterState = {
  username: '',
  position: '',
  position_level: '',
  department_code: '',
  is_active: 'true',
};

const LEVEL_OPTIONS = [1, 2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: `Seviye ${n}` }));
const EMPTY_ROWS: HrUser[] = [];

function positiveInt(value: string, fallback: number): number {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Legacy table.js default file name: `<containerId>_<YYYY-MM-DD>`. */
function exportFileName() {
  return `users-table-container_${new Date().toISOString().split('T')[0]}`;
}

/** Port of human_resources/users (userList.js). */
export function UsersPage() {
  const queryClient = useQueryClient();
  const { values, apply } = useUrlFilters(URL_DEFAULTS);

  const filters = useMemo<FilterState>(
    () => ({
      username: values.username,
      position: values.position,
      position_level: values.position_level,
      department_code: values.department_code,
      is_active: values.is_active,
    }),
    [
      values.username,
      values.position,
      values.position_level,
      values.department_code,
      values.is_active,
    ],
  );
  const page = positiveInt(values.page, 1);
  const pageSize = positiveInt(values.page_size, 20);
  const sort = fromOrdering(values.ordering || 'username');
  const ordering = toOrdering(sort.sortBy, sort.sortDir) ?? 'username';

  const issue = useMemo(() => {
    const found = userIssue(values.issue);
    return found && visibleUserIssues().includes(found) ? found : undefined;
  }, [values.issue]);
  const [check] = useUserIssues(issue ? [issue] : []);

  const params: HrUsersParams = { page, page_size: pageSize, ...filters, ordering };
  const list = useQuery({
    ...hrUsersQueryOptions(params),
    placeholderData: keepPreviousData,
    enabled: !issue,
  });
  const rows = (issue ? check?.users : list.data?.results) ?? EMPTY_ROWS;
  const total = issue ? rows.length : (list.data?.count ?? 0);
  const pending = issue ? Boolean(check?.isPending) : list.isPending;

  useEffect(() => {
    if (list.isError) notify.error('Çalışanlar yüklenemedi');
  }, [list.isError, list.errorUpdatedAt]);
  const checkFailed = Boolean(check?.isError);
  useEffect(() => {
    if (checkFailed) notify.error('Veri kontrolü yüklenemedi');
  }, [checkFailed]);

  const positions = useQuery(orgPositionsQueryOptions());
  const filterConfig = useMemo<FilterConfig<FilterKeys>[]>(() => {
    const list = positions.data ?? [];
    const departments = new Map<string, string>();
    for (const p of list) {
      const code = p.department_code;
      if (code && !departments.has(code))
        departments.set(code, p.department_name ? String(p.department_name) : code);
    }
    return [
      { type: 'text', key: 'username', label: 'Kullanıcı Adı', placeholder: 'Ara...' },
      {
        type: 'select',
        key: 'position',
        label: 'Pozisyon',
        placeholder: 'Tüm Pozisyonlar',
        options: list.map((p) => ({ value: String(p.id), label: positionLabel(p) })),
      },
      {
        type: 'select',
        key: 'position_level',
        label: 'Seviye',
        placeholder: 'Tümü',
        searchable: false,
        options: LEVEL_OPTIONS,
      },
      {
        type: 'select',
        key: 'department_code',
        label: 'Departman',
        placeholder: 'Tüm Departmanlar',
        options: [...departments.entries()]
          .sort((a, b) => a[1].localeCompare(b[1], 'tr'))
          .map(([value, label]) => ({ value, label })),
      },
      {
        type: 'select',
        key: 'is_active',
        label: 'Durum',
        placeholder: 'Aktif',
        searchable: false,
        options: [
          { value: 'true', label: 'Aktif' },
          { value: 'false', label: 'Pasif' },
          { value: 'all', label: 'Tümü' },
        ],
      },
    ];
  }, [positions.data]);

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<HrUser | null>(null);

  const removeUser = async (row: HrUser) => {
    const ok = await confirm({
      title: 'Çalışan Silme Onayı',
      icon: 'fas fa-exclamation-triangle',
      message: `"${row.username}" kullanıcısını silmek istediğinize emin misiniz?`,
      confirmLabel: 'Sil',
      cancelLabel: 'İptal',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteUser(row.id);
      notify.success('Çalışan silindi');
      void queryClient.invalidateQueries({ queryKey: qk.users.all });
    } catch {
      notify.error('Çalışan silinirken hata oluştu');
    }
  };

  const impersonate = async (row: HrUser) => {
    const label = row.username ? `@${row.username}` : `ID ${row.id}`;
    const ok = await confirm({
      title: 'Impersonate',
      icon: 'fas fa-user-secret',
      message: `${label} kullanıcısı olarak impersonate yapmak istiyor musunuz?`,
      description: 'Bu işlem mevcut oturum tokenlarını değiştirir.',
    });
    if (!ok) return;
    try {
      notify.info('Impersonation başlatılıyor…');
      await impersonateUser(row.id);
    } catch (error) {
      if (error instanceof Error && error.message === 'FORBIDDEN') {
        notify.error('Bu işlem için superuser olmanız gerekir (403).');
        return;
      }
      notify.error(error, { fallback: 'Impersonation başlatılamadı' });
    }
  };

  const superuser = isSuperuser();
  const rowActions = (row: HrUser): RowAction<HrUser>[] => [
    {
      key: 'impersonate',
      label: 'Impersonate',
      icon: 'fas fa-user-secret',
      hidden: !superuser,
      onClick: (r) => void impersonate(r),
    },
    {
      key: 'edit',
      label: 'Düzenle',
      icon: 'fas fa-edit',
      color: 'primary',
      onClick: () => setEditing(row),
    },
    {
      key: 'delete',
      label: 'Sil',
      icon: 'fas fa-trash',
      color: 'danger',
      onClick: (r) => void removeUser(r),
    },
  ];

  return (
    <>
      <PageHeader
        title="Çalışanlar"
        subtitle="Çalışan listesi ve yönetimi"
        icon="users"
        backTo="/human_resources/"
        stats={[
          {
            id: 'total-users-count',
            label: 'Toplam',
            value: pending ? '–' : total.toLocaleString('tr-TR'),
          },
        ]}
        actions={
          <Button leftSection={<FaIcon icon="fas fa-plus" />} onClick={() => setCreating(true)}>
            Yeni Çalışan
          </Button>
        }
      />

      {issue ? (
        <Alert
          mb="md"
          color="yellow"
          icon={<FaIcon icon={issue.icon} />}
          title={`Veri kontrolü: ${issue.label}`}
          data-testid="user-issue"
        >
          <Text size="sm">
            {issue.hint}. Aktif çalışanlardan bu kontrole takılanlar listeleniyor; düzenleyince
            listeden düşerler.
          </Text>
          <Button
            mt="xs"
            size="xs"
            variant="default"
            onClick={() => apply({ issue: '', page: '1' })}
          >
            Tüm Çalışanlar
          </Button>
        </Alert>
      ) : null}

      <DataTable
        title={issue ? issue.label : 'Çalışan Listesi'}
        filters={
          issue ? undefined : (
            <FilterBar
              inline
              filters={filterConfig}
              values={filters}
              onApply={(next) => apply({ ...next, page: '1' })}
              onClear={() => apply({ ...FILTER_DEFAULTS, page: '1' })}
            />
          )
        }
        data={rows}
        columns={userColumns}
        getRowId={(row) => String(row.id)}
        loading={issue ? Boolean(check?.isPending) : list.isFetching}
        sortable
        // A data check holds every flagged row: sorted and paged here.
        sort={
          issue
            ? undefined
            : {
                sortBy: sort.sortBy,
                sortDir: sort.sortDir,
                onSortChange: (sortBy, sortDir) =>
                  apply({ ordering: toOrdering(sortBy, sortDir) ?? 'username', page: '1' }),
              }
        }
        pagination={
          issue
            ? { pageSize: 20 }
            : {
                page,
                pageSize,
                total,
                onPageChange: (next) => apply({ page: String(next) }),
                onPageSizeChange: (size) => apply({ page_size: String(size), page: '1' }),
              }
        }
        rowActions={rowActions}
        extraData={superuser}
        emptyMessage={
          <Text size="sm">{issue ? 'Bu kontrole takılan çalışan yok' : 'Çalışan bulunamadı'}</Text>
        }
        onRefresh={() => void (issue ? check?.refetch() : list.refetch())}
        exportable={{ fileName: exportFileName() }}
      />

      {creating ? (
        <UserCreateModal
          positions={positions.data ?? []}
          onClose={() => setCreating(false)}
          // Legacy goes back to page 1 after a create.
          onSaved={() => apply({ page: '1' })}
        />
      ) : null}

      {editing ? (
        <UserEditModal
          key={editing.id}
          user={editing}
          positions={positions.data ?? []}
          onClose={() => setEditing(null)}
          initialTab={issue?.tab}
        />
      ) : null}
    </>
  );
}
