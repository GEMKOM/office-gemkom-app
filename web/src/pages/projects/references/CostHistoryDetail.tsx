import { Button, Modal, Text, Textarea } from '@mantine/core';
import { useState } from 'react';
import { STRUCTURE_CLASS_LABELS } from '@/api/projects/estimator';
import {
  archiveFlagLabel,
  planCopperShare,
  planShopHoursPerTonne,
  reviewCostHistoryRow,
  type CostHistoryRow,
} from '@/api/projects/costHistory';
import type { ReferenceProfile } from '@/api/projects/references';
import { errorMessage, FaIcon, ModalBody, ModalFooter, ModalHeader, modalClassNames, StatusBadge } from '@/ui';
import { fmt } from '../estimate-report/reportModel';
import { ReviewBadge, monthLabel, PlanSourceBadge } from './costHistoryParts';
import css from './RefTabs.module.css';

type Status = 'verified' | 'excluded' | 'unreviewed';

const ACTIONS: { status: Status; label: string; icon: string; color: string }[] = [
  { status: 'verified', label: 'Doğrula', icon: 'fas fa-check', color: 'green' },
  { status: 'excluded', label: 'Hariç tut', icon: 'fas fa-ban', color: 'red' },
  { status: 'unreviewed', label: 'İncelemeyi geri al', icon: 'fas fa-rotate-left', color: 'gray' },
];

function Kv({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className={css.kv}>
      <span>{k}</span>
      <span>{v}</span>
    </div>
  );
}

/** One archive row: the cost then and now, how it was restated, the plan read from its drawings, and its review. */
export function CostHistoryDetail({
  row,
  reference,
  onOpenReference,
  onClose,
  onReviewed,
}: {
  row: CostHistoryRow;
  /** The same job in İş referansları (welder hours, factor), when it is there. */
  reference?: ReferenceProfile;
  onOpenReference?: (jobNo: string) => void;
  onClose: () => void;
  onReviewed: (id: number, status: string, note: string) => void;
}) {
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState<Status | null>(null);
  const plan = row.plan;
  const copper = planCopperShare(plan);
  const shopHt = planShopHoursPerTonne(plan);
  const flags = (row.flags ?? []).filter((f) => !f.startsWith('date_from_pdm'));

  const save = async (status: Status) => {
    const text = note.trim();
    if (status === 'excluded' && !text) {
      setError('Hariç tutmak için not gerekli.');
      return;
    }
    setSaving(status);
    try {
      const res = await reviewCostHistoryRow(row.id, status, text);
      onReviewed(res.id, res.review_status, res.review_note);
    } catch (e) {
      setError(errorMessage(e, 'Kaydedilemedi'));
      setSaving(null);
    }
  };

  const lines: [string, keyof CostHistoryRow['then']][] = [
    ['İşçilik', 'labour'],
    ['Malzeme', 'material'],
    ['Genel gider', 'overhead'],
    ['Toplam', 'total'],
  ];

  return (
    <Modal opened onClose={onClose} size="xl" withCloseButton={false} classNames={modalClassNames}>
      <ModalHeader
        icon="fas fa-file-invoice"
        title={`${row.job_no || 'İş no yok'} — ${row.product || ''}`}
      />
      <ModalBody>
        <div className={css.detailGrid}>
          <div className={css.detailBox}>
            <h4>İş</h4>
            <Kv k="Müşteri" v={row.customer || '—'} />
            <Kv k="Aile" v={row.family_label} />
            <Kv k="Adet × kg" v={`${fmt(row.qty, 0)} × ${fmt(row.kg_each, 0)} kg`} />
            <Kv k="Maliyet ayı" v={`${monthLabel(row.cost_month)} (${row.date_source === 'pdm' ? 'PDM tarihinden' : 'tablodan'})`} />
            <Kv k="Uygulamada" v={row.in_app ? 'İş emri var' : 'Yok (arşivden)'} />
            <Kv k="İnceleme" v={<ReviewBadge status={row.review} />} />
          </div>
          <div className={css.detailBox}>
            <h4>Maliyet (€)</h4>
            <table className={css.splitTable}>
              <thead>
                <tr>
                  <th />
                  <th>O gün</th>
                  <th>Bugün ({row.now?.restated_to ? monthLabel(row.now.restated_to) : '—'})</th>
                </tr>
              </thead>
              <tbody>
                {lines.map(([label, key]) => (
                  <tr key={key}>
                    <td>{label}</td>
                    <td>{fmt(row.then?.[key], 0)}</td>
                    <td>{fmt(row.now?.[key], 0)}</td>
                  </tr>
                ))}
                <tr>
                  <td>€/kg</td>
                  <td>{fmt(row.then?.eur_per_kg, 2)}</td>
                  <td>{fmt(row.now?.eur_per_kg, 2)}</td>
                </tr>
              </tbody>
            </table>
            <Text size="xs" c="dimmed" mt={6}>
              Bugüne taşıma: işçilik × {fmt(row.factors?.labour, 2)} (TR imalat işçilik maliyeti), malzeme ×{' '}
              {fmt(row.factors?.steel, 2)} (AB çelik fiyat endeksi), genel gider bugünkü €/kg oranıyla.
              {row.basis === 'total_only' ? ' Tabloda yalnız toplam vardı: işçilik payı ailenin medyanıyla varsayıldı.' : ''}
            </Text>
          </div>
        </div>

        <div className={css.detailBox} style={{ marginBottom: 14 }}>
          <h4>
            Çizimden okunan imalat planı <PlanSourceBadge source={row.plan_source} />
          </h4>
          {plan ? (
            <>
              <div className={css.detailGrid} style={{ marginBottom: 0 }}>
                <div>
                  <Kv k="Birim kütle" v={`${fmt(plan.unit_mass_kg, 0)} kg`} />
                  <Kv k="Birleşim / kaynak" v={`${fmt(plan.joints, 0)} · ${fmt(plan.weld_m, 1)} m`} />
                  <Kv k="Kaynak m/t" v={fmt(plan.weld_m_per_t, 1)} />
                  <Kv k="Yapı sınıfı" v={STRUCTURE_CLASS_LABELS[plan.structure_class ?? ''] || plan.structure_class || '—'} />
                  <Kv k="Bakır payı" v={copper == null ? '—' : `%${fmt(copper * 100, 0)}`} />
                </div>
                <div>
                  <Kv k="Plan saati (toplam)" v={`${fmt(plan.total_h, 1)} h`} />
                  <Kv k="Kaynak atölyesi" v={`${fmt(plan.shop_h, 1)} h · ${fmt(shopHt, 0)} h/t`} />
                  <Kv k="Talaşlı" v={`${fmt(plan.mach_h, 1)} h`} />
                  <Kv k="CNC / büküm / KK" v={`${fmt(row.plan_detail?.cnc_h, 1)} / ${fmt(row.plan_detail?.bend_h, 1)} / ${fmt(row.plan_detail?.qc_h, 1)} h`} />
                  {row.kg_each_over_plan_unit != null && Math.abs(row.kg_each_over_plan_unit - 1) > 0.25 ? (
                    <Kv k="Tablo / plan birimi" v={`× ${fmt(row.kg_each_over_plan_unit, 2)}`} />
                  ) : null}
                </div>
              </div>
              {row.kg_each_over_plan_unit != null && Math.abs(row.kg_each_over_plan_unit - 1) > 0.25 ? (
                <Text size="xs" c="dimmed" mt={6}>
                  Maliyet tablosunun birimi planın {fmt(row.kg_each_over_plan_unit, 2)} katı: plan işin bir kısmını
                  (ya da birden çok birimi) kapsıyor. €/kg kıyası geçerli, saat kıyası değil.
                </Text>
              ) : null}
              {plan.design_features?.length ? (
                <div className={css.tags}>
                  {plan.design_features.slice(0, 12).map((f) => (
                    <span key={f} className={css.tag}>
                      {f}
                    </span>
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <Text size="sm" c="dimmed">
              Bu işin çizimleri henüz okunmadı. Eşleşmede ailesi ve ağırlığıyla kullanılır.
            </Text>
          )}
        </div>

        {reference ? (
          <div className={css.detailBox} style={{ marginBottom: 14 }}>
            <h4>Aynı iş, İş referanslarında (kaynakçı saatleri)</h4>
            <div className={css.detailGrid} style={{ marginBottom: 0 }}>
              <div>
                <Kv k="Gerçek kaynakçı saati" v={`${fmt(reference.recorded_welding_h_per_unit, 1)} h/adet`} />
                <Kv k="Plan atölye saati" v={`${fmt(reference.shop_h_per_unit, 1)} h/adet`} />
              </div>
              <div>
                <Kv k="Faktör" v={<strong>{fmt(reference.factor, 2)}</strong>} />
                <Kv k="Birim kg (uygulamada)" v={fmt(reference.unit_mass_kg, 0)} />
              </div>
            </div>
            <Text size="xs" c="dimmed" mt={6}>
              Bu tablo işin € maliyetini, İş referansları ise saatlerini gösterir; tahmin ikisini ayrı yerlerde kullanır
              (saatler işçilik kalibrasyonunda, €/kg çapraz kontrolde).
            </Text>
            {onOpenReference ? (
              <Button
                size="compact-xs"
                variant="subtle"
                mt={6}
                leftSection={<FaIcon icon="fas fa-link" />}
                onClick={() => onOpenReference(reference.job_no)}
              >
                İş referansını aç
              </Button>
            ) : null}
          </div>
        ) : null}

        {flags.length || row.notes?.length ? (
          <div className={css.detailBox} style={{ marginBottom: 14 }}>
            <h4>Notlar</h4>
            {flags.length ? (
              <div className={css.tags}>
                {flags.map((f) => (
                  <StatusBadge key={f} color={f === 'per_kg_outlier' ? 'red' : 'orange'}>
                    {archiveFlagLabel(f)}
                  </StatusBadge>
                ))}
              </div>
            ) : null}
            {row.notes?.map((n, i) => (
              <Text key={i} size="sm" mt={6}>
                {n}
              </Text>
            ))}
          </div>
        ) : null}

        <Text size="xs" c="dimmed">
          Kaynak dosya: <span className={css.path}>{row.source_file || '—'}</span>
        </Text>

        <div className={css.noteBox}>
          {row.review_note ? (
            <Text size="sm" mb={6}>
              İnceleme notu: {row.review_note}
            </Text>
          ) : null}
          <Textarea
            aria-label="İnceleme notu"
            rows={2}
            placeholder="Not (hariç tutmak için zorunlu — ör. tablo TL girilmiş, kapsam farklı)"
            value={note}
            onChange={(e) => {
              setNote(e.currentTarget.value);
              setError('');
            }}
          />
          {error ? <div className={css.error}>{error}</div> : null}
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="default" onClick={onClose} disabled={saving != null}>
          Kapat
        </Button>
        {ACTIONS.filter((a) => a.status !== (row.review || 'unreviewed')).map((a) => (
          <Button
            key={a.status}
            color={a.color}
            variant={a.status === 'unreviewed' ? 'default' : 'filled'}
            leftSection={<FaIcon icon={a.icon} />}
            loading={saving === a.status}
            disabled={saving != null && saving !== a.status}
            onClick={() => void save(a.status)}
          >
            {a.label}
          </Button>
        ))}
      </ModalFooter>
    </Modal>
  );
}
