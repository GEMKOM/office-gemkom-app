import { Button, Group, Stack, Text, Textarea } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  purchaseRequestQueryOptions,
  readApiError,
  type PurchaseOrderRef,
} from '@/api/procurement/purchaseRequests';
import { createSupplierEvaluation } from '@/api/procurement/suppliers';
import { SupplierStatusBadge } from '@/pages/procurement/suppliers/list/supplierBadges';
import { DetailModal, FaIcon, notify, StatusBadge } from '@/ui';

// registry.js openPrEvaluation: rate each purchase order of a request inline.

const CRITERIA = [
  { key: 'quality_score', label: 'Kalite' },
  { key: 'delivery_score', label: 'Teslimat' },
  { key: 'price_score', label: 'Fiyat' },
  { key: 'service_score', label: 'Servis' },
] as const;
type Scores = Record<(typeof CRITERIA)[number]['key'], number>;

export function EvaluationModal({
  requestId,
  canWrite,
  onClose,
  onSaved,
}: {
  requestId: number;
  canWrite: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const detail = useQuery(purchaseRequestQueryOptions(requestId));
  const [evaluated, setEvaluated] = useState<ReadonlySet<number>>(new Set());
  const orders = ((detail.data?.purchase_orders ?? []) as unknown as PurchaseOrderRef[]).map(
    (po) => (evaluated.has(po.id) ? { ...po, is_evaluated: true } : po),
  );

  let content;
  if (detail.isPending) {
    content = (
      <Text ta="center" py="md">
        <i className="fas fa-spinner fa-spin" /> Yükleniyor...
      </Text>
    );
  } else if (detail.isError) {
    content = <Text c="red">{`Yüklenirken hata oluştu: ${(detail.error as Error).message}`}</Text>;
  } else if (orders.length === 0) {
    content = <Text c="dimmed">Bu talebe ait sipariş bulunmuyor.</Text>;
  } else {
    content = (
      <Stack gap="sm">
        {orders.map((po) => (
          <PurchaseOrderCard
            key={po.id}
            po={po}
            canWrite={canWrite}
            onSaved={() => {
              setEvaluated((prev) => new Set(prev).add(po.id));
              onSaved();
            }}
          />
        ))}
      </Stack>
    );
  }

  return (
    <DetailModal
      opened
      onClose={onClose}
      icon="fas fa-star"
      size="lg"
      title={
        detail.data
          ? `Tedarikçi Değerlendirme — ${detail.data.request_number || ''}`
          : 'Tedarikçi Değerlendirme'
      }
      sections={[{ content }]}
    />
  );
}

function PurchaseOrderCard({
  po,
  canWrite,
  onSaved,
}: {
  po: PurchaseOrderRef;
  canWrite: boolean;
  onSaved: () => void;
}) {
  const statusColor = po.status === 'cancelled' ? 'red' : po.status === 'paid' ? 'green' : 'yellow';
  let body;
  if (po.is_evaluated) {
    body = (
      <Text size="sm" c="green">
        <i className="fas fa-check-circle" style={{ marginRight: 4 }} />
        Bu sipariş değerlendirildi.
      </Text>
    );
  } else if (canWrite && po.status !== 'cancelled') {
    body = <EvaluationForm poId={po.id} onSaved={onSaved} />;
  } else if (po.status === 'cancelled') {
    body = (
      <Text size="sm" c="dimmed">
        İptal edilmiş sipariş değerlendirilemez.
      </Text>
    );
  } else {
    body = (
      <Text size="sm" c="dimmed">
        Değerlendirme yetkiniz yok.
      </Text>
    );
  }
  return (
    <div
      style={{ border: '1px solid var(--gk-line)', borderRadius: 8, padding: 12 }}
      data-po-id={po.id}
    >
      <Group justify="space-between" mb={4}>
        <Group gap={6}>
          <strong>{`PO-${po.id}`}</strong>
          <span>· {po.supplier_name || ''}</span>
          {po.supplier_status && po.supplier_status !== 'approved' ? (
            <SupplierStatusBadge status={po.supplier_status} />
          ) : null}
        </Group>
        <StatusBadge color={statusColor}>{po.status_label || po.status}</StatusBadge>
      </Group>
      {body}
    </div>
  );
}

function EvaluationForm({ poId, onSaved }: { poId: number; onSaved: () => void }) {
  const [scores, setScores] = useState<Scores>({
    quality_score: 0,
    delivery_score: 0,
    price_score: 0,
    service_score: 0,
  });
  const [hover, setHover] = useState<{ key: string; value: number } | null>(null);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!Object.values(scores).every((v) => v >= 1 && v <= 5)) {
      notify.error('Lütfen tüm kriterleri (1–5) yıldız ile değerlendirin.');
      return;
    }
    setSaving(true);
    try {
      const result = (await createSupplierEvaluation({
        purchase_order: poId,
        ...scores,
        comment: comment.trim() || '',
      })) as { supplier?: { rating_score?: number | string | null } } | undefined;
      const score = result?.supplier?.rating_score;
      notify.success(
        'Değerlendirme kaydedildi.' +
          (score !== null && score !== undefined ? ` Yeni puan: ${Number(score).toFixed(2)}` : ''),
      );
      onSaved();
    } catch (error) {
      notify.error(readApiError(error, 'Değerlendirme kaydedilirken hata oluştu'));
      setSaving(false);
    }
  };

  return (
    <Stack gap={4} mt="xs">
      {CRITERIA.map((c) => {
        const shown = hover?.key === c.key ? hover.value : scores[c.key];
        return (
          <Group
            key={c.key}
            justify="space-between"
            py={2}
            style={{ borderBottom: '1px solid var(--gk-line)' }}
          >
            <Text size="sm" fw={600}>
              {c.label}
            </Text>
            <span
              role="radiogroup"
              aria-label={c.label}
              style={{
                fontSize: '1.2rem',
                cursor: 'pointer',
                letterSpacing: 2,
                color: 'var(--mantine-color-yellow-6)',
              }}
              onMouseLeave={() => setHover(null)}
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <i
                  key={n}
                  role="radio"
                  aria-checked={scores[c.key] === n}
                  aria-label={`${c.label} ${n}`}
                  className={n <= shown ? 'fas fa-star' : 'far fa-star'}
                  onMouseEnter={() => setHover({ key: c.key, value: n })}
                  onClick={() => setScores((prev) => ({ ...prev, [c.key]: n }))}
                />
              ))}
            </span>
          </Group>
        );
      })}
      <Textarea
        label="Yorum"
        size="xs"
        rows={2}
        placeholder="Opsiyonel"
        value={comment}
        onChange={(e) => setComment(e.currentTarget.value)}
      />
      <Group justify="flex-end">
        <Button
          size="xs"
          color="yellow"
          loading={saving}
          leftSection={<FaIcon icon="fas fa-save" />}
          onClick={() => void save()}
        >
          Kaydet
        </Button>
      </Group>
    </Stack>
  );
}
