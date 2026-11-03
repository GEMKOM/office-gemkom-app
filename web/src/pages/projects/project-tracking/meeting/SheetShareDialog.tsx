import { Button } from '@mantine/core';
import { useRef, useState } from 'react';
import { createPlanSheetShareLink } from '@/api/projects/jobOrders';
import { notify } from '@/ui';
import { MeetingModal } from './MeetingModal';
import s from './MeetingView.module.css';
import { SHEET_COLUMNS } from './sheetBridge';

// Plan ve Sapmalar on its own page (projects/plan-sheet/): print it (the
// browser's print gives a vector PDF) or hand the customer a temporary,
// login-free link. The dialog picks the columns and the rows for both.

/** Last choice per viewer: a convenience, never state. */
export const SHEET_SHARE_KEY = 'pp.sheetShare';

export interface SheetSharePrefs {
  fields: string[] | null;
  expandAll: boolean;
  mainOnly: boolean;
  showHeader: boolean;
  language: 'tr' | 'en';
  days: number;
}

const DEFAULT_PREFS: SheetSharePrefs = {
  fields: null,
  expandAll: true,
  mainOnly: false,
  showHeader: true,
  language: 'tr',
  days: 7,
};

const DAY_OPTIONS = [3, 7, 14, 30];

function sheetShareDefaults(): SheetSharePrefs {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(SHEET_SHARE_KEY) || 'null');
    if (stored && typeof stored === 'object') return { ...DEFAULT_PREFS, ...(stored as Partial<SheetSharePrefs>) };
  } catch {
    // no stored preference
  }
  return DEFAULT_PREFS;
}

function saveDefaults(prefs: SheetSharePrefs) {
  try {
    localStorage.setItem(SHEET_SHARE_KEY, JSON.stringify(prefs));
  } catch {
    // storage blocked: the choice still applies to this run
  }
}

export interface SheetView {
  zoom: string;
  collapsed: ReadonlySet<string>;
}

export function sheetPageUrl(jobNo: string, prefs: SheetSharePrefs, view: SheetView, print: boolean): string {
  const params = new URLSearchParams();
  params.set('job_no', jobNo);
  if (prefs.fields && prefs.fields.length) params.set('cols', prefs.fields.join(','));
  if (prefs.mainOnly) params.set('main', '1');
  if (prefs.showHeader === false) params.set('head', '0');
  if (prefs.language === 'en') params.set('lang', 'en');
  if (!prefs.expandAll && view.collapsed.size) params.set('collapsed', [...view.collapsed].join(','));
  params.set('zoom', view.zoom);
  if (print) params.set('print', '1');
  return `${window.location.origin}/projects/plan-sheet/?${params.toString()}`;
}

export function sheetShareUrl(token: string, language: string): string {
  return `${window.location.origin}/projects/plan-sheet/?share=${encodeURIComponent(token)}${language === 'en' ? '&lang=en' : ''}`;
}

interface ShareResult {
  url: string;
  until: string;
  editable: boolean;
}

export function SheetShareDialog({ jobNo, view, onClose }: { jobNo: string; view: SheetView; onClose: () => void }) {
  const [initial] = useState(sheetShareDefaults);
  const [fields, setFields] = useState<Set<string>>(
    () => new Set(initial.fields ?? SHEET_COLUMNS.map((c) => c.field)),
  );
  const [showHeader, setShowHeader] = useState(initial.showHeader !== false);
  const [expandAll, setExpandAll] = useState(initial.expandAll !== false);
  const [mainOnly, setMainOnly] = useState(!!initial.mainOnly);
  const [language, setLanguage] = useState<'tr' | 'en'>(initial.language === 'en' ? 'en' : 'tr');
  const [days, setDays] = useState(DAY_OPTIONS.includes(Number(initial.days)) ? Number(initial.days) : 7);
  const [creating, setCreating] = useState<'share' | 'share-edit' | null>(null);
  const [result, setResult] = useState<ShareResult | null>(null);
  const urlRef = useRef<HTMLInputElement>(null);

  // The chosen settings, saved as this viewer's defaults (legacy readSheetDialog).
  function readPrefs(): SheetSharePrefs {
    const prefs: SheetSharePrefs = {
      // 'title' is locked on: it is always among the checked fields.
      fields: SHEET_COLUMNS.map((c) => c.field).filter((f) => f === 'title' || fields.has(f)),
      expandAll,
      mainOnly,
      showHeader,
      language,
      days: days || 7,
    };
    saveDefaults(prefs);
    return prefs;
  }

  function print() {
    window.open(sheetPageUrl(jobNo, readPrefs(), view, true), '_blank', 'noopener');
  }

  async function share(action: 'share' | 'share-edit') {
    const prefs = readPrefs();
    const editable = action === 'share-edit';
    setCreating(action);
    try {
      const options = {
        expand_all: prefs.expandAll,
        main_only: prefs.mainOnly,
        show_header: prefs.showHeader,
        language: prefs.language,
        collapsed: prefs.expandAll ? [] : [...view.collapsed],
      };
      const link = await createPlanSheetShareLink<{ token: string; expires_at: string }>(jobNo, {
        columns: prefs.fields ?? undefined,
        expires_in_days: prefs.days,
        editable,
        options,
      });
      setResult({
        url: sheetShareUrl(link.token, prefs.language),
        until: new Date(link.expires_at).toLocaleDateString('tr-TR'),
        editable,
      });
    } catch (error) {
      console.error('Share link failed:', error);
      notify.error(error, { fallback: 'Bağlantı oluşturulamadı.' });
    } finally {
      setCreating(null);
    }
  }

  async function copy() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.url);
      notify.success('Bağlantı kopyalandı.');
    } catch {
      urlRef.current?.select();
      notify.warning('Kopyalanamadı; bağlantıyı elle kopyalayın.');
    }
  }

  const toggleField = (field: string, on: boolean) =>
    setFields((prev) => {
      const next = new Set(prev);
      if (on) next.add(field);
      else next.delete(field);
      return next;
    });

  return (
    <MeetingModal title="Plan ve Sapmalar · yazdır ya da paylaş" jobNo={jobNo} onClose={onClose} narrow>
      <div className={s.sheetpdf}>
        <p className={s.sheetpdfHint}>
          Sütunları seçin; Görev sütunu ve zaman çizelgesi her zaman yer alır. Sayfa yalnızca bu tabloyu gösterir:
          yazdırıp PDF olarak kaydedebilir ya da müşteriye giriş gerektirmeyen geçici bir bağlantı verebilirsiniz.
        </p>
        <div className={s.sheetpdfCols}>
          {SHEET_COLUMNS.map((col) => {
            const locked = col.field === 'title';
            return (
              <label key={col.field} className={s.sheetpdfCol} data-locked={locked || undefined}>
                <input
                  type="checkbox"
                  data-col={col.field}
                  checked={locked || fields.has(col.field)}
                  disabled={locked}
                  onChange={(e) => toggleField(col.field, e.currentTarget.checked)}
                />
                <span>{col.label}</span>
                {locked ? <small>her zaman</small> : null}
              </label>
            );
          })}
        </div>
        <label className={s.sheetpdfOpt}>
          <input type="checkbox" checked={showHeader} onChange={(e) => setShowHeader(e.currentTarget.checked)} />
          <span>Başlık bölümünü göster (iş emri, müşteri ve tarih zinciri)</span>
        </label>
        <label className={`${s.sheetpdfOpt} ${s.optTight}`}>
          <input type="checkbox" checked={expandAll} onChange={(e) => setExpandAll(e.currentTarget.checked)} />
          <span>Katlanmış iş emirlerini de açık göster</span>
        </label>
        <label className={`${s.sheetpdfOpt} ${s.optTight}`}>
          <input type="checkbox" checked={mainOnly} onChange={(e) => setMainOnly(e.currentTarget.checked)} />
          <span>Yalnızca departman görevleri (alt satırlar, ekip ve taşeron adları gizli)</span>
        </label>
        <div className={s.sheetpdfRow}>
          <label htmlFor="pp-share-lang">Dil (PDF ve müşteri sayfası)</label>
          <select
            id="pp-share-lang"
            value={language}
            onChange={(e) => setLanguage(e.currentTarget.value === 'en' ? 'en' : 'tr')}
          >
            <option value="tr">Türkçe</option>
            <option value="en">English</option>
          </select>
        </div>
        <div className={`${s.sheetpdfRow} ${s.rowTight}`}>
          <label htmlFor="pp-share-days">Bağlantının geçerlilik süresi</label>
          <select id="pp-share-days" value={days} onChange={(e) => setDays(Number(e.currentTarget.value) || 7)}>
            {DAY_OPTIONS.map((d) => (
              <option key={d} value={d}>
                {d} gün
              </option>
            ))}
          </select>
        </div>
        {result ? (
          <div className={s.sheetpdfLink}>
            <div className={s.linkHead}>
              {result.editable ? (
                <>
                  <i className="fas fa-pen-to-square" aria-hidden /> Düzenlenebilir bağlantı hazır: {result.until}{' '}
                  tarihine kadar geçerli. Açıp hücreleri düzenleyin, sonra Yazdır / PDF ile indirin. Değişiklikler
                  yalnızca bu bağlantıda saklanır; gerçek plan değişmez. Müşteriye göndermeyin: açan herkes
                  düzenleyebilir.
                </>
              ) : (
                <>
                  <i className="fas fa-link" aria-hidden /> Müşteri bağlantısı hazır: {result.until} tarihine kadar
                  geçerli, giriş gerektirmez.
                </>
              )}
            </div>
            <div className={s.linkRow}>
              <input
                ref={urlRef}
                className={s.linkInput}
                type="text"
                readOnly
                value={result.url}
                aria-label="Bağlantı"
              />
              <Button
                size="compact-sm"
                variant="default"
                leftSection={<i className="fas fa-copy" aria-hidden />}
                onClick={() => void copy()}
              >
                Kopyala
              </Button>
              <Button
                component="a"
                href={result.url}
                target="_blank"
                rel="noopener"
                size="compact-sm"
                variant="default"
                leftSection={<i className="fas fa-arrow-up-right-from-square" aria-hidden />}
              >
                Aç
              </Button>
            </div>
          </div>
        ) : null}
        <div className={s.sheetpdfActions}>
          <Button
            size="xs"
            variant="outline"
            color="red"
            title="Yeni sekmede açılır; tarayıcının yazdırma penceresinden PDF olarak kaydedin"
            leftSection={<i className="fas fa-print" aria-hidden />}
            onClick={print}
          >
            Yazdır / PDF
          </Button>
          <Button
            size="xs"
            variant="outline"
            color="red"
            title="Satış ekibi için: her hücre düzenlenebilir, sonra PDF olarak indirilir. Gerçek plan değişmez."
            leftSection={<i className="fas fa-pen-to-square" aria-hidden />}
            loading={creating === 'share-edit'}
            onClick={() => void share('share-edit')}
          >
            Düzenlenebilir bağlantı
          </Button>
          <Button
            size="xs"
            color="red"
            leftSection={<i className="fas fa-link" aria-hidden />}
            loading={creating === 'share'}
            onClick={() => void share('share')}
          >
            Müşteri bağlantısı
          </Button>
        </div>
      </div>
    </MeetingModal>
  );
}
