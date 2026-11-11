import { Badge, Button, Card, Group, SimpleGrid, Stack, Text } from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { hasPerm } from '@/auth/authService';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  currencyRatesQueryOptions,
  purchaseRequestKeys,
  purchaseRequestQueryOptions,
  type ApprovalInfo,
  type PurchaseRequestDetail,
} from '@/api/procurement/purchaseRequests';
import { formatDateTime } from '@/lib/format';
import { NeoAskButton } from '@/neo';
import { DetailModal, FaIcon, FileAttachments, notify, type DetailSection } from '@/ui';
import { AdjustPricesModal, hasAdjustableOffers } from './AdjustPricesModal';
import { toAttachment } from './badges';
import {
  comparisonFromRequest,
  financialSummary,
  formatMoneyOrDash,
  type ComparisonItem,
} from './comparison';
import { ComparisonTable } from './ComparisonTable';

// The "Talep Detayları" modal of pending.js and registry.js (one copy: the
// pages differ only by the Onay Süreci section and their footer buttons).

export interface RequestDetailsModalProps {
  requestId: number;
  onClose: () => void;
  /** Registry shows the approval workflow. */
  showWorkflow?: boolean;
  /** Page buttons, next to Fiyatları Güncelle. */
  footerActions?: (request: PurchaseRequestDetail) => ReactNode;
  /** Notification prefix when the request cannot be loaded (the modal closes). */
  loadErrorPrefix: string;
}

/** "Fiyatları Güncelle": owner permission, submitted/approved, with offers. */
export function canAdjustPrices(request: PurchaseRequestDetail): boolean {
  return (
    hasPerm('adjust_offer_prices') &&
    (request.status === 'submitted' || request.status === 'approved') &&
    (request.offers ?? []).length > 0
  );
}

export function RequestDetailsModal({
  requestId,
  onClose,
  showWorkflow = false,
  footerActions,
  loadErrorPrefix,
}: RequestDetailsModalProps) {
  const queryClient = useQueryClient();
  const detail = useQuery(purchaseRequestQueryOptions(requestId));
  const rates = useQuery(currencyRatesQueryOptions()).data ?? null;
  const request = detail.data;
  const [adjusting, setAdjusting] = useState(false);
  const [itemModal, setItemModal] = useState<{
    kind: 'files' | 'specs';
    item: ComparisonItem;
  } | null>(null);

  useEffect(() => {
    if (detail.isError) {
      notify.error(`${loadErrorPrefix}: ${(detail.error as Error).message}`);
      onClose();
    }
    // Once per failure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail.isError]);

  const sections = useMemo<DetailSection[]>(() => {
    if (!request) return [];
    const out: DetailSection[] = [];
    const hasOffers = (request.offers ?? []).length > 0;
    if (hasOffers) {
      out.push({
        title: 'Mali Özet',
        icon: 'fas fa-calculator',
        content: <FinancialSummaryCards request={request} rates={rates} />,
      });
    }
    if (showWorkflow && request.approval?.stage_instances) {
      out.push({
        title: 'Onay Süreci',
        icon: 'fas fa-clipboard-check',
        content: <ApprovalWorkflow approval={request.approval} />,
      });
    }
    const rejections = rejectionComments(request.approval);
    if (rejections.length) {
      out.push({
        title: 'Reddetme Gerekçeleri',
        icon: 'fas fa-times-circle',
        fields: rejections.map((r) => ({ label: r.label, value: r.comment, span: 12 })),
      });
    }
    if (hasOffers && (request.request_items ?? []).length > 0) {
      out.push({
        title: 'Teklif Karşılaştırma Tablosu',
        icon: 'fas fa-chart-bar',
        content: (
          <ComparisonTable
            data={comparisonFromRequest(request)}
            columns={['unitPrice', 'originalTotal', 'deliveryDays']}
            rates={rates}
            initialMinimized={['unit', 'deliveryDays']}
            onShowFiles={(item) => setItemModal({ kind: 'files', item })}
            onShowSpecifications={(item) => setItemModal({ kind: 'specs', item })}
          />
        ),
      });
    }
    return out;
  }, [request, rates, showWorkflow]);

  const title = request
    ? `Talep Detayları - ${request.request_number || 'Bilinmiyor'}`
    : 'Talep Detayları';

  return (
    <>
      <DetailModal
        opened
        onClose={onClose}
        title={title}
        icon="fas fa-file-invoice"
        size="95%"
        loading={detail.isPending}
        sections={sections}
        headerActions={
          <NeoAskButton
            page={
              request?.request_number
                ? {
                    type: 'purchase_request',
                    id: request.request_number,
                    label: request.title ? String(request.title) : undefined,
                  }
                : null
            }
          />
        }
        footerActions={
          request ? (
            <>
              {footerActions?.(request)}
              {canAdjustPrices(request) ? (
                <Button
                  variant="outline"
                  leftSection={<FaIcon icon="fas fa-tags" />}
                  onClick={() => {
                    if (!hasAdjustableOffers(request)) {
                      notify.warning('Bu talepte güncellenecek teklif bulunmuyor.');
                      return;
                    }
                    setAdjusting(true);
                  }}
                >
                  Fiyatları Güncelle
                </Button>
              ) : null}
            </>
          ) : null
        }
      />
      {adjusting && request ? (
        <AdjustPricesModal
          request={request}
          onClose={() => setAdjusting(false)}
          onSaved={(resp) => {
            if (resp?.purchase_request) {
              queryClient.setQueryData(
                purchaseRequestKeys.detail(requestId),
                resp.purchase_request,
              );
            } else {
              void detail.refetch();
            }
          }}
        />
      ) : null}
      {itemModal?.kind === 'files' ? (
        <ItemFilesModal item={itemModal.item} onClose={() => setItemModal(null)} />
      ) : null}
      {itemModal?.kind === 'specs' ? (
        <SpecificationsModal item={itemModal.item} onClose={() => setItemModal(null)} />
      ) : null}
    </>
  );
}

function rejectionComments(approval: ApprovalInfo | null | undefined) {
  const out: { label: string; comment: string }[] = [];
  for (const stage of approval?.stage_instances ?? []) {
    for (const d of stage.decisions ?? []) {
      if (d.decision === 'reject' && d.comment) {
        const who = d.approver_detail?.full_name || d.approver_detail?.username || 'Bilinmeyen';
        out.push({ label: `${who} - ${stage.name}`, comment: d.comment });
      }
    }
  }
  return out;
}

function FinancialSummaryCards({
  request,
  rates,
}: {
  request: PurchaseRequestDetail;
  rates: Parameters<typeof financialSummary>[1];
}) {
  const s = financialSummary(request, rates);
  const recommended = (
    <Card
      withBorder
      radius="md"
      padding="md"
      style={{ borderColor: 'var(--mantine-color-blue-6)', borderWidth: 2 }}
    >
      <Stack gap={2} align="center">
        <Text size="sm" fw={600}>
          <FaIcon icon="fas fa-star" style={{ marginRight: 6 }} />
          Önerilen Teklifler
        </Text>
        <Text fz={20} fw={700} data-testid="recommended-eur">
          {formatMoneyOrDash(s.totalRecommendedEUR, 'EUR')}
        </Text>
        <Text size="xs" c="dimmed">
          Euro Karşılığı
        </Text>
        {s.recommendedCurrencyDisplay ? (
          <Text size="xs">{s.recommendedCurrencyDisplay}</Text>
        ) : null}
      </Stack>
    </Card>
  );
  if (!s.hasLowerPrices) return recommended;
  return (
    <SimpleGrid cols={{ base: 1, md: 2 }}>
      <Card withBorder radius="md" padding="md" bg="var(--gk-surface-subtle)">
        <Stack gap={2} align="center">
          <Text size="sm" fw={600}>
            <FaIcon icon="fas fa-info-circle" style={{ marginRight: 6 }} />
            Daha Düşük Fiyatlar Mevcut
          </Text>
          <Text fz={18} fw={700}>
            {formatMoneyOrDash(s.totalCheapestEUR, 'EUR')}
          </Text>
          <Text size="xs" c="dimmed">
            En Düşük Toplam
          </Text>
          <Text size="xs">
            <i
              className="fas fa-arrow-down"
              style={{ color: 'var(--mantine-color-green-7)', marginRight: 4 }}
            />
            {`${formatMoneyOrDash(s.savings, 'EUR')} tasarruf potansiyeli`}
          </Text>
        </Stack>
      </Card>
      {recommended}
    </SimpleGrid>
  );
}

/** registry renderApprovalWorkflow. */
export function ApprovalWorkflow({ approval }: { approval: ApprovalInfo }) {
  const overall = approval.is_rejected
    ? { color: 'red', icon: 'fas fa-times-circle', label: 'Reddedildi' }
    : approval.is_complete
      ? { color: 'green', icon: 'fas fa-check-circle', label: 'Tamamlandı' }
      : { color: 'yellow', icon: 'fas fa-clock', label: 'Onay Bekliyor' };
  const currentOrder = approval.current_stage_order;
  return (
    <Stack gap="sm">
      <div>
        <Badge color={overall.color} leftSection={<i className={overall.icon} />}>
          {overall.label}
        </Badge>
      </div>
      {(approval.stage_instances ?? []).map((stage) => {
        const isCurrent =
          stage.order === currentOrder && !approval.is_complete && !approval.is_rejected;
        const state = stage.is_rejected
          ? { border: 'red', badge: 'Reddedildi', icon: 'fas fa-times-circle', color: 'red' }
          : stage.is_complete
            ? { border: 'green', badge: 'Tamamlandı', icon: 'fas fa-check-circle', color: 'green' }
            : isCurrent
              ? {
                  border: 'yellow',
                  badge: 'Mevcut Aşama',
                  icon: 'fas fa-hourglass-half',
                  color: 'yellow',
                }
              : currentOrder !== undefined && stage.order > currentOrder
                ? { border: 'gray', badge: 'Beklemede', icon: 'fas fa-circle', color: 'gray' }
                : { border: 'gray', badge: null, icon: 'fas fa-circle', color: 'gray' };
        return (
          <Card
            key={stage.order}
            withBorder
            radius="md"
            padding="sm"
            style={{ borderWidth: 2, borderColor: `var(--mantine-color-${state.border}-5)` }}
            data-testid={`stage-${stage.order}`}
          >
            <Group justify="space-between" mb={6}>
              <Text fw={600}>
                <i
                  className={state.icon}
                  style={{ color: `var(--mantine-color-${state.color}-6)`, marginRight: 6 }}
                />
                {`${stage.order}. ${stage.name}`}
              </Text>
              {state.badge ? <Badge color={state.color}>{state.badge}</Badge> : null}
            </Group>
            <Group gap="lg" mb={6}>
              <Text size="sm">
                <strong>Gerekli Onay Sayısı:</strong> {stage.required_approvals}
              </Text>
              <Text size="sm">
                <strong>Onaylanan:</strong>{' '}
                <Text
                  span
                  c={stage.approved_count >= stage.required_approvals ? 'green' : 'yellow.8'}
                >
                  {stage.approved_count}
                </Text>
              </Text>
            </Group>
            <Text size="sm" fw={600}>
              Onaylayıcılar:
            </Text>
            <Group gap={4} mb={6}>
              {(stage.approvers ?? []).length === 0 ? (
                <Text size="sm" c="dimmed">
                  Onaylayıcı atanmamış
                </Text>
              ) : (
                (stage.approvers ?? []).map((a) => {
                  const d = (stage.decisions ?? []).find((x) => x.approver === a.id);
                  const meta =
                    d?.decision === 'approve'
                      ? { color: 'green', variant: 'filled', icon: 'fas fa-check' }
                      : d?.decision === 'reject'
                        ? { color: 'red', variant: 'filled', icon: 'fas fa-times' }
                        : { color: 'gray', variant: 'light', icon: 'fas fa-user' };
                  return (
                    <Badge
                      key={a.id}
                      color={meta.color}
                      variant={meta.variant}
                      leftSection={<i className={meta.icon} />}
                    >
                      {a.full_name || a.username}
                    </Badge>
                  );
                })
              )}
            </Group>
            {(stage.decisions ?? []).length > 0 ? (
              <Stack gap={4}>
                <Text size="sm" fw={600}>
                  Kararlar:
                </Text>
                {(stage.decisions ?? []).map((d, i) => (
                  <Card key={i} padding="xs" bg="var(--gk-surface-subtle)">
                    <Group justify="space-between">
                      <Text size="sm">
                        <i
                          className={
                            d.decision === 'approve' ? 'fas fa-check-circle' : 'fas fa-times-circle'
                          }
                          style={{
                            color: `var(--mantine-color-${d.decision === 'approve' ? 'green' : 'red'}-6)`,
                            marginRight: 4,
                          }}
                        />
                        <strong>
                          {d.approver_detail?.full_name ||
                            d.approver_detail?.username ||
                            'Bilinmeyen'}
                        </strong>{' '}
                        <Text span c="dimmed">
                          {d.decision === 'approve' ? 'Onayladı' : 'Reddetti'}
                        </Text>
                      </Text>
                      <Text size="xs" c="dimmed">
                        {d.decided_at ? formatDateTime(d.decided_at, { second: '2-digit' }) : '-'}
                      </Text>
                    </Group>
                    {d.comment ? (
                      <Text size="sm" mt={2}>
                        <strong>Yorum:</strong> {d.comment}
                      </Text>
                    ) : null}
                  </Card>
                ))}
              </Stack>
            ) : null}
          </Card>
        );
      })}
    </Stack>
  );
}

const itemTitle = (item: ComparisonItem) => item.name || item.code || 'Ürün';

function ItemFilesModal({ item, onClose }: { item: ComparisonItem; onClose: () => void }) {
  return (
    <DetailModal
      opened
      onClose={onClose}
      title={`Dosya Ekleri - ${itemTitle(item)}`}
      icon="fas fa-paperclip"
      size="lg"
      sections={[
        {
          title: 'Dosyalar',
          icon: 'fas fa-paperclip',
          content: (
            <FileAttachments readOnly layout="grid" files={(item.files ?? []).map(toAttachment)} />
          ),
        },
      ]}
    />
  );
}

function SpecificationsModal({ item, onClose }: { item: ComparisonItem; onClose: () => void }) {
  return (
    <DetailModal
      opened
      onClose={onClose}
      title={`Teknik Özellikler - ${itemTitle(item)}`}
      icon="fas fa-comment-dots"
      size="lg"
      sections={[
        {
          title: 'Ürün Açıklaması',
          icon: 'fas fa-align-left',
          hidden: !item.item_description.trim(),
          fields: [{ label: 'Açıklama', value: item.item_description, span: 12 }],
        },
        {
          title: 'Özellikler',
          icon: 'fas fa-cogs',
          hidden: !item.specifications.trim(),
          fields: [{ label: 'Teknik Özellikler', value: item.specifications, span: 12 }],
        },
      ]}
    />
  );
}
