import { Badge, Button, Grid, Group, Stack, Text, TextInput } from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import {
  leaveSetupKey,
  leaveSetupQueryOptions,
  patchLeaveSetup,
  userVacationRequestsQueryOptions,
  type LeaveSetup,
  type VacationRequest,
} from '@/api/human_resources/leave';
import { formatDate } from '@/lib/format';
import {
  DataTable,
  FaIcon,
  notify,
  StatusBadge,
  type DataTableColumn,
  type StatusFamily,
} from '@/ui';

function statusFamily(status: string | undefined): StatusFamily {
  if (status === 'approved') return 'green';
  if (status === 'submitted') return 'yellow';
  if (status === 'rejected' || status === 'cancelled') return 'red';
  return 'grey';
}

/** Legacy leaveApprovalInfo: the open stage of a submitted request. */
function ApprovalInfo({ request }: { request: VacationRequest }) {
  const approval = request.approval;
  if (!approval || request.status !== 'submitted')
    return (
      <Text c="dimmed" span size="sm">
        -
      </Text>
    );
  const stages = Array.isArray(approval.stage_instances) ? approval.stage_instances : [];
  const current = stages.find((s) => !s?.is_complete && !s?.is_rejected);
  if (!current) {
    return (
      <Text c="green" size="sm" span>
        <FaIcon icon="fas fa-check-circle" /> Tamamlandı
      </Text>
    );
  }
  const remaining = Math.max(
    0,
    Number(current.required_approvals || 0) - Number(current.approved_count || 0),
  );
  return (
    <div style={{ lineHeight: 1.2 }}>
      <Text size="sm" fw={600} c="red.7">
        {current.name || 'Onay'}
      </Text>
      <Text size="xs" c="dimmed">
        {remaining} onay bekleniyor
      </Text>
    </div>
  );
}

const requestColumns: DataTableColumn<VacationRequest>[] = [
  {
    key: 'id',
    header: 'Talep No',
    render: (row) => <strong>#{row.id || '-'}</strong>,
  },
  {
    key: 'leave_type_label',
    header: 'Tür',
    render: (row) => row.leave_type_label || row.leave_type || '-',
  },
  { key: 'start_date', header: 'Başlangıç', render: (row) => formatDate(row.start_date) },
  { key: 'end_date', header: 'Bitiş', render: (row) => formatDate(row.end_date) },
  {
    key: 'duration_days',
    header: 'Süre (gün)',
    render: (row) => String(row.duration_days || '0.0'),
  },
  {
    key: 'approval',
    header: 'Onay',
    sortable: false,
    render: (row) => <ApprovalInfo request={row} />,
  },
  {
    key: 'status',
    header: 'Durum',
    render: (row) => (
      <StatusBadge color={statusFamily(row.status)}>
        {row.status_label || row.status || '-'}
      </StatusBadge>
    ),
  },
  { key: 'created_at', header: 'Oluşturulma', render: (row) => formatDate(row.created_at) },
];

const NO_REQUESTS: VacationRequest[] = [];

/** Port of the İzinler tab: leave entitlement (saves itself) and the request history. */
export function LeaveTab({ userId }: { userId: number }) {
  const queryClient = useQueryClient();
  const setup = useQuery(leaveSetupQueryOptions(userId));
  const requests = useQuery(userVacationRequestsQueryOptions(userId));

  useEffect(() => {
    if (setup.isError) notify.error(setup.error, { fallback: 'İzin tanımı yüklenemedi' });
  }, [setup.isError, setup.error]);
  useEffect(() => {
    if (requests.isError) notify.error(requests.error, { fallback: 'İzin talepleri yüklenemedi' });
  }, [requests.isError, requests.error]);

  return (
    <Stack gap="md">
      <Text fw={600}>İzin Tanımı</Text>
      <LeaveSetupForm
        // Starts again from the server values after each load.
        key={setup.dataUpdatedAt}
        userId={userId}
        setup={setup.data ?? null}
        loaded={setup.isSuccess}
        onSaved={() => void queryClient.invalidateQueries({ queryKey: leaveSetupKey(userId) })}
      />

      <Group justify="space-between">
        <Text fw={600}>İzin Talep Geçmişi</Text>
        <Button
          size="xs"
          variant="default"
          leftSection={<FaIcon icon="fas fa-sync-alt" />}
          onClick={() => void requests.refetch()}
        >
          Yenile
        </Button>
      </Group>
      <DataTable
        title="İzin Talepleri"
        icon="fas fa-calendar-check"
        data={requests.data ?? NO_REQUESTS}
        columns={requestColumns}
        getRowId={(row) => String(row.id)}
        loading={requests.isFetching}
        sortable
        emptyMessage="İzin talebi bulunamadı."
      />
    </Stack>
  );
}

function LeaveSetupForm({
  userId,
  setup,
  loaded,
  onSaved,
}: {
  userId: number;
  setup: LeaveSetup | null;
  loaded: boolean;
  onSaved: () => void;
}) {
  const [hireDate, setHireDate] = useState(setup?.hire_date || '');
  const [totalDays, setTotalDays] = useState(
    setup?.total_days != null ? String(setup.total_days) : '',
  );
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const total = Number(totalDays);
    if (!hireDate) {
      notify.warning('İşe giriş tarihi gereklidir');
      return;
    }
    if (!Number.isFinite(total) || total < 0) {
      notify.warning('Toplam gün 0 veya daha büyük olmalıdır');
      return;
    }
    setSaving(true);
    try {
      await patchLeaveSetup(userId, { hire_date: hireDate, total_days: total.toFixed(1) });
      notify.success('İzin tanımı güncellendi');
      onSaved();
    } catch (error) {
      notify.error(error, { fallback: 'İzin tanımı güncellenemedi' });
    } finally {
      setSaving(false);
    }
  };

  const summary = (value: string | number | null | undefined) =>
    loaded ? String(value ?? '0.0') : '-';

  return (
    <Grid gap="sm" align="flex-end">
      <Grid.Col span={{ base: 12, md: 3 }}>
        <TextInput
          size="xs"
          label="İşe Giriş Tarihi"
          type="date"
          value={hireDate}
          onChange={(e) => setHireDate(e.currentTarget.value)}
        />
      </Grid.Col>
      <Grid.Col span={{ base: 12, md: 3 }}>
        <TextInput
          size="xs"
          label="Toplam Gün"
          type="number"
          step={0.1}
          min={0}
          value={totalDays}
          onChange={(e) => setTotalDays(e.currentTarget.value)}
        />
      </Grid.Col>
      <Grid.Col span={{ base: 12, md: 2 }}>
        <Button
          size="xs"
          fullWidth
          loading={saving}
          leftSection={<FaIcon icon="fas fa-save" />}
          onClick={() => void save()}
        >
          Kaydet
        </Button>
      </Grid.Col>
      <Grid.Col span={{ base: 12, md: 4 }}>
        <Text size="xs" c="dimmed" mb={4}>
          Özet
        </Text>
        <Group gap="xs">
          <Badge variant="default" tt="none">
            Kullanılan: <strong>{summary(setup?.used_days)}</strong>
          </Badge>
          <Badge variant="default" tt="none">
            Kalan: <strong>{summary(setup?.remaining_days)}</strong>
          </Badge>
        </Group>
      </Grid.Col>
    </Grid>
  );
}
