import { Button, Group, Table } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect, type ReactNode } from 'react';
import { materialTrackingErrorMessage } from '@/api/materialTracking/errors';
import {
  materialPullRequestQueryOptions,
  useCancelMaterialPullRequest,
  type MaterialPullRequest,
} from '@/api/materialTracking/pullRequests';
import type { AuthUser } from '@/auth/authService';
import { formatDateTime } from '@/lib/format';
import {
  confirm,
  DetailModal,
  FaIcon,
  notify,
  StatusBadge,
  type DetailSection,
  type StatusFamily,
} from '@/ui';
import uiClasses from '@/ui/ui.module.css';
import { DeliveryState, fmtQty, qty } from './deliveryState';

// Pull request pieces shared by Malzeme takibi and Depo Çekme Talepleri: the
// status pill, the destination cell, who may cancel, the cancel confirm and
// the detail modal.

const STATUS_LABELS: Record<string, string> = {
  pending: 'Beklemede',
  transferred: 'Teslim Edildi',
  cancelled: 'İptal Edildi',
};
const STATUS_FAMILIES: Record<string, StatusFamily> = {
  pending: 'orange',
  transferred: 'green',
  cancelled: 'grey',
};

export function PullRequestStatusBadge({ status, label }: { status?: string; label?: string }) {
  const text = label || (status ? STATUS_LABELS[status] : undefined) || status || '-';
  return <StatusBadge color={(status && STATUS_FAMILIES[status]) || 'grey'}>{text}</StatusBadge>;
}

export function DestinationCell({
  request,
}: {
  request: Pick<MaterialPullRequest, 'destination_type' | 'destination_name'>;
}) {
  return (
    <Group gap={6} wrap="nowrap">
      <span>{request.destination_name || '-'}</span>
      {request.destination_type === 'subcontractor' ? (
        <StatusBadge color="purple">Taşeron</StatusBadge>
      ) : (
        <StatusBadge color="blue">Ekip</StatusBadge>
      )}
    </Group>
  );
}

/** Pending only, by an admin or by whoever asked for it (legacy canCancel). */
export function canCancelPullRequest(
  request: Pick<MaterialPullRequest, 'status' | 'requested_by'> | null | undefined,
  user: AuthUser | null | undefined,
  isAdmin: boolean,
): boolean {
  if (!request || request.status !== 'pending') return false;
  return isAdmin || (Boolean(user) && user?.id === request.requested_by);
}

/** Confirm, then cancel; resolves true when the request was cancelled. */
export function useCancelPullRequestFlow() {
  const cancel = useCancelMaterialPullRequest();
  return async (request: Pick<MaterialPullRequest, 'id' | 'number'>): Promise<boolean> => {
    const ok = await confirm({
      title: 'Depo Çekme Talebini İptal Et',
      icon: 'fas fa-ban',
      message: `${request.number} numaralı depo çekme talebini iptal etmek istediğinize emin misiniz?`,
      confirmLabel: 'Evet, İptal Et',
      cancelLabel: 'Vazgeç',
      danger: true,
    });
    if (!ok) return false;
    try {
      await cancel.mutateAsync(request.id);
      notify.success('Depo çekme talebi iptal edildi');
      return true;
    } catch (error) {
      notify.error(
        materialTrackingErrorMessage(
          error,
          'Depo çekme talebi iptal edilirken hata oluştu',
          'Talep iptal edilirken hata oluştu',
        ),
      );
      return false;
    }
  };
}

function personAt(name: string | undefined, at: string | null | undefined) {
  return `${name || '-'} — ${formatDateTime(at)}`;
}

function ItemsTable({ request, ledger }: { request: MaterialPullRequest; ledger: boolean }) {
  const items = request.items ?? [];
  const head = ledger ? (
    <Table.Tr>
      <Table.Th>Ürün Kodu</Table.Th>
      <Table.Th>Ürün Adı</Table.Th>
      <Table.Th>İş No</Table.Th>
      <Table.Th ta="right">Bu Talep</Table.Th>
      <Table.Th>Teslim</Table.Th>
      <Table.Th ta="right" title="Planlama kalemi için depoya giren toplam">
        Teslim Alınan
      </Table.Th>
      <Table.Th ta="right" title="İptal edilmemiş tüm çekme talepleri (bu talep dahil)">
        Çekilen
      </Table.Th>
      <Table.Th ta="right" title="Depoda hâlâ çekilebilir miktar">
        Depoda Kalan
      </Table.Th>
    </Table.Tr>
  ) : (
    <Table.Tr>
      <Table.Th>Ürün Kodu</Table.Th>
      <Table.Th>Ürün Adı</Table.Th>
      <Table.Th>İş No</Table.Th>
      <Table.Th>Miktar</Table.Th>
      <Table.Th>Birim</Table.Th>
      <Table.Th>Teslim Alındı mı</Table.Th>
    </Table.Tr>
  );
  const optionalQty = (value: string | number | null | undefined) =>
    value != null ? fmtQty(value) : '-';

  return (
    <Table.ScrollContainer minWidth={ledger ? 760 : 560}>
      <Table verticalSpacing="xs" fz="sm">
        <Table.Thead>{head}</Table.Thead>
        <Table.Tbody>
          {items.length === 0 ? (
            <Table.Tr>
              <Table.Td colSpan={ledger ? 8 : 6} ta="center" c="dimmed">
                Kalem yok
              </Table.Td>
            </Table.Tr>
          ) : (
            items.map((item, index) => {
              const delivery = (
                <DeliveryState
                  row={{
                    is_delivered: item.is_delivered,
                    delivered_quantity: item.delivered_quantity,
                    quantity: item.planning_quantity,
                    item_unit: item.item_unit,
                  }}
                />
              );
              return ledger ? (
                <Table.Tr key={item.id ?? index}>
                  <Table.Td className={uiClasses.code}>{item.item_code || '-'}</Table.Td>
                  <Table.Td>{item.item_name || '-'}</Table.Td>
                  <Table.Td>{item.job_no || '-'}</Table.Td>
                  <Table.Td ta="right" fw={600}>
                    {`${fmtQty(item.quantity)} ${item.item_unit || ''}`.trim()}
                  </Table.Td>
                  <Table.Td>{delivery}</Table.Td>
                  <Table.Td ta="right">{optionalQty(item.delivered_quantity)}</Table.Td>
                  <Table.Td ta="right">{optionalQty(item.pulled_quantity)}</Table.Td>
                  <Table.Td
                    ta="right"
                    c={qty(item.quantity_available_to_pull) > 0 ? 'green.7' : 'dimmed'}
                  >
                    {optionalQty(item.quantity_available_to_pull)}
                  </Table.Td>
                </Table.Tr>
              ) : (
                <Table.Tr key={item.id ?? index}>
                  <Table.Td className={uiClasses.code}>{item.item_code || '-'}</Table.Td>
                  <Table.Td>{item.item_name || '-'}</Table.Td>
                  <Table.Td>{item.job_no || '-'}</Table.Td>
                  <Table.Td>{item.quantity ?? '-'}</Table.Td>
                  <Table.Td>{item.item_unit || '-'}</Table.Td>
                  <Table.Td>{delivery}</Table.Td>
                </Table.Tr>
              );
            })
          )}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}

export interface PullRequestDetailModalProps {
  /** null: closed. */
  requestId: number | null;
  onClose: () => void;
  user: AuthUser | null | undefined;
  isAdmin: boolean;
  /**
   * The Depo Çekme Talepleri layout: the warehouse ledger columns per line,
   * usernames as a fallback and `Kalemler (n)`.
   */
  ledger?: boolean;
  /** Shows "Excel'e Aktar" in the footer. */
  onExport?: (request: MaterialPullRequest) => void;
}

/** Port of showPullRequestDetail / showDetail (DisplayModal) of both pages. */
export function PullRequestDetailModal({
  requestId,
  onClose,
  user,
  isAdmin,
  ledger = false,
  onExport,
}: PullRequestDetailModalProps) {
  const detail = useQuery({
    ...materialPullRequestQueryOptions(requestId ?? 0),
    enabled: requestId !== null,
  });
  const cancelFlow = useCancelPullRequestFlow();
  const request = requestId !== null ? detail.data : undefined;

  useEffect(() => {
    if (requestId === null || !detail.isError) return;
    notify.error(
      materialTrackingErrorMessage(
        detail.error,
        'Depo çekme talebi yüklenirken hata oluştu',
        'Talep detayı yüklenemedi',
      ),
    );
    onClose();
  }, [requestId, detail.isError, detail.error, onClose]);

  const sections: DetailSection[] = request
    ? [
        {
          title: 'Genel Bilgiler',
          icon: 'fas fa-info-circle',
          fields: [
            {
              label: 'Talep No',
              span: 4,
              render: <span className={uiClasses.code}>{request.number || '-'}</span>,
            },
            {
              label: 'Durum',
              span: 4,
              render: (
                <PullRequestStatusBadge status={request.status} label={request.status_label} />
              ),
            },
            { label: 'Hedef', span: 4, render: <DestinationCell request={request} /> },
            {
              label: 'Talep Eden',
              span: 6,
              value: personAt(
                request.requested_by_name || (ledger ? request.requested_by_username : undefined),
                request.requested_at,
              ),
            },
            {
              label: 'Teslim Eden',
              span: 6,
              hidden: !request.confirmed_by,
              value: personAt(
                request.confirmed_by_name || (ledger ? request.confirmed_by_username : undefined),
                request.confirmed_at,
              ),
            },
            {
              label: 'İptal Eden',
              span: 6,
              hidden: !request.cancelled_by,
              value: personAt(request.cancelled_by_name, request.cancelled_at),
            },
            { label: 'Not', span: 12, value: request.note || '-' },
          ],
        },
        {
          title: ledger ? `Kalemler (${request.items?.length ?? 0})` : 'Kalemler',
          icon: 'fas fa-list',
          content: <ItemsTable request={request} ledger={ledger} />,
        },
      ]
    : [];

  let footerActions: ReactNode = null;
  if (request) {
    footerActions = (
      <>
        {onExport ? (
          <Button
            variant="default"
            leftSection={<FaIcon icon="fas fa-file-excel" />}
            onClick={() => onExport(request)}
          >
            Excel&apos;e Aktar
          </Button>
        ) : null}
        {canCancelPullRequest(request, user, isAdmin) ? (
          <Button
            color="red"
            variant="light"
            leftSection={<FaIcon icon="fas fa-ban" />}
            onClick={() => {
              // Legacy hides the detail before asking.
              onClose();
              void cancelFlow(request);
            }}
          >
            Talebi İptal Et
          </Button>
        ) : null}
      </>
    );
  }

  return (
    <DetailModal
      opened={requestId !== null && !detail.isError}
      onClose={onClose}
      title={request ? `Depo Çekme Talebi — ${request.number}` : 'Depo Çekme Talebi'}
      icon="fas fa-dolly"
      size="lg"
      loading={requestId !== null && detail.isPending}
      sections={sections}
      footerActions={footerActions}
    />
  );
}
