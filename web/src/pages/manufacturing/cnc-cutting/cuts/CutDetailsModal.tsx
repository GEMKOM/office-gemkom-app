import { useQuery } from '@tanstack/react-query';
import { cncTaskQueryOptions, type CncTask } from '@/api/manufacturing/cncTasks';
import { DataTable, DetailModal, FileAttachments, type DetailField } from '@/ui';
import { toAttachment } from './cutForm';
import { PART_COLUMNS } from './PartsManager';

const or = (value: unknown, fallback = '-') =>
  value === null || value === undefined || value === '' ? fallback : String(value);

/** "Plaka Kalemi" / "Fire Plaka" line of the details. */
export function plateSourceField(task: CncTask): DetailField | null {
  const item = task.plate_item;
  if (item) {
    const delivered = item.is_delivered
      ? 'Teslim edildi'
      : Number(item.delivered_quantity || 0) > 0
        ? `Kısmi teslim (${item.delivered_quantity} / ${item.quantity} alındı)`
        : 'Malzeme bekleniyor (satın alma)';
    const consumed = item.is_consumed ? ' · Kullanıldı' : '';
    return {
      label: 'Plaka Kalemi',
      value: `${item.item_code || ''} — ${item.item_name || ''} (${item.planning_request_number || '-'}) · ${delivered}${consumed} · ${item.cnc_cuts_count ?? 0} kesimde kullanıldı`,
      span: 6,
    };
  }
  const usage = task.plate_usage_records?.[0];
  if (usage) {
    const plate = usage.remnant_plate_details ?? null;
    return {
      label: 'Fire Plaka',
      value: `ID: ${plate?.id ?? usage.remnant_plate} · ${plate?.material || '-'} · ${plate?.thickness_mm ? `${plate.thickness_mm} mm` : '-'} · ${plate?.dimensions || '-'} (${usage.quantity_used || 1} adet)`,
      span: 6,
    };
  }
  return null;
}

/** "Kesim Detayları" for ?cut=KEY. */
export function CutDetailsModal({ cutKey, onClose }: { cutKey: string; onClose: () => void }) {
  const task = useQuery(cncTaskQueryOptions(cutKey));
  const t = task.data;
  const source = t ? plateSourceField(t) : null;
  const files = (t?.files ?? []).map(toAttachment);

  return (
    <DetailModal
      opened
      onClose={onClose}
      title="Kesim Detayları"
      subtitle={t?.key}
      icon="fas fa-info-circle"
      size="xl"
      loading={!t}
      sections={
        t
          ? [
              {
                title: 'Temel Bilgiler',
                icon: 'fas fa-info-circle',
                fields: [
                  { label: 'Kesim No', value: or(t.key), span: 3, copyable: true },
                  { label: 'Kesim Adı', value: or(t.name), span: 3 },
                  { label: 'Nesting ID', value: or(t.nesting_id), span: 3 },
                  { label: 'Malzeme', value: or(t.material), span: 3 },
                  {
                    label: 'Kalınlık',
                    value: t.thickness_mm ? `${t.thickness_mm} mm` : '-',
                    span: 3,
                  },
                  { label: 'Boyutlar', value: or(t.dimensions), span: 3 },
                  {
                    label: 'Tahmini Saat',
                    value: t.estimated_hours ? `${t.estimated_hours} saat` : '-',
                    span: 3,
                  },
                  { label: 'Adet', value: t.quantity ? String(t.quantity) : '-', span: 3 },
                  {
                    label: 'Harcanan Saat',
                    value: t.total_hours_spent ? `${t.total_hours_spent} saat` : '0 saat',
                    span: 3,
                  },
                  { label: 'Makine', value: or(t.machine_name), span: 3 },
                  ...(source ? [source] : []),
                ],
              },
              {
                title: 'Ekler',
                icon: 'fas fa-paperclip',
                hidden: files.length === 0,
                content: <FileAttachments files={files} readOnly layout="grid" />,
              },
              {
                content: (
                  <DataTable
                    title="Parça Listesi"
                    icon="fas fa-puzzle-piece"
                    data={t.parts ?? []}
                    columns={PART_COLUMNS}
                    getRowId={(p) => String(p.id)}
                    striped
                    verticalSpacing="xs"
                    emptyMessage="Parça bulunamadı"
                  />
                ),
              },
            ]
          : []
      }
    />
  );
}
