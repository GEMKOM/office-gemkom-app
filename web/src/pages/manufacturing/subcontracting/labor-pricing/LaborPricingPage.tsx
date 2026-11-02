import { Button, Grid, Group, MultiSelect, Stack, Text, TextInput, Tooltip } from '@mantine/core';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useJobOrderOptions } from '@/api/reference/jobOrders';
import {
  laborPricingQueryOptions,
  saveLaborPricingParams,
  type DifficultyMap,
  type LaborPricingKnobs,
  type LaborPricingLine,
  type LaborPricingParams,
  type LaborPricingReport,
  type LaborPricingRequest,
} from '@/api/subcontracting/laborPricing';
import {
  DataTable,
  FaIcon,
  notify,
  PageHeader,
  Panel,
  StatCards,
  type CellEdit,
  type StatCard,
} from '@/ui';
import { laborPricingColumns, rootGroupHeader } from './columns';
import { CostBreakdown } from './CostBreakdown';
import { asJobNos, resolveSaveJobNos } from './laborPricingSelection';
import {
  dayDigits,
  eur,
  fmt,
  HOURS_PER_YEVMIYE,
  loadThresholds,
  rowTint,
  saveThresholds,
  tl,
  toLimit,
  type Thresholds,
} from './laborPricingFormat';
import classes from './LaborPricing.module.css';

// Card field -> querystring key expected by the endpoint, with the legacy defaults.
const KNOBS: {
  key: keyof LaborPricingKnobs;
  label: string;
  placeholder: string;
  defaultValue: string;
  help?: string;
}[] = [
  { key: 'material_rate', label: 'Malzeme €/kg', placeholder: '1.50', defaultValue: '1.50' },
  { key: 'general_rate', label: 'Genel Gider €/kg', placeholder: '0.70', defaultValue: '0.70' },
  { key: 'margin_pct', label: 'Hedef Kâr %', placeholder: '30', defaultValue: '30' },
  {
    key: 'alpha',
    label: 'Ağırlık Etkisi (α)',
    placeholder: '0.75',
    defaultValue: '0.75',
    help:
      '1,00 = işçilik tamamen kiloya orantılı. 0,00 = ağırlıktan bağımsız, her parça aynı ücret. ' +
      '0,75’te bir parçanın ağırlığı iki katına çıkınca işçiliği %100 değil %68 artar, ' +
      'yani kilogram başına oranı %16 düşer.',
  },
  {
    key: 'factor_min',
    label: 'Oran Alt Sınırı ×',
    placeholder: '0.70',
    defaultValue: '0.70',
    help:
      'En ağır parçaların oranı taban oranın bu katının altına inemez. ' +
      'Taşeronun kabul etmeyeceği kadar düşük bir kilogram fiyatı çıkmasını engeller.',
  },
  {
    key: 'factor_max',
    label: 'Oran Üst Sınırı ×',
    placeholder: '2.00',
    defaultValue: '2.00',
    help:
      'En hafif parçaların oranı taban oranın bu katını aşamaz. ' +
      'Sınır olmazsa en küçük parçalar kendi satış fiyatlarının üzerine çıkar ve o kalemin kârı sıfırlanır.',
  },
];

type KnobValues = Record<keyof LaborPricingKnobs, string>;
const KNOB_DEFAULTS = Object.fromEntries(KNOBS.map((k) => [k.key, k.defaultValue])) as KnobValues;

const SUPPORT_HELP =
  `Taşerona kilo fiyatının dışında gündelik olarak ödenecek iş. 1 yevmiye = 1 gün = ${HOURS_PER_YEVMIYE} saat. ` +
  'Tutarı işçilik havuzundan düşülür, kalanı kalemlere kilo fiyatı olarak dağıtılır; toplam kâr oranı değişmez.';

const EMPTY_LINES: LaborPricingLine[] = [];
const EMPTY_REQUEST: LaborPricingRequest = { jobNos: [], params: {}, difficulty: {} };

/** A hoverable help marker inside a field label. */
function LabelWithHelp({ label, help }: { label: string; help?: string }) {
  if (!help) return <>{label}</>;
  return (
    <>
      {label}{' '}
      <Tooltip label={help} multiline w={320} withArrow>
        <span style={{ color: 'var(--gk-muted)', cursor: 'help' }}>
          <FaIcon icon="fas fa-circle-question" />
        </span>
      </Tooltip>
    </>
  );
}

function supportNumbers(daysText: string, rateText: string) {
  const days = Number(daysText || 0);
  const rate = Number(rateText || 0);
  return {
    days: Number.isFinite(days) && days > 0 ? days : 0,
    rate: Number.isFinite(rate) && rate > 0 ? rate : 0,
  };
}

/** The six knobs that are saved onto the job orders (empty ones are left out). */
function knobParams(knobs: KnobValues): LaborPricingKnobs {
  const params: LaborPricingKnobs = {};
  for (const { key } of KNOBS) {
    if (knobs[key] !== '' && knobs[key] !== undefined && knobs[key] !== null)
      params[key] = knobs[key];
  }
  return params;
}

/** Live total under the yevmiye inputs; the € figure needs a calculated report for the rate. */
function SupportSummary({
  days,
  rate,
  report,
}: {
  days: number;
  rate: number;
  report: LaborPricingReport | null;
}) {
  let content: ReactNode;
  if (!days) {
    content = `1 yevmiye = ${HOURS_PER_YEVMIYE} saat. Yevmiye girilirse tutarı işçilik havuzundan düşülür.`;
  } else {
    const hours = `${fmt(days * HOURS_PER_YEVMIYE, dayDigits(days))} saat`;
    if (!rate) {
      content = (
        <>
          = {hours} ·{' '}
          <Text span c="red.8" size="sm">
            yevmiye ücreti girilmedi
          </Text>
        </>
      );
    } else {
      const fx = Number(report?.totals?.eur_try_rate);
      content = (
        <>
          = {hours} · <strong>{tl(days * rate)}</strong>
          {Number.isFinite(fx) && fx > 0 ? (
            <>
              {' '}
              ≈ <strong>{eur((days * rate) / fx)}</strong>
            </>
          ) : null}{' '}
          — işçilik havuzundan düşülür, kalanı kilo fiyatına dağıtılır.
        </>
      );
    }
  }
  return (
    <Text size="sm" c="dimmed" data-testid="support-summary">
      {content}
    </Text>
  );
}

function statCards(report: LaborPricingReport): StatCard[] {
  const t = report.totals;
  const hasSupport = Number(t.support_eur) > 0;
  // No card of its own for the yevmiye: the breakdown bar and the input row already show it.
  return [
    {
      id: 'lp-labor-rate',
      title:
        t.labor_per_kg_try !== null
          ? `Taşerona verilebilir · ${fmt(Number(t.labor_per_kg_try), 2)} ₺/kg`
          : 'Taşerona verilebilir',
      value: `${fmt(Number(t.labor_per_kg), 3)} €/kg`,
      icon: 'fas fa-hand-holding-dollar',
      color: t.is_feasible && !t.support_exceeds_pool ? 'primary' : 'danger',
      tooltip:
        `Temel oran k = ${fmt(Number(t.base_rate_k), 4)} €/kg, referans ağırlık ${fmt(Number(t.reference_weight_kg), 0)} kg` +
        (hasSupport
          ? ` · yevmiye dahil; kilo fiyatına kalan ${fmt(Number(t.kg_labor_per_kg), 3)} €/kg`
          : ''),
    },
    {
      id: 'lp-pool',
      title: hasSupport
        ? `İşçilik havuzu · ${t.line_count} kalem · ${eur(t.support_eur)} yevmiye`
        : `İşçilik havuzu · ${t.line_count} kalem`,
      value: eur(t.labor_pool_eur),
      icon: 'fas fa-coins',
      color: t.support_exceeds_pool ? 'danger' : 'info',
      tooltip:
        `${t.piece_count} adet · kalemlere kilo fiyatıyla dağıtılan ${eur(t.labor_allocated_eur)}` +
        (hasSupport ? ` · yevmiye ${tl(t.support_try)} ≈ ${eur(t.support_eur)}` : ''),
    },
    {
      id: 'lp-weight',
      title: 'Toplam ağırlık',
      value: `${fmt(Number(t.total_weight_kg), 0)} kg`,
      icon: 'fas fa-weight-hanging',
      color: 'secondary',
    },
    {
      id: 'lp-revenue',
      title: `Satış · ${fmt(Number(t.revenue_per_kg), 2)} €/kg`,
      value: eur(t.total_price_eur),
      icon: 'fas fa-file-invoice',
      color: 'dark',
      tooltip: 'Nakliye hariç — ayrıca fiyatlanıyor',
    },
    {
      id: 'lp-profit',
      title: `Kalan kâr · %${fmt(Number(report.params.margin_pct), 0)}`,
      value: eur(t.profit_eur),
      icon: 'fas fa-chart-line',
      color: 'success',
    },
  ];
}

const sameRequest = (a: LaborPricingRequest, b: LaborPricingRequest) =>
  JSON.stringify(a) === JSON.stringify(b);

/** Port of manufacturing/subcontracting/labor-pricing (labor-pricing.js). */
export function LaborPricingPage() {
  const queryClient = useQueryClient();

  // The Hesaplama card: read live, like the legacy filter bar.
  const [jobDraft, setJobDraft] = useState<string[]>([]);
  const [knobs, setKnobs] = useState<KnobValues>(KNOB_DEFAULTS);
  const [supportDays, setSupportDays] = useState('0');
  const [supportRate, setSupportRate] = useState('');
  // The jobs of the last Hesapla (or save); difficulties are keyed by job no and
  // survive a recalculation — the backend ignores any not in the selection.
  const [selected, setSelected] = useState<string[]>([]);
  const [difficulty, setDifficulty] = useState<DifficultyMap>({});
  // What is on screen. Quiet: a difficulty edit keeps the table instead of an overlay.
  const [request, setRequest] = useState<LaborPricingRequest>(EMPTY_REQUEST);
  const [quiet, setQuiet] = useState(false);
  // A slower earlier edit must not paint over a newer calculation.
  const seq = useRef(0);

  const [thresholds, setThresholds] = useState<Thresholds>(loadThresholds);
  const [thresholdText, setThresholdText] = useState(() => ({
    green: thresholds.green === null ? '' : String(thresholds.green),
    red: thresholds.red === null ? '' : String(thresholds.red),
  }));

  const jobs = useJobOrderOptions({ rootOnly: true, withCustomer: true });
  useEffect(() => {
    if (jobs.isError) notify.error('İş emirleri yüklenemedi');
  }, [jobs.isError]);
  const jobOptions = useMemo(
    () =>
      (jobs.data ?? [])
        // '1000' is the synthetic "Fabrika İşleri" catch-all, not a real job
        // order — there is nothing under it to price.
        .filter((job) => job.job_no !== '1000')
        .map((job) => ({
          value: job.job_no,
          label: `${job.job_no} · ${job.title || ''}${job.customer_name ? ` · ${job.customer_name}` : ''}`,
        })),
    [jobs.data],
  );

  const hasSelection = request.jobNos.length > 0;
  const query = useQuery({
    ...laborPricingQueryOptions(request),
    enabled: hasSelection,
    placeholderData: keepPreviousData,
  });
  const report: LaborPricingReport | null =
    hasSelection && !query.isError ? (query.data ?? null) : null;

  useEffect(() => {
    if (query.isError)
      notify.error(query.error, { fallback: 'İşçilik fiyatı hesaplanırken hata oluştu' });
  }, [query.isError, query.error, query.errorUpdatedAt]);

  const support = supportNumbers(supportDays, supportRate);

  /** Everything the calculation takes: the knobs plus the yevmiye. */
  const calculationParams = (): LaborPricingParams => ({
    ...knobParams(knobs),
    support_days: support.days,
    support_day_rate_try: support.rate,
  });

  const recompute = (jobNos: string[], nextDifficulty: DifficultyMap = difficulty) => {
    seq.current += 1;
    const next: LaborPricingRequest = jobNos.length
      ? { jobNos, params: calculationParams(), difficulty: nextDifficulty }
      : EMPTY_REQUEST;
    setQuiet(false);
    if (sameRequest(next, request)) {
      if (next.jobNos.length) void query.refetch();
    } else {
      setRequest(next);
    }
  };

  const calculate = () => {
    const jobNos = asJobNos(jobDraft);
    setSelected(jobNos);
    recompute(jobNos);
  };

  const reset = () => {
    setSelected([]);
    setDifficulty({});
    setJobDraft([]);
    setKnobs(KNOB_DEFAULTS);
    setSupportDays('0');
    setSupportRate('');
    seq.current += 1;
    setQuiet(false);
    setRequest(EMPTY_REQUEST);
  };

  const onEnter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      calculate();
    }
  };

  const [saving, setSaving] = useState(false);
  const saveParams = async () => {
    const jobNos = resolveSaveJobNos({ filterJobNos: jobDraft, computedJobNos: selected });
    if (!jobNos.length) {
      notify.warning('Önce iş emri seçin');
      return;
    }
    setSaving(true);
    try {
      const result = await saveLaborPricingParams(jobNos, knobParams(knobs));
      setSelected(jobNos);
      notify.success(`${result.saved?.length ?? 0} iş emrine kaydedildi`);
    } catch (error) {
      notify.error(error, { fallback: 'Parametreler kaydedilirken hata oluştu' });
    } finally {
      setSaving(false);
    }
  };

  /** Legacy onEdit: keep the difficulty and recalculate quietly. */
  const editDifficulty = async ({ row, value }: CellEdit<LaborPricingLine>) => {
    const parsed = Number(value);
    const nextDifficulty = { ...difficulty };
    if (value !== null && Number.isFinite(parsed) && parsed > 0)
      nextDifficulty[row.job_no] = parsed;
    else delete nextDifficulty[row.job_no];
    const next: LaborPricingRequest = {
      jobNos: selected,
      params: calculationParams(),
      difficulty: nextDifficulty,
    };
    const mine = ++seq.current;
    // The cell shows the new value and a spinner until the new report is in;
    // a failure rolls the cell back and keeps the previous report.
    await queryClient.fetchQuery(laborPricingQueryOptions(next));
    setDifficulty(nextDifficulty);
    if (mine !== seq.current) return; // a newer calculation already won
    setQuiet(true);
    setRequest(next);
  };

  const setThreshold = (key: keyof Thresholds, text: string) => {
    setThresholdText((prev) => ({ ...prev, [key]: text }));
    const next = { ...thresholds, [key]: toLimit(text) };
    setThresholds(next);
    saveThresholds(next);
  };

  const lines = report?.lines ?? EMPTY_LINES;
  const today = new Date().toISOString().split('T')[0];

  return (
    <>
      <PageHeader
        title="Taşeron İşçilik Fiyatı"
        subtitle="Satış fiyatından geriye giderek taşerona verilebilecek €/kg işçiliği hesaplar"
        icon="calculator"
        backTo="/manufacturing/subcontracting"
        actions={
          <>
            <Button
              variant="default"
              leftSection={<FaIcon icon="fas fa-sync-alt" />}
              onClick={() => recompute(selected)}
            >
              Yenile
            </Button>
            <Button
              leftSection={<FaIcon icon="fas fa-save" />}
              onClick={() => void saveParams()}
              loading={saving}
            >
              Parametreleri Kaydet
            </Button>
          </>
        }
      />

      <Stack gap="md">
        <Panel
          title="Hesaplama"
          icon="fas fa-filter"
          actions={
            <>
              <Button
                size="xs"
                variant="default"
                onClick={reset}
                leftSection={<FaIcon icon="fas fa-times" />}
              >
                Sıfırla
              </Button>
              <Button
                size="xs"
                onClick={calculate}
                leftSection={<FaIcon icon="fas fa-calculator" />}
              >
                Hesapla
              </Button>
            </>
          }
        >
          <Grid gap="sm" align="flex-end">
            <Grid.Col span={{ base: 12, lg: 4 }}>
              <MultiSelect
                size="xs"
                label="İş Emirleri"
                placeholder={
                  jobDraft.length ? undefined : 'İş emri seçin (birden fazla seçilebilir)'
                }
                data={jobOptions}
                value={jobDraft}
                onChange={setJobDraft}
                searchable
                clearable
                nothingFoundMessage="Sonuç bulunamadı"
                maxDropdownHeight={320}
              />
            </Grid.Col>
            {KNOBS.map((knob) => (
              <Grid.Col key={knob.key} span={{ base: 6, sm: 4, lg: 'auto' }}>
                <TextInput
                  size="xs"
                  type="number"
                  label={<LabelWithHelp label={knob.label} help={knob.help} />}
                  placeholder={knob.placeholder}
                  value={knobs[knob.key]}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setKnobs((prev) => ({ ...prev, [knob.key]: value }));
                  }}
                  onKeyDown={onEnter}
                />
              </Grid.Col>
            ))}
          </Grid>
          {/* Yevmiye: never saved onto the job orders — a day count belongs to the quote. */}
          <Grid gap="sm" align="flex-end" mt="xs">
            <Grid.Col span={{ base: 6, md: 2 }}>
              <TextInput
                size="xs"
                type="number"
                min={0}
                step={0.5}
                label={<LabelWithHelp label="Yevmiye (gün)" help={SUPPORT_HELP} />}
                placeholder="0"
                value={supportDays}
                onChange={(event) => setSupportDays(event.currentTarget.value)}
                onKeyDown={onEnter}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 6, md: 2 }}>
              <TextInput
                size="xs"
                type="number"
                min={0}
                step={50}
                label="Yevmiye Ücreti ₺"
                placeholder="örn. 3500"
                value={supportRate}
                onChange={(event) => setSupportRate(event.currentTarget.value)}
                onKeyDown={onEnter}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 8 }}>
              <SupportSummary days={support.days} rate={support.rate} report={report} />
            </Grid.Col>
          </Grid>
        </Panel>

        {report ? <StatCards cards={statCards(report)} cols={5} /> : null}

        <CostBreakdown report={report} />

        <DataTable
          title="Alt Kalemler"
          icon="fas fa-table-list"
          toolbar={
            <Group gap="md" wrap="wrap" align="center">
              <Text size="xs" fw={600} c="dimmed">
                <FaIcon icon="fas fa-fill-drip" /> İşçilik €/kg sınırları
              </Text>
              <Group gap={6} wrap="nowrap">
                <span className={`${classes.swatch} ${classes.swatchGreen}`} />
                <Text size="xs" component="label" htmlFor="th-green">
                  Şunun altı iyi:
                </Text>
                <TextInput
                  id="th-green"
                  size="xs"
                  w={88}
                  type="number"
                  step={0.05}
                  min={0}
                  placeholder="örn. 1,00"
                  aria-label="Yeşil sınır, €/kg"
                  value={thresholdText.green}
                  onChange={(event) => setThreshold('green', event.currentTarget.value)}
                />
                <Text size="xs" c="dimmed">
                  €/kg
                </Text>
              </Group>
              <Group gap={6} wrap="nowrap">
                <span className={`${classes.swatch} ${classes.swatchRed}`} />
                <Text size="xs" component="label" htmlFor="th-red">
                  Şunun üstü pahalı:
                </Text>
                <TextInput
                  id="th-red"
                  size="xs"
                  w={88}
                  type="number"
                  step={0.05}
                  min={0}
                  placeholder="örn. 2,00"
                  aria-label="Kırmızı sınır, €/kg"
                  value={thresholdText.red}
                  onChange={(event) => setThreshold('red', event.currentTarget.value)}
                />
                <Text size="xs" c="dimmed">
                  €/kg
                </Text>
              </Group>
              <Text size="xs" c="dimmed">
                Boş bırakılan sınır kapalıdır.
              </Text>
            </Group>
          }
          data={lines}
          columns={laborPricingColumns}
          getRowId={(row) => row.job_no}
          loading={hasSelection && query.isFetching && !quiet}
          sortable
          // Striping would fight the threshold tints: here the row colour carries meaning.
          striped={false}
          stickyHeader
          rowStyle={(row) => {
            const background = rowTint(row.labor_per_kg, thresholds);
            return background ? { background } : undefined;
          }}
          extraData={thresholds}
          exportable={{ fileName: `lines-placeholder_${today}` }}
          onCellEdit={editDifficulty}
          grouping={{ by: 'root_job_no', header: rootGroupHeader }}
          emptyMessage="İş emri seçin ve Hesapla’ya basın"
        />
      </Stack>
    </>
  );
}
