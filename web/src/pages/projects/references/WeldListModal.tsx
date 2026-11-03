import { SCHEMA_LABELS, STRUCTURE_CLASS_LABELS, WORK_CENTRE_LABELS } from '@/api/projects/estimator';
import { fmt, isPlanBottomUp } from '../estimate-report/reportModel';
import {
  formatDateTime,
  JOINT_TYPE_LABELS,
  MATERIAL_LABELS,
  PROCESS_LABELS,
  processLabel,
} from '../estimate-report/reportParts';
import { Button, Loader, Modal, NativeSelect, Text, Textarea, TextInput } from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { isApiError } from '@/api/client';
import type { WeldJoint } from '@/api/projects/estimator';
import {
  jobWeldScheduleQueryOptions,
  previewWeldScheduleVersion,
  referenceKeys,
  saveWeldScheduleVersion,
  type ReferenceProfile,
  type WeldScheduleVersion,
} from '@/api/projects/references';
import { confirm, DataTable, errorMessage, FaIcon, ModalBody, ModalFooter, ModalHeader, modalClassNames, notify, StatusBadge, type DataTableColumn } from '@/ui';
import estCss from '../estimate-report/EstimateReport.module.css';
import { ConfidenceBadge, LegacyBadge } from '../estimate-report/LegacyBadge';
import { PlanParts, PlanTable } from '../estimate-report/PlanTables';
import { SourceBadge } from '../estimate-report/WeldTable';
import { ProfileFacts } from './ProfileFacts';
import css from './ReferencesPage.module.css';
import {
  draftFromSchedule,
  draftPayload,
  draftTotals,
  JOINT_MATERIAL_CODES,
  MASS_MATERIAL_CODES,
  newJoint,
  rowMetres,
  type DraftErrors,
  type DraftJoint,
  type WeldDraft,
} from './weldDraft';

const PREVIEW_DELAY_MS = 350;
const DISCARD = 'Kaydedilmemiş düzeltmeler kaybolacak. Devam edilsin mi?';
// "Not given" in either language (English schedules until translate_weld_schedules runs).
const EMPTY_VALUES = new Set(['not specified', 'none', 'n/a', 'belirtilmemiş', 'yok']);
const UNIT_LABELS: Record<string, string> = { 'h/piece': 'h/parça', 'h/bend': 'h/büküm', 'h/pressure joint': 'h/basınçlı birleşim', 'h/kg': 'h/kg' };
const NON_WELDING_LABELS: Record<string, string> = {
  cutting: 'Kesim',
  bending: 'Büküm',
  bevel_and_pt: 'Ağız açma + PT',
  handling: 'Çatma, çevirme, temizlik',
  hydrotest: 'Hidrotest',
  fitup_hydrotest_cleaning: 'Çatma, hidrotest, temizlik',
};
// Groove shape of a joint as the geometry model read it (weld_geometry.PREP_CODES).
const PREP_LABELS: Record<string, string> = { I: 'I alın', V: 'V ağız', HV: 'Yarım V', X: 'X ağız', K: 'K ağız', U: 'U ağız', fillet: 'Köşe' };

type Line = { unit_h?: number; unit?: string; hours?: number; thickness_mm?: number; throat_mm?: number; prep?: string; sides?: number; kg_per_m?: number; geometry_source?: string };
type ViewJoint = WeldJoint & { unit_h?: number; unit_label?: string; hours?: number; geometry?: Line; weld_detail?: string; basis?: string; evidence?: string };
type BottomUp = Record<string, unknown> & {
  lines?: Line[];
  non_welding_lines?: { step: string; applies?: boolean; qty?: number; unit?: string; unit_h?: number; hours?: number }[];
  welding_h?: number;
  non_welding_h?: number;
  total_h?: number;
  plan_confidence?: number;
  parts_count?: number;
  schema_version?: number;
};

/** "Geometri: t=25 mm · a=10 · Köşe · 0,90 kg/m · boğaz varsayılan". */
function geometryText(g: Line | undefined): string {
  if (!g || g.thickness_mm == null) return '';
  const parts = [`t=${fmt(g.thickness_mm, 0)} mm`];
  if (g.throat_mm) parts.push(`a=${fmt(g.throat_mm, 0)}`);
  parts.push(`${PREP_LABELS[g.prep ?? ''] || g.prep || ''}${g.sides === 2 ? ' (çift taraf)' : ''}`);
  if (g.kg_per_m != null) parts.push(`${fmt(g.kg_per_m, 2)} kg/m`);
  const source = String(g.geometry_source || '');
  if (source.startsWith('default')) parts.push('ölçü okunamadı, varsayılan');
  else if (source.includes('throat_default')) parts.push('boğaz varsayılan');
  return `Geometri: ${parts.join(' · ')}`;
}

function jointDetail(j: ViewJoint): string {
  return [
    j.size && `Ölçü: ${j.size}`,
    j.process && `Proses: ${processLabel(j.process)}`,
    j.weld_detail && !EMPTY_VALUES.has(String(j.weld_detail).trim().toLowerCase()) && `Detay: ${j.weld_detail}`,
    j.ndt && !EMPTY_VALUES.has(String(j.ndt).trim().toLowerCase()) && `NDT: ${j.ndt}`,
    j.basis && `Dayanak: ${j.basis}`,
    geometryText(j.geometry),
  ]
    .filter(Boolean)
    .join(' · ');
}

/** The Tahmin card's plan tables (and source badges), styled like the card. */
function EstScope({ children }: { children: ReactNode }) {
  return <div className={estCss.scope}>{children}</div>;
}

export interface WeldListModalProps {
  row: ReferenceProfile;
  onClose: () => void;
  /** A saved version recomputes the profile (factor, totals). */
  onProfileSaved: (profile: ReferenceProfile) => void;
}

/** The job's weld list: view, versions and Düzenle (legacy openWeldList and the edit mode). */
export function WeldListModal({ row: initialRow, onClose, onProfileSaved }: WeldListModalProps) {
  const queryClient = useQueryClient();
  const [row, setRow] = useState(initialRow);
  const [version, setVersion] = useState<number | null>(null);
  const [draft, setDraft] = useState<WeldDraft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<DraftErrors>({});
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const weld = useQuery({ ...jobWeldScheduleQueryOptions(row.job_no, version), staleTime: 0 });
  const ws = weld.data;

  const confirmDiscard = async () => !draft || !dirty || (await confirm({ message: DISCARD, confirmLabel: 'Devam', danger: true }));

  const close = async () => {
    if (await confirmDiscard()) onClose();
  };

  const showVersion = async (v: number | null) => {
    if (!(await confirmDiscard())) return;
    setDraft(null);
    setDirty(false);
    setVersion(v);
  };

  const startEdit = () => {
    if (!ws) return;
    setDraft(draftFromSchedule(ws));
    setDirty(false);
    setErrors({});
    setSaveError('');
  };

  const save = async () => {
    if (!draft || !ws) return;
    const { payload, errors: found } = draftPayload(draft);
    if (!payload.note) found.note = 'Neyi neden düzelttiğinizi yazın (ör. kep sayısı 7→9, pafta 3).';
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    setSaveError('');
    try {
      const result = await saveWeldScheduleVersion(row.job_no, payload);
      const saved = result.weld_schedule;
      if (result.profile) {
        setRow(result.profile);
        onProfileSaved(result.profile);
      }
      queryClient.setQueryData(referenceKeys.weld(row.job_no, null), saved);
      setDraft(null);
      setDirty(false);
      setVersion(null);
      notify.success(`${row.job_no}: kaynak listesi v${saved.version} kaydedildi; faktör yeniden hesaplandı.`);
    } catch (error) {
      const fieldErrors = isApiError(error) ? (error.data as { errors?: DraftErrors } | undefined)?.errors : undefined;
      setErrors(fieldErrors ?? {});
      if (!fieldErrors) setSaveError(errorMessage(error, 'Kaydedilemedi'));
      notify.error(error, { fallback: 'Kaynak listesi kaydedilemedi' });
    } finally {
      setSaving(false);
    }
  };

  let body: ReactNode;
  if (weld.isPending) {
    body = (
      <Text size="sm" c="dimmed">
        <Loader size={12} mr={6} />
        Kaynak listesi yükleniyor…
      </Text>
    );
  } else if (!ws) {
    body = (
      <Text size="sm" c="red">
        {errorMessage(weld.error, 'Kaynak listesi yüklenemedi')}
      </Text>
    );
  } else if (draft) {
    body = (
      <WeldEditor
        jobNo={row.job_no}
        ws={ws}
        draft={draft}
        errors={errors}
        saveError={saveError}
        onChange={(next, { hours }) => {
          setDraft(next);
          setDirty(true);
          if (hours) setErrors({});
        }}
        onPreviewErrors={setErrors}
      />
    );
  } else {
    body = <WeldView ws={ws} onVersion={(v) => void showVersion(v)} />;
  }

  return (
    <Modal
      opened
      onClose={() => void close()}
      size="min(1400px, 96vw)"
      withCloseButton={false}
      classNames={modalClassNames}
    >
      <ModalHeader icon="fas fa-list-ol" title={`${row.job_no} — ${row.title || ''}`} />
      <ModalBody>
        <ProfileFacts row={row} />
        <div data-testid="weld-body">{body}</div>
      </ModalBody>
      <ModalFooter>
        {draft ? (
          <>
            <Button variant="default" onClick={() => void showVersion(version)} disabled={saving}>
              Vazgeç
            </Button>
            <Button leftSection={<FaIcon icon="fas fa-save" />} loading={saving} onClick={() => void save()}>
              Yeni sürüm olarak kaydet
            </Button>
          </>
        ) : (
          <>
            <Button variant="default" leftSection={<FaIcon icon="fas fa-times" />} onClick={() => void close()}>
              Kapat
            </Button>
            {ws ? (
              <Button
                leftSection={<FaIcon icon="fas fa-pen" />}
                title="Düzeltilmiş liste yeni bir sürüm olarak kaydedilir; bu sürüm değişmez"
                onClick={startEdit}
              >
                {ws.is_latest === false ? `v${ws.version} üzerinden düzenle` : 'Düzenle'}
              </Button>
            ) : null}
          </>
        )}
      </ModalFooter>
    </Modal>
  );
}

// ------------------------------------------------------------ view

function WeldView({ ws, onVersion }: { ws: WeldScheduleVersion; onVersion: (v: number | null) => void }) {
  const w = ws as WeldScheduleVersion & Record<string, unknown>;
  const bu = (ws.bottom_up ?? {}) as BottomUp;
  const lines = bu.lines ?? [];
  const joints: ViewJoint[] = (ws.joints ?? []).map((j, i) => ({
    ...j,
    unit_h: lines[i]?.unit_h,
    unit_label: lines[i]?.unit,
    hours: lines[i]?.hours,
    geometry: lines[i],
  }));
  const history = ws.version_history ?? [];
  const latest = history.at(-1)?.version ?? ws.version;
  const schema = Number(w.schema_version ?? bu.schema_version ?? 1) || 1;
  const plan = isPlanBottomUp(bu);
  const t = (ws.totals ?? {}) as Record<string, number | undefined>;
  const massNotes = String(w.mass_basis || '')
    .split(/\s+\|\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const columns = useMemo<DataTableColumn<ViewJoint>[]>(() => {
    const hasSub = joints.some((j) => j.sub_id);
    const hasSource = joints.some((j) => j.source);
    const num = (digits: number) => (v: unknown) => (v == null ? '—' : fmt(v, digits));
    return [
      { key: 'joint_id', header: 'No', width: 64 },
      ...(hasSub ? [{ key: 'sub_id', header: 'Alt montaj', width: 84 } satisfies DataTableColumn<ViewJoint>] : []),
      {
        key: 'description',
        header: 'Birleşim',
        sortable: false,
        render: (j) => (
          <>
            <div className={css.jointDesc}>{j.description}</div>
            {jointDetail(j) ? <div className={css.jointDetail}>{jointDetail(j)}</div> : null}
            {j.evidence ? (
              <div className={css.jointDetail} title={j.evidence}>
                Pafta: {j.evidence}
              </div>
            ) : null}
          </>
        ),
      },
      ...(hasSource
        ? [{ key: 'source', header: 'Kaynak', width: 84, render: (j) => <SourceBadge source={j.source} /> } satisfies DataTableColumn<ViewJoint>]
        : []),
      {
        key: 'joint_type',
        header: 'Tip · malzeme',
        width: 130,
        render: (j) => (
          <>
            {JOINT_TYPE_LABELS[j.joint_type ?? ''] || j.joint_type}
            <div className={css.jointDetail}>{MATERIAL_LABELS[j.material ?? ''] || j.material}</div>
          </>
        ),
      },
      { key: 'count_per_unit', header: 'Adet', width: 56, align: 'right' },
      { key: 'length_m_each', header: 'm / birleşim', width: 80, align: 'right', render: (j) => num(3)(j.length_m_each) },
      { key: 'total_m_per_unit', header: 'm toplam', width: 72, align: 'right', render: (j) => num(2)(j.total_m_per_unit) },
      {
        key: 'unit_h',
        header: 'Birim süre',
        width: 96,
        align: 'right',
        render: (j) =>
          j.unit_h == null ? (
            '—'
          ) : (
            <>
              {fmt(j.unit_h, 3)}{' '}
              <span className={css.jointDetail}>{String(j.unit_label || '').replace('joint', 'birleşim')}</span>
            </>
          ),
      },
      { key: 'hours', header: 'Saat', width: 60, align: 'right', render: (j) => num(2)(j.hours) },
    ];
  }, [joints]);

  return (
    <>
      {ws.is_latest === false ? (
        <div className={css.banner} data-kind="old">
          <FaIcon icon="fas fa-clock-rotate-left" style={{ marginRight: 4 }} />
          Eski sürüm <strong>v{ws.version}</strong> gösteriliyor (salt okunur). Faktör ve tahminler son sürümü (v{latest})
          kullanır.{' '}
          <Button size="compact-xs" variant="subtle" onClick={() => onVersion(null)}>
            Son sürüme dön
          </Button>
        </div>
      ) : null}
      <div className={css.weldMeta}>
        <span>
          {schema >= 2 ? 'İmalat planı' : 'Kaynak listesi'} <strong>v{ws.version}</strong>{' '}
          <LegacyBadge entry={SCHEMA_LABELS[schema >= 2 ? 2 : 1]} />
        </span>
        <span>
          Güven <ConfidenceBadge value={Number((w.confidence as number) || 0)} />
          {plan && bu.plan_confidence != null ? (
            <Text span c="dimmed" size="sm">
              {' '}
              plan %{fmt(Number(bu.plan_confidence) * 100, 0)}
            </Text>
          ) : null}
        </span>
        {schema >= 2 ? (
          <span>
            <strong>{((w.sub_assemblies as unknown[]) ?? []).length}</strong> alt montaj ·{' '}
            <strong>{((w.parts as unknown[]) ?? []).length}</strong> parça
          </span>
        ) : null}
        <span>
          <strong>{String(w.pieces_to_cut_per_unit ?? w.pieces_per_unit ?? bu.parts_count ?? 0)}</strong> kesilecek parça
        </span>
        <span>
          <strong>{String(w.bends_per_unit ?? 0)}</strong> büküm
        </span>
        {t.weld_m_drawn != null && t.weld_m_deduced != null ? (
          <span>
            Kaynak <strong>{fmt(t.weld_m_total, 1)} m</strong>{' '}
            <Text span c="dimmed" size="sm">
              (çizim {fmt(t.weld_m_drawn, 1)} · çıkarım {fmt(t.weld_m_deduced, 1)})
            </Text>
          </span>
        ) : null}
        <span>
          Birim kütle <strong>{fmt(w.unit_mass_kg, 0)} kg</strong>
          {w.mass_basis ? (
            <Text span c="dimmed" size="sm">
              {' '}
              (kütle notuna bakın)
            </Text>
          ) : null}
        </span>
      </div>
      {ws.edited ? (
        <div className={css.banner} data-kind="edited">
          <FaIcon icon="fas fa-pen" style={{ marginRight: 4 }} />v{ws.version} elle düzeltildi: düzenleyen{' '}
          {ws.edited_by_name || 'bilinmeyen kullanıcı'} · {formatDateTime(ws.created_at)}
          {ws.based_on_version ? ` (v${ws.based_on_version} üzerinden)` : ''}
          {ws.edit_note ? (
            <>
              {' '}
              — <strong>{ws.edit_note}</strong>
            </>
          ) : null}
        </div>
      ) : null}
      <NoteList title="Kütle notu" items={massNotes} />
      <NoteList title="Çizimin söylemediği" items={(w.open_questions as string[]) ?? []} />
      <NoteList title="Tasarım özellikleri" items={(w.design_features as string[]) ?? []} />
      {schema >= 2 ? (
        <EstScope>
          <PlanParts schedule={ws} />
        </EstScope>
      ) : null}
      <div className={css.h}>Birleşimler ({joints.length})</div>
      <DataTable
        data={joints}
        columns={columns}
        getRowId={(j, i) => `${j.joint_id ?? ''}-${i}`}
        sortable
        verticalSpacing="xs"
        emptyMessage="Birleşim yok"
      />
      {plan ? <PlanHours bu={bu} /> : <NonWelding bu={bu} />}
      <VersionHistory ws={ws} onVersion={onVersion} />
    </>
  );
}

function NoteList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <details className={css.note}>
      <summary>
        {title} ({items.length})
      </summary>
      <ul>
        {items.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>
    </details>
  );
}

function NonWelding({ bu }: { bu: BottomUp }) {
  return (
    <>
      <div className={css.h}>Kaynak dışı (1 adet)</div>
      <table className={css.miniTable}>
        <thead>
          <tr>
            <th>Adım</th>
            <th className={css.num}>Miktar</th>
            <th>Birim</th>
            <th className={css.num}>Birim süre</th>
            <th className={css.num}>Saat</th>
          </tr>
        </thead>
        <tbody>
          {(bu.non_welding_lines ?? []).map((l, i) => (
            <tr key={i}>
              <td>
                {NON_WELDING_LABELS[l.step] || l.step}
                {l.applies === false ? <span className={css.jointDetail}> (basınçlı sistem değil)</span> : null}
              </td>
              <td className={css.num}>{fmt(l.qty, l.unit === 'h/kg' ? 1 : 0)}</td>
              <td>{UNIT_LABELS[l.unit ?? ''] || l.unit}</td>
              <td className={css.num}>{fmt(l.unit_h, 4)}</td>
              <td className={css.num}>{fmt(l.hours, 2)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th colSpan={4}>
              Kaynak {fmt(bu.welding_h, 1)} h + kaynak dışı {fmt(bu.non_welding_h, 1)} h = hesaplanan saat (1 adet)
            </th>
            <th className={css.num}>{fmt(bu.total_h, 1)} h</th>
          </tr>
        </tfoot>
      </table>
    </>
  );
}

/** Plan hours (v5): the work-centre subtotals, then the Tahmin card's plan table (PlanTables.tsx). */
function PlanHours({ bu }: { bu: BottomUp }) {
  const b = bu as BottomUp & {
    work_centres?: { key: string; label?: string; hours?: number; share?: number }[];
    h_per_t?: { shop?: number; mach?: number };
    deduced?: { mach_h?: number; mach_default_h?: number; thin_drawing_set?: boolean };
    structure_class?: string;
    structure_class_label?: string;
    mach_h?: number;
    weld_m?: number;
    weld_m_drawn?: number;
    weld_m_deduced?: number;
    weld_m_rule?: number;
    pwht?: { required?: boolean; kg?: number; eur?: number };
    proxy?: boolean;
  };
  const hpt = b.h_per_t ?? {};
  const d = b.deduced ?? {};
  const facts: ReactNode[] = [
    b.structure_class ? (
      <>
        Sınıf <strong>{b.structure_class_label || STRUCTURE_CLASS_LABELS[b.structure_class] || b.structure_class}</strong>
      </>
    ) : null,
    hpt.shop != null ? (
      <>
        atölye <strong>{fmt(hpt.shop, 0)} h/t</strong>
      </>
    ) : null,
    hpt.mach != null && Number(b.mach_h) ? (
      <>
        talaşlı <strong>{fmt(hpt.mach, 0)} h/t</strong>
      </>
    ) : null,
    b.weld_m != null ? (
      <>
        kaynak <strong>{fmt(b.weld_m, 1)} m</strong> (çizim {fmt(b.weld_m_drawn, 1)}, çıkarım {fmt(b.weld_m_deduced, 1)}
        {Number(b.weld_m_rule) ? `, kural ${fmt(b.weld_m_rule, 1)}` : ''})
      </>
    ) : null,
    d.mach_h != null && Number(b.mach_h) ? (
      <>
        talaşlı çıkarım <strong>{fmt(d.mach_h, 1)} h</strong>
        {d.mach_default_h ? `, varsayılan ${fmt(d.mach_default_h, 1)} h` : ''}
      </>
    ) : null,
    d.thin_drawing_set ? <StatusBadge color="orange">çizim seti ince</StatusBadge> : null,
    b.pwht?.required ? (
      <>
        ısıl işlem <strong>{fmt(b.pwht.kg, 0)} kg</strong> (~{fmt(b.pwht.eur, 0)} €)
      </>
    ) : null,
    b.proxy ? <StatusBadge color="grey">v1 listeden uyarlandı</StatusBadge> : null,
  ].filter(Boolean);
  return (
    <>
      <div className={css.h}>İş merkezi saatleri (1 adet, plan)</div>
      {facts.length ? (
        <div className={css.planFacts}>
          {facts.map((f, i) => (
            <span key={i}>
              {i > 0 ? ' · ' : null}
              {f}
            </span>
          ))}
        </div>
      ) : null}
      <table className={`${css.miniTable} ${css.centres}`}>
        <thead>
          <tr>
            <th>İş merkezi</th>
            <th className={css.num}>Saat</th>
            <th className={css.num}>Pay</th>
          </tr>
        </thead>
        <tbody>
          {(b.work_centres ?? []).map((wc) => (
            <tr key={wc.key} data-muted={Number(wc.hours) ? undefined : true}>
              <td>{WORK_CENTRE_LABELS[wc.key] || wc.label || wc.key}</td>
              <td className={css.num}>{fmt(wc.hours, 1)}</td>
              <td className={css.num}>%{fmt((Number(wc.share) || 0) * 100, 0)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th>
              Toplam (kaynak {fmt(b.welding_h, 1)} h + diğer {fmt(b.non_welding_h, 1)} h)
            </th>
            <th className={css.num}>{fmt(b.total_h, 1)} h</th>
            <th />
          </tr>
        </tfoot>
      </table>
      <div className={css.h}>İmalat planı ve saat hesabı</div>
      <EstScope>
        <PlanTable bottomUp={bu} />
      </EstScope>
    </>
  );
}

function VersionHistory({ ws, onVersion }: { ws: WeldScheduleVersion; onVersion: (v: number | null) => void }) {
  const history = ws.version_history ?? [];
  if (!history.length) return null;
  const latest = history.at(-1)!.version;
  return (
    <>
      <div className={css.h}>Sürüm geçmişi ({history.length})</div>
      <div style={{ overflowX: 'auto' }}>
        <table className={css.miniTable} data-testid="version-history">
          <thead>
            <tr>
              <th>Sürüm</th>
              <th>Tarih</th>
              <th>Kaynak</th>
              <th>Not</th>
              <th className={css.num}>Birleşim</th>
              <th className={css.num}>Kaynak m</th>
              <th className={css.num}>Birim kg</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {history
              .slice()
              .reverse()
              .map((v) => {
                const current = v.version === ws.version;
                return (
                  <tr key={v.version} data-current={current || undefined}>
                    <td>
                      <strong>v{v.version}</strong> {v.version === latest ? <StatusBadge color="blue">son</StatusBadge> : null}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatDateTime(v.created_at)}</td>
                    <td>
                      {v.edited ? (
                        <>
                          <StatusBadge color="purple">Elle</StatusBadge> {v.edited_by_name || '—'}
                          {v.based_on_version ? (
                            <Text span c="dimmed" size="sm">
                              {' '}
                              (v{v.based_on_version} üzerinden)
                            </Text>
                          ) : null}
                        </>
                      ) : (
                        <StatusBadge color="grey">Model</StatusBadge>
                      )}
                    </td>
                    <td style={{ minWidth: '12rem' }}>{v.edit_note}</td>
                    <td className={css.num}>{fmt(v.joints_total, 0)}</td>
                    <td className={css.num}>{fmt(v.weld_m_total, 1)}</td>
                    <td className={css.num}>{fmt(v.unit_mass_kg, 0)}</td>
                    <td className={css.num}>
                      {current ? (
                        <Text span size="xs" c="dimmed">
                          gösteriliyor
                        </Text>
                      ) : (
                        <Button size="compact-xs" variant="subtle" onClick={() => onVersion(v.version)}>
                          Görüntüle
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ------------------------------------------------------------ Düzenle

interface WeldEditorProps {
  jobNo: string;
  ws: WeldScheduleVersion;
  draft: WeldDraft;
  errors: DraftErrors;
  saveError: string;
  /** `hours`: the change can move the hours (numbers, codes, rows), so the preview runs again. */
  onChange: (draft: WeldDraft, options: { hours: boolean }) => void;
  onPreviewErrors: (errors: DraftErrors) => void;
}

function selectData(labels: Record<string, string>, codes: string[], value: string | undefined) {
  const data = codes.map((c) => ({ value: c, label: labels[c] || c }));
  // A code outside the schema (should not happen) stays visible so the save error points at it.
  if (!codes.includes(value ?? '')) data.unshift({ value: value ?? '', label: `${value || '—'} (geçersiz)` });
  return data;
}

function WeldEditor({ jobNo, ws, draft, errors, saveError, onChange, onPreviewErrors }: WeldEditorProps) {
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof previewWeldScheduleVersion>> | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  // The draft as of the last change that can move the hours; text-only edits do not re-run the preview.
  const [previewFor, setPreviewFor] = useState<{ draft: WeldDraft; immediate: boolean }>({ draft, immediate: true });

  // The server's hours of the draft, 350 ms after the last such change.
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(
      async () => {
        const { payload, errors: found } = draftPayload(previewFor.draft);
        if (Object.keys(found).length) {
          onPreviewErrors(found);
          setPreview(null);
          setPreviewError(`${Object.keys(found).length} hatalı alan: saat hesaplanamadı`);
          return;
        }
        try {
          const result = await previewWeldScheduleVersion(jobNo, { ...payload, note: '' }, controller.signal);
          setPreview(result);
          setPreviewError(null);
        } catch (error) {
          if (controller.signal.aborted) return;
          const fieldErrors = isApiError(error) ? (error.data as { errors?: DraftErrors } | undefined)?.errors : undefined;
          setPreview(null);
          onPreviewErrors(fieldErrors ?? {});
          setPreviewError(
            fieldErrors
              ? `${Object.keys(fieldErrors).length} hatalı alan: saat hesaplanamadı`
              : errorMessage(error, 'Önizleme hesaplanamadı'),
          );
        }
      },
      previewFor.immediate ? 0 : PREVIEW_DELAY_MS,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [previewFor, jobNo, onPreviewErrors]);

  const change = (next: WeldDraft, hours: boolean) => {
    onChange(next, { hours });
    if (hours) setPreviewFor({ draft: next, immediate: false });
  };
  const setHead = (key: keyof WeldDraft, value: string, hours = true) => change({ ...draft, [key]: value }, hours);
  const setJoint = (i: number, patch: Partial<DraftJoint>, hours: boolean) =>
    change({ ...draft, joints: draft.joints.map((j, k) => (k === i ? { ...j, ...patch } : j)) }, hours);

  const before = (ws.totals ?? {}) as { joints_total?: number; weld_m_total?: number; weld_m_by_material?: Record<string, number> };
  const totals = draftTotals(draft);
  const was = (ws.bottom_up ?? {}) as BottomUp;
  const p = preview?.bottom_up;
  const delta = (now: number, prev: unknown, digits: number) => {
    const diff = now - (Number(prev) || 0);
    if (Math.abs(diff) < 10 ** -digits / 2) return null;
    return (
      <span className={css.delta}>
        {' '}
        ({diff > 0 ? '+' : '−'}
        {fmt(Math.abs(diff), digits)})
      </span>
    );
  };
  const messages = Object.entries(errors).map(([key, message]) => {
    const parts = key.split('.');
    return parts[0] === 'joints' && parts.length === 3 ? `Satır ${Number(parts[1]) + 1}: ${message}` : message;
  });

  const numInput = (key: 'unit_mass_kg' | 'pieces_per_unit' | 'bends_per_unit', label: string, mode: 'decimal' | 'numeric', hint?: string) => (
    <label className={css.field}>
      <span>{label}</span>
      <TextInput
        size="xs"
        inputMode={mode}
        className={css.numInput}
        w="7rem"
        value={draft[key]}
        error={errors[key] ? true : undefined}
        title={errors[key] || hint}
        aria-label={label}
        onChange={(event) => setHead(key, event.currentTarget.value)}
      />
    </label>
  );

  return (
    <div data-testid="weld-editor">
      <div className={css.banner} data-kind="editing">
        <FaIcon icon="fas fa-pen" style={{ marginRight: 4 }} />v{ws.version} düzenleniyor. Kaydet, düzeltilmiş listeyi{' '}
        <strong>yeni sürüm</strong> olarak saklar; v{ws.version} olduğu gibi kalır. Toplamlar ve hesaplanan saat
        yazdıkça güncellenir.
      </div>
      <div className={css.editHead}>
        {numInput('unit_mass_kg', 'Birim kütle (kg)', 'decimal')}
        {numInput('pieces_per_unit', 'Parça / adet', 'numeric', 'Kesilecek parça sayısı (kesim süresi)')}
        {numInput('bends_per_unit', 'Büküm / adet', 'numeric')}
        <div className={css.field}>
          <span>Malzemeye göre kg</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {MASS_MATERIAL_CODES.map((m) => (
              <label key={m} className={css.field}>
                <span style={{ fontWeight: 500 }}>{MATERIAL_LABELS[m] || m}</span>
                <TextInput
                  size="xs"
                  inputMode="decimal"
                  className={css.numInput}
                  w="5.4rem"
                  placeholder="—"
                  aria-label={`${MATERIAL_LABELS[m] || m} kg`}
                  value={draft.mass_by_material[m] ?? ''}
                  error={errors[`mass_by_material.${m}`] ? true : undefined}
                  title={errors[`mass_by_material.${m}`]}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    change({ ...draft, mass_by_material: { ...draft.mass_by_material, [m]: value } }, true);
                  }}
                />
              </label>
            ))}
          </div>
        </div>
        <label className={`${css.field} ${css.wide}`}>
          <span>Kütle notu (nereden geldi)</span>
          <Textarea
            size="xs"
            rows={2}
            aria-label="Kütle notu"
            value={draft.mass_basis}
            onChange={(event) => setHead('mass_basis', event.currentTarget.value, false)}
          />
        </label>
      </div>
      <div className={css.editWrap}>
        <table className={`${css.miniTable} ${css.editTable}`}>
          <thead>
            <tr>
              <th style={{ width: 70 }}>No</th>
              <th>Birleşim · kaynak detayı</th>
              <th style={{ width: 150 }}>Tip · malzeme</th>
              <th style={{ width: 150 }}>Proses</th>
              <th className={css.num} style={{ width: 70 }}>
                Adet
              </th>
              <th className={css.num} style={{ width: 84 }}>
                m / birleşim
              </th>
              <th className={css.num} style={{ width: 72 }}>
                m toplam
              </th>
              <th className={css.num} style={{ width: 60 }}>
                Saat
              </th>
              <th style={{ width: 44 }} />
            </tr>
          </thead>
          <tbody>
            {draft.joints.length === 0 ? (
              <tr>
                <td colSpan={9}>
                  <Text size="sm" c="dimmed" ta="center" py="sm">
                    Birleşim yok: “Satır ekle” ile ekleyin.
                  </Text>
                </td>
              </tr>
            ) : (
              draft.joints.map((j, i) => {
                const err = (field: string) => errors[`joints.${i}.${field}`];
                const m = rowMetres(j);
                const line = preview?.bottom_up?.lines?.[i];
                const context = [j.sub_id && `Alt montaj: ${j.sub_id}`, j.size && `Ölçü: ${j.size}`, j.evidence && `Pafta: ${j.evidence}`]
                  .filter(Boolean)
                  .join(' · ');
                return (
                  <tr key={i} data-row={i}>
                    <td>
                      <TextInput
                        size="xs"
                        aria-label="No"
                        placeholder="yeni"
                        value={String(j.joint_id ?? '')}
                        onChange={(event) => setJoint(i, { joint_id: event.currentTarget.value }, false)}
                      />
                      {j.source ? (
                        <div style={{ marginTop: 4 }}>
                          <SourceBadge source={j.source} />
                        </div>
                      ) : null}
                    </td>
                    <td>
                      <Textarea
                        size="xs"
                        rows={2}
                        aria-label="Birleşim"
                        placeholder="Ne neye kaynıyor (poz numaralarıyla)"
                        value={String(j.description ?? '')}
                        onChange={(event) => setJoint(i, { description: event.currentTarget.value }, false)}
                      />
                      <TextInput
                        size="xs"
                        mt={4}
                        aria-label="Kaynak detayı"
                        placeholder="Kaynak detayı (ör. a=5 köşe, V 60°)"
                        value={String(j.weld_detail ?? '')}
                        onChange={(event) => setJoint(i, { weld_detail: event.currentTarget.value }, false)}
                      />
                      {context ? (
                        <div className={css.jointDetail} title={context}>
                          {context}
                        </div>
                      ) : null}
                    </td>
                    <td>
                      <NativeSelect
                        size="xs"
                        aria-label="Tip"
                        data={selectData(JOINT_TYPE_LABELS, Object.keys(JOINT_TYPE_LABELS), j.joint_type)}
                        value={j.joint_type ?? ''}
                        onChange={(event) => setJoint(i, { joint_type: event.currentTarget.value }, true)}
                      />
                      <NativeSelect
                        size="xs"
                        mt={4}
                        aria-label="Malzeme"
                        data={selectData(MATERIAL_LABELS, JOINT_MATERIAL_CODES, j.material)}
                        value={j.material ?? ''}
                        onChange={(event) => setJoint(i, { material: event.currentTarget.value }, true)}
                      />
                    </td>
                    <td>
                      <NativeSelect
                        size="xs"
                        aria-label="Proses"
                        data={selectData(PROCESS_LABELS, Object.keys(PROCESS_LABELS), j.process)}
                        value={j.process ?? ''}
                        onChange={(event) => setJoint(i, { process: event.currentTarget.value }, true)}
                      />
                    </td>
                    <td>
                      <TextInput
                        size="xs"
                        inputMode="numeric"
                        className={css.numInput}
                        aria-label="Adet"
                        value={j.count_per_unit}
                        error={err('count_per_unit') ? true : undefined}
                        title={err('count_per_unit')}
                        // A touched count or length drops the stored total: count × length from now on.
                        onChange={(event) => setJoint(i, { count_per_unit: event.currentTarget.value, total_m_per_unit: null }, true)}
                      />
                    </td>
                    <td>
                      <TextInput
                        size="xs"
                        inputMode="decimal"
                        className={css.numInput}
                        aria-label="m / birleşim"
                        value={j.length_m_each}
                        error={err('length_m_each') ? true : undefined}
                        title={err('length_m_each')}
                        onChange={(event) => setJoint(i, { length_m_each: event.currentTarget.value, total_m_per_unit: null }, true)}
                      />
                    </td>
                    <td className={css.num} data-cell="total">
                      {Number.isNaN(m) ? '—' : fmt(m, 2)}
                    </td>
                    <td className={css.num} data-cell="hours">
                      {line ? fmt(line.hours, 2) : <Text span c="dimmed">…</Text>}
                    </td>
                    <td className={css.num}>
                      <Button
                        size="compact-xs"
                        variant="outline"
                        color="red"
                        title="Satırı sil"
                        aria-label="Satırı sil"
                        onClick={() => change({ ...draft, joints: draft.joints.filter((_, k) => k !== i) }, true)}
                      >
                        <FaIcon icon="fas fa-trash" />
                      </Button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <Button
        size="xs"
        variant="outline"
        mt={6}
        leftSection={<FaIcon icon="fas fa-plus" />}
        onClick={() => change({ ...draft, joints: [...draft.joints, newJoint(draft.joints.at(-1))] }, true)}
      >
        Satır ekle
      </Button>
      <div className={css.totals} data-testid="weld-totals">
        <div>
          <span className={css.tlabel}>Birleşim</span> <strong>{fmt(totals.joints, 0)}</strong>
          {delta(totals.joints, before.joints_total, 0)} <span className={css.tlabel} style={{ marginLeft: 12 }}>Kaynak</span>{' '}
          <strong>{fmt(totals.metres, 1)} m</strong>
          {delta(totals.metres, before.weld_m_total, 1)}
          {Object.entries(totals.byMaterial).some(([, v]) => v > 0) ? (
            <Text span c="dimmed" size="sm">
              {' '}
              (
              {Object.entries(totals.byMaterial)
                .filter(([, v]) => v > 0)
                .map(([mat, v], i) => (
                  <span key={mat}>
                    {i > 0 ? ' · ' : null}
                    {MATERIAL_LABELS[mat] || mat} {fmt(v, 1)} m{delta(v, before.weld_m_by_material?.[mat], 1)}
                  </span>
                ))}
              )
            </Text>
          ) : null}
          {totals.bad ? (
            <Text span c="red" size="sm" ml={8}>
              geçersiz satırlar toplama girmedi
            </Text>
          ) : null}
        </div>
        <div>
          <span className={css.tlabel}>Hesaplanan saat</span>{' '}
          {previewError ? (
            <Text span c="red" size="sm">
              {previewError}
            </Text>
          ) : p ? (
            <>
              kaynak {fmt(p.welding_h, 1)} h + kaynak dışı {fmt(p.non_welding_h, 1)} h ={' '}
              <strong>{fmt(p.total_h, 1)} h/adet</strong>
              {delta(Number(p.total_h), was.total_h, 1)}{' '}
              <Text span c="dimmed" size="sm">
                · v{ws.version}: {fmt(was.total_h, 1)} h
              </Text>
            </>
          ) : (
            <Text span c="dimmed" size="sm">
              <Loader size={10} mr={4} />
              hesaplanıyor…
            </Text>
          )}
        </div>
      </div>
      <label className={`${css.field} ${css.wide}`} style={{ marginTop: 8 }}>
        <span>
          Düzeltme notu <strong style={{ color: 'var(--gk-danger)' }}>*</strong>
        </span>
        <Textarea
          size="xs"
          rows={2}
          aria-label="Düzeltme notu"
          placeholder="Neyi neden düzelttiniz? (ör. kep sayısı 7→9, pafta 3 kesit B-B)"
          value={draft.note}
          error={errors.note ? true : undefined}
          onChange={(event) => setHead('note', event.currentTarget.value, false)}
        />
      </label>
      {messages.length || saveError ? (
        <div className={css.error} data-testid="weld-errors">
          {[...messages, saveError].filter(Boolean).join(' · ')}
        </div>
      ) : null}
    </div>
  );
}
