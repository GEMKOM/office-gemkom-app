import { Alert, Grid, List, Text } from '@mantine/core';
import type { LaborPricingReport, LaborPricingTotals } from '@/api/subcontracting/laborPricing';
import { FaIcon, Panel } from '@/ui';
import { dayDigits, eur, fmt, HOURS_PER_YEVMIYE, tl } from './laborPricingFormat';
import classes from './LaborPricing.module.css';

// Cost bar segments, in the order they stack across a kilogram of steel.
// The yevmiye segment only shows up when there is one.
const SEGMENTS: {
  key: keyof LaborPricingTotals;
  label: string;
  color: string;
  optional?: boolean;
}[] = [
  { key: 'material_per_kg', label: 'Malzeme', color: '#455a67' },
  { key: 'general_per_kg', label: 'Genel gider', color: '#7c909d' },
  { key: 'kg_labor_per_kg', label: 'İşçilik (kg fiyatı)', color: '#c4470f' },
  { key: 'support_per_kg', label: 'Yevmiye', color: '#e08a5b', optional: true },
  { key: 'profit_per_kg', label: 'Kâr', color: '#276b4c' },
];

const n = (value: unknown) => Number(value);

/** Shown before anything is calculated, so the parameters are not a puzzle. */
function Explainer() {
  return (
    <Panel title="Nasıl Çalışır" icon="fas fa-circle-info">
      <Grid gap="md">
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Text size="sm" mb="xs">
            <strong>1 · Havuz.</strong> Teklifteki satış fiyatından malzeme, genel gider ve hedef
            kâr düşülür; kalan tutar taşerona verilebilecek işçiliktir.{' '}
            <em>Nakliye bu hesaba girmez</em> — ayrıca fiyatlanıyor.
          </Text>
          <Text size="sm">
            <strong>2 · Dağıtım.</strong> İşçilik ağırlıkla doğru orantılı değildir: 24 kg’lık bir
            panel, 6.100 kg’lık birinin 254’te biri kadar iş değildir. Bu yüzden her kalem
            ağırlığına değil <em>emek ağırlığına</em> göre pay alır — hafif parçalar kilogram başına
            daha yüksek oran alır. Havuz sabit olduğu için toplam kâr oranı her koşulda hedefte
            kalır.
          </Text>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <List size="sm" spacing="xs">
            <List.Item>
              <strong>Ağırlık Etkisi (α)</strong> — işçiliğin ağırlığı ne kadar takip ettiği.{' '}
              <strong>1,00</strong> düz €/kg demek; <strong>0,00</strong> ağırlıktan bağımsız sabit
              €/adet demek. <strong>0,75</strong>’te ağırlık iki katına çıkınca işçilik %68 artar.
            </List.Item>
            <List.Item>
              <strong>Oran Üst Sınırı ×</strong> — en hafif parçaların oranına tavan. Olmazsa küçük
              parçalar kendi satış fiyatlarının üzerine çıkar.
            </List.Item>
            <List.Item>
              <strong>Oran Alt Sınırı ×</strong> — en ağır parçaların oranına taban. Taşeronun kabul
              etmeyeceği kadar düşük fiyat çıkmasını engeller.
            </List.Item>
            <List.Item>
              <strong>Yevmiye</strong> — taşerona kilo fiyatının dışında gündelik ödenen iş (1
              yevmiye = {HOURS_PER_YEVMIYE} saat). Tutarı havuzdan önce düşülür, kalanı kalemlere
              kilo fiyatı olarak dağıtılır.
            </List.Item>
          </List>
        </Grid.Col>
      </Grid>
    </Panel>
  );
}

/** Which rate the ₺ figures use. Snapshots are only taken on working days. */
function FxNote({ totals }: { totals: LaborPricingTotals }) {
  if (!totals.eur_try_rate) {
    return (
      <Text size="sm" c="red.8" mt="xs">
        <FaIcon icon="fas fa-triangle-exclamation" /> Kayıtlı döviz kuru bulunamadı; ₺ karşılıkları
        gösterilemiyor.
      </Text>
    );
  }
  const [y, m, d] = (totals.fx_date || '').split('-');
  const today = new Date();
  const isToday =
    Number(y) === today.getFullYear() &&
    Number(m) === today.getMonth() + 1 &&
    Number(d) === today.getDate();
  return (
    <Text size="sm" c="dimmed" mt="xs" data-testid="fx-note">
      <FaIcon icon="fas fa-money-bill-transfer" /> ₺ karşılıkları{' '}
      {isToday ? (
        'bugünün'
      ) : (
        <>
          <strong>
            {d}.{m}.{y}
          </strong>{' '}
          tarihli
        </>
      )}{' '}
      kuruyla: <strong>1 € = {fmt(n(totals.eur_try_rate), 4)} ₺</strong>
      {isToday ? '' : ' (bugüne ait kur henüz kaydedilmedi)'}.
    </Text>
  );
}

function Warnings({ report }: { report: LaborPricingReport }) {
  const t = report.totals;
  const blocks = [];

  if (t.is_feasible && t.support_exceeds_pool) {
    blocks.push(
      <Alert
        key="support"
        color="red"
        variant="light"
        mt="md"
        icon={<FaIcon icon="fas fa-triangle-exclamation" />}
      >
        <strong>Yevmiye işçilik havuzunu aşıyor.</strong>{' '}
        {fmt(n(t.support_days), dayDigits(n(t.support_days)))} yevmiye {tl(t.support_try)} (≈{' '}
        {eur(t.support_eur)}) ediyor; tüm işçilik havuzu ise {eur(t.labor_pool_eur)}. Kilo fiyatına
        para kalmıyor — yevmiye sayısını veya ücretini düşürün.
      </Alert>,
    );
  }

  if (!t.is_feasible) {
    const costs = n(t.material_per_kg) + n(t.general_per_kg) + n(t.profit_per_kg);
    blocks.push(
      <Alert
        key="feasible"
        color="red"
        variant="light"
        mt="md"
        icon={<FaIcon icon="fas fa-triangle-exclamation" />}
      >
        <strong>İşçilik için para kalmıyor.</strong> Malzeme, genel gider ve %
        {fmt(n(report.params.margin_pct), 0)} kâr birlikte kilogram başına {fmt(costs, 3)} € ediyor;
        satış ise {fmt(n(t.revenue_per_kg), 4)} €/kg. Kâr hedefini düşürün ya da satış fiyatı
        yetersiz.
      </Alert>,
    );
  } else if (n(t.labor_per_kg) < 0.35) {
    blocks.push(
      <Alert
        key="thin"
        color="orange"
        variant="light"
        mt="md"
        icon={<FaIcon icon="fas fa-triangle-exclamation" />}
      >
        <strong>Çok ince.</strong> {fmt(n(t.labor_per_kg), 3)} €/kg bu tür plaka imalatını
        karşılamaz. Maliyet girdilerinden biri ya da kâr hedefi gözden geçirilmeli.
      </Alert>,
    );
  }

  if (report.skipped?.length) {
    const names = report.skipped
      .slice(0, 8)
      .map((s) => s.job_no)
      .join(', ');
    blocks.push(
      <Alert
        key="skipped"
        color="orange"
        variant="light"
        mt="md"
        icon={<FaIcon icon="fas fa-circle-info" />}
      >
        <strong>{report.skipped.length} kalem hesaba katılmadı</strong> (ağırlık veya satış fiyatı
        girilmemiş): {names}
        {report.skipped.length > 8 ? '…' : ''}. Eksik ağırlık diğer kalemlerin fiyatını sessizce
        yükseltir.
      </Alert>,
    );
  }
  return <>{blocks}</>;
}

/** "Bir Kilogram Nereye Gidiyor" (legacy renderBreakdown); the explainer before a calculation. */
export function CostBreakdown({ report }: { report: LaborPricingReport | null }) {
  if (!report) return <Explainer />;
  const t = report.totals;
  const segments = SEGMENTS.map((s) => ({ ...s, value: Math.max(0, n(t[s.key])) })).filter(
    (s) => !s.optional || s.value > 0,
  );
  const total = segments.reduce((sum, s) => sum + (Number.isFinite(s.value) ? s.value : 0), 0) || 1;
  const alpha = n(report.params.alpha);
  const hasSupport = n(t.support_eur) > 0;
  const laborTry = t.labor_per_kg_try !== null ? ` (${fmt(n(t.labor_per_kg_try), 2)} ₺)` : '';

  return (
    <Panel title="Bir Kilogram Nereye Gidiyor" icon="fas fa-percent">
      <div className={classes.bar} aria-hidden>
        {segments.map((s) => (
          <span key={s.key} style={{ flex: s.value / total, background: s.color }} />
        ))}
      </div>
      <div className={classes.barKey}>
        {segments.map((s) => (
          <div key={s.key}>
            <i style={{ background: s.color }} />
            {s.label} <b>{fmt(s.value, 3)} €</b>
          </div>
        ))}
      </div>
      <Text size="sm" c="dimmed" mt="md">
        Kilogram başına <strong>{fmt(n(t.revenue_per_kg), 4)} €</strong> satıyorsunuz,{' '}
        <strong>{fmt(n(t.profit_per_kg), 3)} €</strong> kâr olarak kalıyor,{' '}
        <strong>{fmt(n(t.labor_per_kg), 3)} €</strong>
        {laborTry} taşerona verilebilir.{' '}
        {hasSupport ? (
          <>
            Bunun <strong>{fmt(n(t.support_per_kg), 3)} €</strong>’su{' '}
            {fmt(n(t.support_days), dayDigits(n(t.support_days)))} yevmiyeye ({tl(t.support_try)})
            gidiyor; kalan <strong>{fmt(n(t.kg_labor_per_kg), 3)} €</strong>
            {t.kg_labor_per_kg_try !== null && t.kg_labor_per_kg_try !== undefined
              ? ` (${fmt(n(t.kg_labor_per_kg_try), 2)} ₺)`
              : ''}{' '}
            kilo fiyatı olarak dağıtılıyor.{' '}
          </>
        ) : null}
        Nakliye bu hesaba girmez — ayrıca fiyatlanıyor. α = {fmt(alpha, 2)} olduğu için bir parçanın
        ağırlığı iki katına çıktığında işçiliği %100 değil{' '}
        <strong>%{fmt((Math.pow(2, alpha) - 1) * 100, 0)}</strong> artar; kilogram başına fiyatı %
        {fmt((1 - Math.pow(2, alpha - 1)) * 100, 0)} düşer. Alt/üst kat sayılar bunu iki uçta
        sınırlar.
      </Text>
      <FxNote totals={t} />
      <Warnings report={report} />
    </Panel>
  );
}
