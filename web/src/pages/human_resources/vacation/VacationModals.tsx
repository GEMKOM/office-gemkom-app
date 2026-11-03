import { Grid, Paper, Table, Text, Textarea } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import {
  leaveDurationLabel,
  leaveTypeLabel,
  vacationRequestQueryOptions,
} from '@/api/general/vacation';
import {
  leaveLedgerQueryOptions,
  useHrVacationDecision,
  type HrVacationRequest,
} from '@/api/human_resources/leave';
import { formatDateTime } from '@/lib/format';
import { DetailModal, FormModal, notify, type DetailField } from '@/ui';
import {
  ApprovalFlow,
  ApprovalKindBadge,
  formatClock,
  formatVacationDate,
  RequestStatusBadge,
  resolveRequestKind,
} from './vacationParts';

/** "İzin Talebi Detayı": loads the request, over the row it was opened from. */
export function HrVacationDetailModal({
  row,
  onClose,
}: {
  row: HrVacationRequest;
  onClose: () => void;
}) {
  const detail = useQuery(vacationRequestQueryOptions(row.id));

  useEffect(() => {
    if (!detail.isError) return;
    notify.error(detail.error, { fallback: 'Talep detayı yüklenemedi.' });
    onClose();
  }, [detail.isError, detail.error, onClose]);

  // Legacy opened the modal once the request had loaded.
  if (!detail.data) return null;
  const request = { ...row, ...detail.data } as HrVacationRequest;
  const kind = resolveRequestKind(request, row);
  const showCancellationReason =
    kind === 'cancellation_request' ||
    request.status === 'cancellation_requested' ||
    Boolean(request.cancellation_reason);

  const general: DetailField[] = [
    { label: 'Talep No', value: `#${request.id || '-'}`, span: 3 },
    { label: 'Durum', render: <RequestStatusBadge request={request} />, span: 3 },
    { label: 'İşlem Tipi', render: <ApprovalKindBadge kind={kind} />, span: 3 },
    { label: 'İzin Türü', value: leaveTypeLabel(request), span: 3 },
    { label: 'Süre', value: leaveDurationLabel(request), span: 3 },
    {
      label: 'Başlangıç',
      value: formatVacationDate(request.start_date, request.start_time),
      span: 3,
    },
    { label: 'Bitiş', value: formatVacationDate(request.end_date, request.end_time), span: 3 },
    {
      label: 'Saat Aralığı',
      value: `${formatClock(request.start_time)} - ${formatClock(request.end_time)}`,
      span: 3,
      hidden: !(request.start_time && request.end_time),
    },
    {
      label: 'Şirket Tatili',
      type: 'boolean',
      value: true,
      span: 3,
      hidden: !request.is_company_holiday,
    },
  ];

  return (
    <DetailModal
      opened
      onClose={onClose}
      title="İzin Talebi Detayı"
      icon="fas fa-calendar-alt"
      size="xl"
      sections={[
        { title: 'Genel Bilgiler', icon: 'fas fa-info-circle', fields: general },
        {
          title: 'Çalışan',
          icon: 'fas fa-user',
          fields: [
            {
              label: 'Ad Soyad',
              value: request.requester_full_name || request.requester_username || '-',
              span: 4,
            },
            { label: 'Kullanıcı Adı', value: request.requester_username || '-', span: 4 },
            { label: 'Takım', value: request.team_label || request.team || '-', span: 4 },
          ],
        },
        {
          title: 'Notlar',
          icon: 'fas fa-sticky-note',
          fields: [
            { label: 'Talep Gerekçesi', value: request.reason || 'Belirtilmemiş', span: 12 },
            {
              label: 'İptal Gerekçesi',
              value: request.cancellation_reason || 'Belirtilmemiş',
              span: 12,
              hidden: !showCancellationReason,
            },
            { label: 'Oluşturulma', value: formatDateTime(request.created_at), span: 6 },
            { label: 'Son Güncelleme', value: formatDateTime(request.updated_at), span: 6 },
          ],
        },
        {
          title: 'Onay Akışı',
          icon: 'fas fa-tasks',
          content: <ApprovalFlow request={request} />,
        },
      ]}
    />
  );
}

const text = (value: unknown, fallback = '-') =>
  value === null || value === undefined || value === '' ? fallback : String(value);

function SummaryBox({ label, value }: { label: string; value: string }) {
  return (
    <Paper withBorder p="xs" radius="sm">
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text fw={700}>{value}</Text>
    </Paper>
  );
}

/** "İzin Defteri": the user's balance and every ledger movement. */
export function LeaveLedgerModal({ userId, onClose }: { userId: number; onClose: () => void }) {
  const ledger = useQuery(leaveLedgerQueryOptions(userId));

  useEffect(() => {
    if (ledger.isError) notify.error(ledger.error, { fallback: 'İzin hareketleri yüklenemedi.' });
  }, [ledger.isError, ledger.error]);

  const data = ledger.data;
  const balance = data?.current_balance;
  const entries = Array.isArray(data?.entries) ? data.entries : [];
  // A failed load shows the empty view, as legacy cleared it.
  const loaded = Boolean(data);

  return (
    <DetailModal
      opened
      onClose={onClose}
      title="İzin Defteri"
      icon="fas fa-book"
      size="xl"
      loading={ledger.isPending}
      sections={[
        {
          content: (
            <>
              <Grid gap="xs" mb="md">
                <Grid.Col span={{ base: 12, md: 3 }}>
                  <SummaryBox label="Kullanıcı" value={text(data?.username)} />
                </Grid.Col>
                <Grid.Col span={{ base: 12, md: 3 }}>
                  <SummaryBox
                    label="Toplam Gün"
                    value={loaded ? text(balance?.total_days || '0') : '-'}
                  />
                </Grid.Col>
                <Grid.Col span={{ base: 12, md: 3 }}>
                  <SummaryBox
                    label="Kullanılan"
                    value={loaded ? text(balance?.used_days || '0') : '-'}
                  />
                </Grid.Col>
                <Grid.Col span={{ base: 12, md: 3 }}>
                  <SummaryBox
                    label="Kalan"
                    value={loaded ? text(balance?.remaining_days || '0') : '-'}
                  />
                </Grid.Col>
              </Grid>

              <Table.ScrollContainer minWidth={700}>
                <Table striped highlightOnHover verticalSpacing="xs" fz="sm">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Tarih</Table.Th>
                      <Table.Th>İşlem</Table.Th>
                      <Table.Th>Delta</Table.Th>
                      <Table.Th>Bakiye Sonrası</Table.Th>
                      <Table.Th>Not</Table.Th>
                      <Table.Th>Oluşturan</Table.Th>
                      <Table.Th>Talep</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {entries.length === 0 ? (
                      <Table.Tr>
                        <Table.Td colSpan={7} ta="center" c="dimmed" py="lg">
                          {loaded ? 'Hareket bulunamadı.' : 'Kayıt bulunamadı.'}
                        </Table.Td>
                      </Table.Tr>
                    ) : (
                      entries.map((entry, index) => (
                        <Table.Tr key={index}>
                          <Table.Td>{text(entry.date)}</Table.Td>
                          <Table.Td>{text(entry.kind_label || entry.kind)}</Table.Td>
                          <Table.Td>
                            <strong>{text(entry.delta)}</strong>
                          </Table.Td>
                          <Table.Td>{text(entry.balance_after)}</Table.Td>
                          <Table.Td>{text(entry.note)}</Table.Td>
                          <Table.Td>{text(entry.created_by)}</Table.Td>
                          <Table.Td>
                            {entry.request
                              ? `#${entry.request.id || '-'} (${entry.request.start_date || '-'} → ${entry.request.end_date || '-'})`
                              : '-'}
                          </Table.Td>
                        </Table.Tr>
                      ))
                    )}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            </>
          ),
        },
      ]}
    />
  );
}

/** The reject modal, for a workflow approval or a cancellation request. */
export function RejectVacationModal({
  request,
  onClose,
  onDone,
}: {
  request: HrVacationRequest;
  onClose: () => void;
  onDone: () => void;
}) {
  const [comment, setComment] = useState('');
  const decide = useHrVacationDecision();
  const kind = request.kind || 'workflow_approval';
  const isCancellation = kind === 'cancellation_request';

  const reject = async () => {
    try {
      await decide.mutateAsync({
        id: request.id,
        kind,
        decision: 'reject',
        comment: comment.trim(),
      });
      notify.success(isCancellation ? 'İptal talebi reddedildi.' : 'İzin talebi reddedildi.');
      onDone();
      onClose();
    } catch (error) {
      // Legacy forgot the request after a failure, so a second click did nothing;
      // the modal stays usable here.
      notify.error(error, { fallback: 'Reddetme işlemi başarısız.' });
    }
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title={isCancellation ? 'İptal Talebini Reddet' : 'İzin Talebini Reddet'}
      subtitle={`#${request.id} · ${request.requester_username || '-'}`}
      icon="fas fa-times-circle"
      size="md"
      submitLabel={decide.isPending ? 'Reddediliyor...' : 'Reddet'}
      submitIcon="fas fa-times"
      submitting={decide.isPending}
      onSubmit={() => void reject()}
    >
      <Textarea
        label="Yorum (opsiyonel)"
        rows={4}
        maxLength={500}
        value={comment}
        onChange={(event) => setComment(event.currentTarget.value)}
        data-autofocus
      />
    </FormModal>
  );
}
