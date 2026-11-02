import { Center, Stack, Text, Title } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { departmentLabel } from '@/api/human_resources/organization';
import { passwordResetsQueryOptions, type PasswordResetRequest } from '@/api/it/passwordResets';
import { useAuth } from '@/auth/AuthProvider';
import { DataTable, notify, PageHeader, type DataTableColumn, type RowAction } from '@/ui';
import { PasswordResetModal } from './PasswordResetModal';

const EMPTY_ROWS: PasswordResetRequest[] = [];

// Legacy columns, all sortable on the loaded rows (no pagination).
const columns: DataTableColumn<PasswordResetRequest>[] = [
  { key: 'username', header: 'Kullanıcı Adı', width: '15%' },
  { key: 'first_name', header: 'Ad', width: '15%' },
  { key: 'last_name', header: 'Soyad', width: '15%' },
  { key: 'email', header: 'E-posta', width: '20%' },
  // Legacy read `team`; the backend now sends `department_code` instead.
  {
    key: 'department_code',
    header: 'Departman',
    width: '10%',
    accessor: (row) => departmentLabel(row.department_code),
  },
];

/** Port of it/password-resets (password-resets.js). Admins only, as legacy. */
export function PasswordResetsPage() {
  const { isAdmin } = useAuth();
  const list = useQuery({ ...passwordResetsQueryOptions(), enabled: isAdmin });
  const [resetting, setResetting] = useState<PasswordResetRequest | null>(null);

  useEffect(() => {
    if (list.isError) notify.error('Şifre sıfırlama talepleri yüklenemedi');
  }, [list.isError, list.errorUpdatedAt]);

  if (!isAdmin) {
    // Legacy alerted and left for the login page; the shell's denial screen in words.
    return (
      <Center mih="60vh">
        <Stack align="center" gap="xs">
          <Title order={2}>Erişim yetkiniz yok</Title>
          <Text c="dimmed">
            Bu sayfaya erişim yetkiniz bulunmamaktadır. Sadece yöneticiler admin paneline erişebilir.
          </Text>
        </Stack>
      </Center>
    );
  }

  const rows = list.data ?? EMPTY_ROWS;
  const rowActions = (): RowAction<PasswordResetRequest>[] => [
    {
      key: 'reset-password',
      label: 'Şifreyi Sıfırla',
      icon: 'fas fa-key',
      color: 'warning',
      onClick: (row) => setResetting(row),
    },
  ];

  return (
    <>
      <PageHeader
        title="Şifre Sıfırlama Talepleri"
        subtitle="Kullanıcı şifre sıfırlama taleplerini görüntüleyin ve yönetin"
        icon="fas fa-key"
        backTo="/it/"
        stats={[
          { id: 'password-reset-count', label: 'Bekleyen Talep', value: list.isPending ? '–' : rows.length },
        ]}
      />

      <DataTable
        title="Talepler"
        icon="fas fa-key"
        data={rows}
        columns={columns}
        getRowId={(row) => String(row.id)}
        loading={list.isFetching}
        sortable
        striped
        rowActions={rowActions}
        emptyMessage="Şifre sıfırlama talebi bulunamadı"
        onRefresh={() => void list.refetch()}
      />

      {resetting ? (
        <PasswordResetModal key={resetting.id} user={resetting} onClose={() => setResetting(null)} />
      ) : null}
    </>
  );
}
