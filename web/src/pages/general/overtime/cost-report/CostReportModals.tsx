import { Alert, Badge, Table, Text, Tooltip } from '@mantine/core';
import type { CostReport, CostReportRequest } from '@/api/general/overtime';
import { formatDate, formatDateTime } from '@/lib/format';
import { DetailModal, FaIcon, StatusBadge } from '@/ui';
import {
  bucketRows,
  ENTRY_STATUS,
  fmtEur,
  fmtHours,
  fmtShare,
  jobDetail,
  NO_JOB_LABEL,
  num,
  teamLabel,
  costNums,
  type JobParent,
} from './costReport';
import { BucketLabel, COST_HEADERS, costCells, JobNo, SimpleTable } from './parts';

const COST_ALIGN = [true, true, true];

/** Port of showRequestDetail: the report payload already carries every entry. */
export function RequestCostModal({
  request: req,
  onClose,
}: {
  request: CostReportRequest;
  onClose: () => void;
}) {
  const entryRows = (req.entries ?? []).map((e) => {
    const status = ENTRY_STATUS[e.status ?? ''];
    return [
      <div key="name">
        {e.full_name || e.username}
        {e.estimated_wage ? (
          <Tooltip label="Tanımlı maaş yok; sistem ortalaması kullanıldı." withArrow>
            <Text span c="yellow.7" ml={6}>
              <FaIcon icon="fas fa-exclamation-triangle" />
            </Text>
          </Tooltip>
        ) : null}
        {num(e.unpriced_hours) > 0 ? (
          <Text size="xs" c="red.7">
            <FaIcon icon="fas fa-times-circle" /> {fmtHours(e.unpriced_hours)} fiyatlanamadı (kur
            verisi yok)
          </Text>
        ) : null}
      </div>,
      <JobNo key="job" jobNo={e.job_no} />,
      <Text key="desc" size="xs" c="dimmed">
        {e.description || '-'}
      </Text>,
      <StatusBadge key="status" color={status?.family ?? 'grey'}>
        {status?.label ?? e.status}
      </StatusBadge>,
      fmtHours(e.hours),
      ...costCells(costNums(e)),
    ];
  });

  const total = num(req.cost_eur);
  const buckets = bucketRows(req.buckets, req.cost_eur);

  return (
    <DetailModal
      opened
      onClose={onClose}
      title={`Mesai Talebi #${req.id} — Maliyet Detayı`}
      icon="fas fa-coins"
      size="xl"
      sections={[
        {
          title: 'Talep Bilgileri',
          icon: 'fas fa-info-circle',
          fields: [
            { label: 'Talep Eden', value: req.requester_name || '-' },
            { label: 'Ekip', value: teamLabel(req.team) },
            { label: 'Başlangıç', value: formatDateTime(req.start_at) },
            { label: 'Bitiş', value: formatDateTime(req.end_at) },
            { label: 'Talep Süresi', value: fmtHours(req.duration_hours) },
            { label: 'Kişi Sayısı', value: String(req.entry_count ?? '') },
            { label: 'Gerekçe', value: req.reason, span: 12, hidden: !req.reason },
          ],
        },
        {
          hidden: !req.is_partial,
          content: (
            <Alert color="gray" variant="light" icon={<FaIcon icon="fas fa-scissors" />}>
              <Text size="sm">
                Bu talep seçilen rapor döneminin dışına taşıyor. Aşağıdaki tutarlar yalnızca{' '}
                <strong>
                  {formatDateTime(req.counted_start_at)} – {formatDateTime(req.counted_end_at)}
                </strong>{' '}
                aralığı için hesaplanmıştır.
              </Text>
            </Alert>
          ),
        },
        {
          title: 'Kişi Bazında Maliyet',
          icon: 'fas fa-user-tag',
          content: (
            <SimpleTable
              headers={['Personel', 'İş No', 'Açıklama', 'Durum', 'Saat', ...COST_HEADERS]}
              alignEnd={[false, false, false, false, true, ...COST_ALIGN]}
              rows={entryRows}
              foot={
                <Table.Tr>
                  <Table.Th colSpan={4} ta="right">
                    Toplam
                  </Table.Th>
                  <Table.Th ta="right">{fmtHours(req.hours)}</Table.Th>
                  <Table.Th ta="right">{fmtEur(req.wage_cost_eur)}</Table.Th>
                  <Table.Th ta="right">{fmtEur(req.employer_cost_eur)}</Table.Th>
                  <Table.Th ta="right">{fmtEur(req.cost_eur)}</Table.Th>
                </Table.Tr>
              }
            />
          ),
        },
        {
          title: 'Ücret Katsayısı Dağılımı',
          icon: 'fas fa-layer-group',
          content: (
            <SimpleTable
              hover={false}
              headers={['Kategori', 'Saat', ...COST_HEADERS, 'Pay']}
              alignEnd={[false, true, ...COST_ALIGN, true]}
              empty="Veri yok"
              rows={buckets.map((b) => [
                <BucketLabel key="label" icon={b.icon} color={b.color} label={b.label} />,
                fmtHours(b.hours),
                ...costCells(b),
                <Text key="share" span size="xs" c="dimmed">
                  {fmtShare(total > 0 ? (b.cost_eur / total) * 100 : 0)}
                </Text>,
              ])}
            />
          ),
        },
      ]}
    />
  );
}

/** Port of showJobDetail: a parent line covers its sub-jobs, a child line is exact. */
export function JobCostModal({
  report,
  jobKey,
  parent,
  onClose,
}: {
  report: CostReport;
  jobKey: string;
  parent: JobParent | null;
  onClose: () => void;
}) {
  const detail = jobDetail(report, jobKey, parent);
  const label = jobKey || NO_JOB_LABEL;
  return (
    <DetailModal
      opened
      onClose={onClose}
      title={`İş Emri ${label} — Mesai Detayı`}
      icon="fas fa-sitemap"
      size="xl"
      sections={[
        {
          title: 'Özet',
          icon: 'fas fa-info-circle',
          fields: [
            { label: 'İş No', value: label, span: 4 },
            { label: 'Toplam Saat', value: fmtHours(detail.totals.hours), span: 4 },
            { label: 'Mesai Kaydı', value: String(detail.rows.length), span: 4 },
            { label: 'Ücret', value: fmtEur(detail.totals.wage_cost_eur), span: 4 },
            {
              label: 'SGK / İşveren Payı',
              value: fmtEur(detail.totals.employer_cost_eur),
              span: 4,
            },
            { label: 'Toplam Maliyet (SGK dahil)', value: fmtEur(detail.totals.cost_eur), span: 4 },
          ],
        },
        {
          title: 'Alt İş Emirleri',
          icon: 'fas fa-code-branch',
          hidden: !parent?.expandable,
          content: (
            <SimpleTable
              headers={['İş No', 'Kayıt', 'Saat', ...COST_HEADERS]}
              alignEnd={[false, true, true, ...COST_ALIGN]}
              rows={(parent?.children ?? []).map((c) => [
                <JobNo key="job" jobNo={c.job_no} />,
                String(c.entry_count),
                fmtHours(c.hours),
                ...costCells(c),
              ])}
            />
          ),
        },
        {
          title: 'Kişi Bazında',
          icon: 'fas fa-user-tag',
          content: (
            <SimpleTable
              headers={['Personel', 'Kayıt', 'Saat', ...COST_HEADERS]}
              alignEnd={[false, true, true, ...COST_ALIGN]}
              rows={detail.people.map((p) => [
                p.name,
                String(p.count),
                fmtHours(p.hours),
                ...costCells(p),
              ])}
            />
          ),
        },
        {
          title: 'Mesai Kayıtları',
          icon: 'fas fa-clock',
          content: (
            <SimpleTable
              headers={['Tarih', 'Talep', 'Personel', 'İş No', 'Açıklama', 'Saat', ...COST_HEADERS]}
              alignEnd={[false, false, false, false, false, true, ...COST_ALIGN]}
              rows={detail.rows.map((r) => [
                formatDate(r.date),
                <Badge key="req" size="sm">
                  #{r.request_id}
                </Badge>,
                r.full_name,
                <JobNo key="job" jobNo={r.job_no} />,
                <Text key="desc" size="xs" c="dimmed">
                  {r.description || '-'}
                </Text>,
                fmtHours(r.hours),
                ...costCells(r),
              ])}
            />
          ),
        },
      ]}
    />
  );
}
