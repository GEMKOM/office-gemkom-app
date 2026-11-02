import { Anchor, Box, Button, Group, SegmentedControl, Table, Text, Textarea } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import {
  supplierPurchaseHistoryQueryOptions,
  supplierReadErrorMessage,
  useSaveSupplierEvaluation,
  type PurchaseHistoryEvaluation,
  type PurchaseHistoryRow,
  type Supplier,
} from '@/api/procurement/suppliers';
import { formatDate } from '@/lib/format';
import { DetailModal, FaIcon, notify, StatusBadge } from '@/ui';
import { StarRating, StaticStars } from './supplierBadges';
import { ModalError, ModalLoading } from './SupplierRatingsModal';
import classes from './suppliers.module.css';

// One card per purchase order (backend: /suppliers/{id}/purchase-history/).
// Ratings are per PO, same as the PR registry and the finance PO page.

const CRITERIA = [
  { key: 'quality_score', label: 'Kalite' },
  { key: 'delivery_score', label: 'Teslimat' },
  { key: 'price_score', label: 'Fiyat' },
  { key: 'service_score', label: 'Servis' },
] as const;

type CriterionKey = (typeof CRITERIA)[number]['key'];
type Scores = Record<CriterionKey, number>;

function money(amount: unknown, currency: string | undefined): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '-';
  return `${n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency || ''}`;
}

function qty(value: unknown): string {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString('tr-TR', { maximumFractionDigits: 2 }) : '-';
}

/** Five clickable stars with a hover preview that falls back to the chosen value. */
function StarInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value;
  return (
    <div className={classes.phCritRow}>
      <Text span size="sm" fw={600}>
        {label}
      </Text>
      <span
        className={classes.starInput}
        role="radiogroup"
        aria-label={label}
        onMouseLeave={() => setHover(null)}
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${label}: ${n}`}
            className={classes.starButton}
            onMouseEnter={() => setHover(n)}
            onClick={() => onChange(n)}
          >
            <i className={n <= shown ? 'fas fa-star' : 'far fa-star'} aria-hidden />
          </button>
        ))}
      </span>
    </div>
  );
}

function EvaluationForm({
  row,
  supplierId,
  evaluation,
  onCancel,
  onSaved,
}: {
  row: PurchaseHistoryRow;
  supplierId: number;
  evaluation: PurchaseHistoryEvaluation | null;
  onCancel?: () => void;
  onSaved: () => void;
}) {
  const [scores, setScores] = useState<Scores>({
    quality_score: evaluation?.quality_score ?? 0,
    delivery_score: evaluation?.delivery_score ?? 0,
    price_score: evaluation?.price_score ?? 0,
    service_score: evaluation?.service_score ?? 0,
  });
  const [comment, setComment] = useState(evaluation?.comment || '');
  const save = useSaveSupplierEvaluation(supplierId);

  const submit = async () => {
    if (!Object.values(scores).every((v) => v >= 1 && v <= 5)) {
      notify.error('Lütfen tüm kriterleri (1–5) yıldız ile değerlendirin.');
      return;
    }
    try {
      const result = await save.mutateAsync({
        evaluationId: row.evaluation?.id,
        data: { purchase_order: row.purchase_order, ...scores, comment: comment.trim() },
      });
      notify.success(
        `Değerlendirme kaydedildi (${Number(result.composite_score).toFixed(2)} / 5).`,
      );
      onSaved();
    } catch (error) {
      notify.error(
        supplierReadErrorMessage(
          error,
          row.evaluation
            ? 'Değerlendirme güncellenirken hata oluştu'
            : 'Değerlendirme kaydedilirken hata oluştu',
        ) || 'Değerlendirme kaydedilirken hata oluştu',
      );
    }
  };

  return (
    <div className={classes.phForm}>
      {CRITERIA.map((c) => (
        <StarInput
          key={c.key}
          label={c.label}
          value={scores[c.key]}
          onChange={(value) => setScores((prev) => ({ ...prev, [c.key]: value }))}
        />
      ))}
      <Textarea
        mt="xs"
        size="xs"
        rows={2}
        placeholder="Yorum (opsiyonel)"
        aria-label="Yorum"
        value={comment}
        onChange={(event) => setComment(event.currentTarget.value)}
      />
      <Group justify="flex-end" gap="xs" mt="xs">
        {evaluation ? (
          <Button size="xs" variant="default" onClick={onCancel} disabled={save.isPending}>
            Vazgeç
          </Button>
        ) : null}
        <Button
          size="xs"
          leftSection={<FaIcon icon="fas fa-save" />}
          loading={save.isPending}
          onClick={() => void submit()}
        >
          {evaluation ? 'Güncelle' : 'Değerlendir'}
        </Button>
      </Group>
    </div>
  );
}

function EvaluationSection({
  row,
  supplierId,
  canRate,
}: {
  row: PurchaseHistoryRow;
  supplierId: number;
  canRate: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const ev = row.evaluation;

  if (!ev) {
    return canRate ? (
      <EvaluationForm
        row={row}
        supplierId={supplierId}
        evaluation={null}
        onSaved={() => setEditing(false)}
      />
    ) : (
      <Text size="sm" c="dimmed">
        Henüz değerlendirilmedi.
      </Text>
    );
  }
  if (editing) {
    return (
      <EvaluationForm
        row={row}
        supplierId={supplierId}
        evaluation={ev}
        onCancel={() => setEditing(false)}
        onSaved={() => setEditing(false)}
      />
    );
  }
  return (
    <Group justify="space-between" align="flex-start" gap="xs" wrap="nowrap">
      <Box style={{ flexGrow: 1 }}>
        <div className={classes.phCritGrid}>
          {CRITERIA.map((c) => (
            <Group key={c.key} justify="space-between" gap="xs" wrap="nowrap">
              <Text span size="sm" c="dimmed">
                {c.label}
              </Text>
              <StaticStars value={ev[c.key]} />
            </Group>
          ))}
        </div>
        {ev.comment ? (
          <Text size="sm" mt={4}>
            <Text span c="dimmed" mr={4}>
              <i className="fas fa-comment" aria-hidden />
            </Text>
            {ev.comment}
          </Text>
        ) : null}
        <Text size="xs" c="dimmed" mt={4}>
          {ev.evaluated_by_username || ''} · {formatDate(ev.updated_at)}
        </Text>
      </Box>
      <Box ta="right">
        <Text fw={700}>
          {Number(ev.composite_score).toFixed(2)}{' '}
          <Text span size="xs" c="dimmed">
            / 5
          </Text>
        </Text>
        {canRate ? (
          <Button
            size="xs"
            variant="default"
            mt={4}
            leftSection={<FaIcon icon="fas fa-pen" />}
            onClick={() => setEditing(true)}
          >
            Düzenle
          </Button>
        ) : null}
      </Box>
    </Group>
  );
}

function PurchaseCard({
  row,
  supplierId,
  canRate,
}: {
  row: PurchaseHistoryRow;
  supplierId: number;
  canRate: boolean;
}) {
  const lines = row.lines ?? [];
  const registryUrl = `/procurement/purchase-requests/registry/?talep=${encodeURIComponent(row.request_number)}`;
  return (
    <div
      className={classes.phCard}
      data-unrated={row.evaluation ? undefined : true}
      data-po-id={row.purchase_order}
    >
      <div className={classes.phHead}>
        <div>
          <Anchor href={registryUrl} target="_blank" rel="noopener" fw={600} size="sm">
            {row.request_number}
          </Anchor>
          <Text span size="xs" c="dimmed" ml={4}>
            PO-{row.purchase_order}
          </Text>
          <Text size="sm">{row.title || ''}</Text>
          <Text size="xs" c="dimmed">
            Onay: {formatDate(row.approved_at)}
            {row.requestor_username ? ` · Talep eden: ${row.requestor_username}` : ''}
            {` · ${row.line_count} kalem (${row.delivered_line_count} teslim alındı)`}
          </Text>
        </div>
        <div className={classes.phTotal}>
          <Text fw={700} size="sm">
            {money(row.total_amount, row.currency)}
          </Text>
          <StatusBadge color={row.po_status === 'paid' ? 'green' : 'orange'}>
            {row.po_status_label || row.po_status}
          </StatusBadge>
        </div>
      </div>
      {lines.length ? (
        <details className={classes.phLines}>
          <summary>Kalemleri göster</summary>
          <Table.ScrollContainer minWidth={480}>
            <Table verticalSpacing={4} fz="xs" mt={6}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Kod</Table.Th>
                  <Table.Th>Malzeme</Table.Th>
                  <Table.Th ta="right">Miktar</Table.Th>
                  <Table.Th ta="right">Birim Fiyat</Table.Th>
                  <Table.Th ta="center">Teslim</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {lines.map((l, i) => (
                  <Table.Tr key={i}>
                    <Table.Td>{l.item_code || ''}</Table.Td>
                    <Table.Td>
                      {l.item_name || l.description || ''}
                      {l.item_name && l.description && l.description !== l.item_name ? (
                        <Text size="xs" c="dimmed">
                          {l.description}
                        </Text>
                      ) : null}
                    </Table.Td>
                    <Table.Td ta="right">
                      {qty(l.quantity)} {l.unit || ''}
                    </Table.Td>
                    <Table.Td ta="right">{money(l.unit_price, row.currency)}</Table.Td>
                    <Table.Td ta="center">
                      {l.is_delivered ? (
                        <Text span c="green" title="Teslim alındı">
                          <i className="fas fa-check" aria-hidden />
                        </Text>
                      ) : (
                        <Text span c="dimmed">
                          —
                        </Text>
                      )}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </details>
      ) : null}
      <div className={classes.phEval}>
        <EvaluationSection row={row} supplierId={supplierId} canRate={canRate} />
      </div>
    </div>
  );
}

export interface SupplierPurchaseHistoryModalProps {
  supplierId: number;
  /** The supplier as currently loaded in the list (its rating follows refetches). */
  supplier?: Supplier;
  canRate: boolean;
  onClose: () => void;
}

/** Port of viewSupplierPurchaseHistory: approved PRs this supplier won, rated in place. */
export function SupplierPurchaseHistoryModal({
  supplierId,
  supplier,
  canRate,
  onClose,
}: SupplierPurchaseHistoryModalProps) {
  const history = useQuery(supplierPurchaseHistoryQueryOptions(supplierId));
  // The unrated filter keeps the cards it showed when picked: a card rated
  // meanwhile stays on screen, as legacy swapped it in place.
  const [unratedIds, setUnratedIds] = useState<Set<number> | null>(null);
  const onlyUnrated = unratedIds !== null;
  const pickFilter = (value: string) =>
    setUnratedIds(
      value === '1'
        ? new Set((history.data ?? []).filter((r) => !r.evaluation).map((r) => r.purchase_order))
        : null,
    );

  let content: ReactNode;
  if (history.error) {
    content = (
      <ModalError
        message={supplierReadErrorMessage(
          history.error,
          'Satın alma geçmişi yüklenirken hata oluştu',
        )}
      />
    );
  } else if (!history.data) {
    content = <ModalLoading />;
  } else if (!history.data.length) {
    content = (
      <Text c="dimmed" size="sm">
        Bu tedarikçinin seçildiği onaylanmış bir satın alma talebi yok.
      </Text>
    );
  } else {
    const rows = history.data;
    const rated = rows.filter((r) => r.evaluation).length;
    const unrated = rows.length - rated;
    const visible = unratedIds ? rows.filter((r) => unratedIds.has(r.purchase_order)) : rows;
    content = (
      <>
        <Group justify="space-between" gap="xs" mb="sm" wrap="wrap">
          <Text size="sm">
            {supplier ? (
              <>
                <StarRating score={supplier.rating_score} compact /> ·{' '}
              </>
            ) : null}
            <strong>{rows.length}</strong> onaylı talep ·{' '}
            <Text span c="green" inherit>
              {rated} değerlendirildi
            </Text>{' '}
            ·{' '}
            <Text span c="blue" inherit>
              {unrated} bekliyor
            </Text>
          </Text>
          <SegmentedControl
            size="xs"
            value={onlyUnrated ? '1' : '0'}
            onChange={pickFilter}
            data={[
              { value: '0', label: 'Tümü' },
              { value: '1', label: 'Değerlendirilmemiş' },
            ]}
          />
        </Group>
        {visible.length ? (
          visible.map((row) => (
            <PurchaseCard
              key={row.purchase_order}
              row={row}
              supplierId={supplierId}
              canRate={canRate}
            />
          ))
        ) : (
          <Text c="dimmed" size="sm">
            Değerlendirilmemiş talep kalmadı.
          </Text>
        )}
      </>
    );
  }

  return (
    <DetailModal
      opened
      onClose={onClose}
      title={`Satın Alma Geçmişi — ${supplier?.name ?? ''}`}
      icon="fas fa-clipboard-list"
      size="xl"
      sections={[{ content }]}
    />
  );
}
