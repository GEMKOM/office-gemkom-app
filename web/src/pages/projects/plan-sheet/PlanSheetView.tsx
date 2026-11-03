import { Button } from '@mantine/core';
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState, type CSSProperties } from 'react';
import { flushSync } from 'react-dom';
import { saveSharedPlanSheetOverrides } from '@/api/projects/planSheet';
import { applyCellEdit, sheetWithHeader } from '@/features/plan-sheet/editing';
import { HeroChain, PlanSheetHero } from '@/features/plan-sheet/HeroChain';
import { headerSummary } from '@/features/plan-sheet/planSheetText';
import { printLayout, type PrintLayout } from '@/features/plan-sheet/printFit';
import { dateLocale, setSheetLang, sheetLang, tr, type SheetLang } from '@/features/plan-sheet/sheetLang';
import { SheetGrid } from '@/features/plan-sheet/SheetGrid';
import { SheetLegend } from '@/features/plan-sheet/SheetLegend';
import {
  applyRowOverrides,
  buildSheetRows,
  columnsWidth,
  sheetColumns,
  visibleSheetRows,
  type SheetGridRow,
} from '@/features/plan-sheet/sheetRows';
import { isZoomUnit, ZOOM_UNITS, ZOOMS, type ZoomUnit } from '@/features/plan-sheet/timeline';
import type {
  HeaderOverrides,
  LinkOverrides,
  RowOverrides,
  SharedPlanSheet,
  ViewChoices,
} from '@/features/plan-sheet/types';
import { createWorkdayCalendar } from '@/features/plan-sheet/workdays';
import { FaIcon } from '@/ui/FaIcon';
import { EditPanel, type SaveStatus } from './EditPanel';
import { PrintDialog } from './PrintDialog';
import classes from './PlanSheetPage.module.css';

const toLang = (value: string | null | undefined): SheetLang => (value === 'en' ? 'en' : 'tr');
const splitList = (value: string | null) => (value || '').split(',').filter(Boolean);

interface ViewState {
  columns: string[] | null;
  mainOnly: boolean;
  /** head=0 / options.show_header=false: no hero (job, customer, dates). */
  showHeader: boolean;
  lang: SheetLang;
  collapsed: Set<string>;
}

/** The starting state, from the link (share) or the URL (office). */
function initialState(data: SharedPlanSheet, share: string | null, params: URLSearchParams): ViewState {
  if (share) {
    const link = data.link;
    const options = link?.options || {};
    const state: ViewState = {
      columns: link?.columns && link.columns.length ? link.columns : null,
      mainOnly: !!options.main_only,
      showHeader: options.show_header !== false,
      // The link decides: lang= only covers the loading and error lines.
      lang: toLang(options.language),
      collapsed: new Set(
        options.expand_all === false && Array.isArray(options.collapsed) ? options.collapsed : [],
      ),
    };
    // An editable link's own print choices, saved with its edits.
    const v = link?.editable ? link.overrides?.view : undefined;
    if (v) {
      if (Array.isArray(v.columns)) state.columns = v.columns.length ? v.columns : null;
      if ('show_header' in v) state.showHeader = v.show_header !== false;
      if ('main_only' in v) state.mainOnly = !!v.main_only;
      if ('language' in v) state.lang = toLang(v.language);
    }
    return state;
  }
  const cols = splitList(params.get('cols'));
  return {
    columns: cols.length ? cols : null,
    mainOnly: params.get('main') === '1',
    showHeader: params.get('head') !== '0',
    lang: toLang(params.get('lang')),
    collapsed: new Set(splitList(params.get('collapsed'))),
  };
}

const SAVE_DELAY_MS = 600;

export function PlanSheetView({
  data,
  share,
  params,
}: {
  data: SharedPlanSheet;
  share: string | null;
  params: URLSearchParams;
}) {
  const sheet = data.sheet;
  const link = data.link ?? null;
  const editable = !!(share && link?.editable);

  const [state, setState] = useState(() => initialState(data, share, params));
  const [zoom, setZoom] = useState<ZoomUnit>(() => {
    const z = params.get('zoom');
    return isZoomUnit(z) ? z : 'week';
  });
  // A new frozen-table width after the print dialog: the grid starts over.
  const [gridEpoch, setGridEpoch] = useState(0);
  const [print, setPrint] = useState<PrintLayout | null>(null);
  const [printDialogOpen, setPrintDialogOpen] = useState(false);

  // ---- editing (editable links) ------------------------------------------
  const saved = link?.overrides && typeof link.overrides === 'object' ? link.overrides : {};
  const [rowOverrides, setRowOverrides] = useState<RowOverrides>(() => ({ ...(saved.rows || {}) }));
  const [header, setHeader] = useState<HeaderOverrides>(() => ({ ...(saved.header || {}) }));
  const [viewChoices, setViewChoices] = useState<ViewChoices>(() => ({ ...(saved.view || {}) }));
  const [status, setStatus] = useState<SaveStatus>({ state: null });
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(saveTimer.current), []);

  // Every edit sends the link's whole override set, a moment after the last change.
  const scheduleSave = useCallback(
    (overrides: LinkOverrides) => {
      if (!share) return;
      clearTimeout(saveTimer.current);
      setStatus({ state: 'saving' });
      saveTimer.current = setTimeout(async () => {
        try {
          await saveSharedPlanSheetOverrides(share, overrides);
          setStatus({
            state: 'saved',
            savedAt: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
          });
        } catch (error) {
          setStatus({ state: 'error', error: error instanceof Error ? error.message : undefined });
        }
      }, SAVE_DELAY_MS);
    },
    [share],
  );

  const calendar = useMemo(() => createWorkdayCalendar(sheet.holidays || []), [sheet.holidays]);
  const view = useMemo(
    () => (editable ? sheetWithHeader(sheet, header, calendar) : sheet),
    [editable, sheet, header, calendar],
  );

  // Set before anything below is drawn; the page puts Turkish back on unmount.
  setSheetLang(state.lang);
  useEffect(() => {
    document.documentElement.lang = state.lang;
    return () => {
      document.documentElement.lang = 'tr';
    };
  }, [state.lang]);

  const jo = view.job_order || {};
  useEffect(() => {
    const previous = document.title;
    document.title = `${tr('Plan ve Sapmalar', 'Plan and Deviations')} · ${jo.job_no || ''}`;
    return () => {
      document.title = previous;
    };
    // tr() reads the language set above.
  }, [jo.job_no, state.lang]);

  const onCellEdit = (row: SheetGridRow, field: string, value: string) => {
    const next = applyCellEdit(rowOverrides, row, field, value, calendar);
    setRowOverrides(next);
    scheduleSave({ rows: next, header, view: viewChoices });
  };

  const onHeaderChange = (next: HeaderOverrides) => {
    setHeader(next);
    scheduleSave({ rows: rowOverrides, header: next, view: viewChoices });
  };

  const resetEdits = () => {
    setRowOverrides({});
    setHeader({});
    scheduleSave({ rows: {}, header: {}, view: viewChoices });
  };

  const applyPrintChoices = (choices: Required<ViewChoices>) => {
    const allColumns = choices.columns.length === 0;
    setViewChoices(choices);
    setState((s) => ({
      columns: allColumns ? null : choices.columns,
      showHeader: choices.show_header,
      mainOnly: choices.main_only,
      lang: choices.language,
      collapsed: choices.expand_all ? new Set() : s.collapsed,
    }));
    // Column widths change with the set: the table takes its new width.
    setGridEpoch((n) => n + 1);
    scheduleSave({ rows: rowOverrides, header, view: choices });
  };

  // ---- printing ------------------------------------------------------------
  // The browser's print snapshot is taken right after beforeprint, so the
  // paper layout is rendered synchronously there; afterprint brings the
  // screen layout back.
  const fitForPrint = useEffectEvent(() => {
    const rows = visibleSheetRows(
      applyRowOverrides(
        buildSheetRows(view, state.collapsed, { mainOnly: state.mainOnly }),
        editable ? rowOverrides : null,
      ),
      state.collapsed,
    );
    const layout = printLayout(rows, zoom, columnsWidth(sheetColumns(state.columns)));
    flushSync(() => setPrint(layout));
  });
  useEffect(() => {
    const before = () => fitForPrint();
    const after = () => setPrint(null);
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => {
      window.removeEventListener('beforeprint', before);
      window.removeEventListener('afterprint', after);
    };
  }, []);

  useEffect(() => {
    if (params.get('print') !== '1') return;
    const timer = setTimeout(() => window.print(), 500);
    return () => clearTimeout(timer);
    // Once, when the sheet is first drawn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPrintClick = () => {
    // An editable link picks its columns first, as the office dialog does.
    if (editable) setPrintDialogOpen(true);
    else window.print();
  };

  const theme = headerSummary(view).theme;
  const note = editable && header.note ? <div className={classes.note}>{header.note}</div> : null;
  const stamp = new Date().toLocaleDateString(dateLocale());
  // An editable link's PDF goes to the customer; the link's own expiry is
  // nothing to them.
  const until =
    link?.expires_at && !editable
      ? tr(
          ` · Bu bağlantı ${new Date(link.expires_at).toLocaleDateString('tr-TR')} tarihine kadar geçerlidir`,
          ` · This link is valid until ${new Date(link.expires_at).toLocaleDateString('en-GB')}`,
        )
      : '';

  return (
    <div className={classes.page} data-editing={editable || undefined}>
      <div
        className={classes.inner}
        style={print && print.scale < 1 ? ({ zoom: String(print.scale) } as CSSProperties) : undefined}
      >
        {editable && (
          <EditPanel
            sheet={sheet}
            view={view}
            header={header}
            status={status}
            hasEdits={Object.keys(rowOverrides).length > 0 || Object.keys(header).length > 0}
            onHeaderChange={onHeaderChange}
            onReset={resetEdits}
          />
        )}
        <header>
          <div className={classes.brand}>
            <span className={classes.logo}>GEMKOM</span>
            <span className={classes.doc}>{tr('Plan ve Sapmalar', 'Plan and Deviations')}</span>
            {/* Without the hero the brand line still names the job, so a
                printed page is never anonymous. */}
            {!state.showHeader && (
              <span className={classes.job}>
                {[jo.job_no, jo.title, jo.customer_name].filter(Boolean).join(' · ')}
              </span>
            )}
          </div>
          {state.showHeader && (
            <PlanSheetHero
              className={classes.hero}
              jobNo={jo.job_no}
              title={jo.title}
              customer={jo.customer_name}
              theme={theme}
              // The meeting slide's date chain minus the progress row: the
              // customer reads dates and distances, not our percentages.
              chain={
                <HeroChain
                  start={jo.created_at}
                  termin={view.termin}
                  planEnd={view.plan_end}
                  projectedEnd={view.projected_end}
                  planVsTerminWd={view.plan_vs_termin_wd}
                  deviationWd={view.deviation_wd}
                  terminGapWd={view.termin_gap_wd}
                />
              }
            />
          )}
          {note}
          <div className={classes.tools}>
            <SheetLegend />
            <Button.Group className={`${classes.zoom} ${classes.printHide}`}>
              {ZOOM_UNITS.map((z) => (
                <Button
                  key={z}
                  size="compact-xs"
                  variant={zoom === z ? 'filled' : 'default'}
                  color="dark"
                  onClick={() => setZoom(z)}
                  aria-pressed={zoom === z}
                >
                  {tr(ZOOMS[z].label, ZOOMS[z].labelEn)}
                </Button>
              ))}
            </Button.Group>
            <Button
              size="compact-sm"
              color="red"
              className={classes.printHide}
              leftSection={<FaIcon icon="fas fa-print" />}
              onClick={onPrintClick}
              title={tr(
                'Tarayıcının yazdırma penceresi açılır; PDF olarak kaydedebilirsiniz',
                "Opens the browser's print dialog; choose Save as PDF there",
              )}
            >
              {tr('Yazdır / PDF', 'Print / PDF')}
            </Button>
          </div>
        </header>
        <div className={classes.sheet} style={print ? { width: print.hostWidth } : undefined}>
          <SheetGrid
            key={`${sheetLang()}-${gridEpoch}`}
            sheet={view}
            columns={state.columns}
            mainOnly={state.mainOnly}
            collapsed={state.collapsed}
            onCollapsedChange={(collapsed) => setState((s) => ({ ...s, collapsed }))}
            zoom={print?.zoom ?? zoom}
            onZoomChange={setZoom}
            gridWidth={print?.gridWidth ?? null}
            colWidth={print?.colWidth ?? null}
            hostWidth={print?.hostWidth ?? null}
            overrides={editable ? rowOverrides : null}
            onEdit={editable ? onCellEdit : undefined}
            onEditError={editable ? (error) => setStatus({ state: 'error', error: error.message }) : undefined}
          />
        </div>
        <footer className={classes.foot}>
          GEMKOM · {stamp}
          {until}
        </footer>
      </div>
      {editable && (
        <PrintDialog
          opened={printDialogOpen}
          onClose={() => setPrintDialogOpen(false)}
          columns={state.columns}
          showHeader={state.showHeader}
          mainOnly={state.mainOnly}
          expandAll={viewChoices.expand_all !== false}
          lang={state.lang}
          onApply={(choices, andPrint) => {
            applyPrintChoices(choices);
            setPrintDialogOpen(false);
            // A tick for the re-render to land before the print snapshot.
            if (andPrint) setTimeout(() => window.print(), 50);
          }}
        />
      )}
    </div>
  );
}
