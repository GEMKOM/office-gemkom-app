import { Button, Center, Group, Loader, Modal, Select, Text, Textarea, TextInput } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useJobOrderOptions } from '@/api/reference/jobOrders';
import {
  approveSubmission,
  sendBackSubmission,
  submissionQueryOptions,
  updateSubmission,
  type Submission,
  type TimesheetFlag,
} from '@/api/welding/timesheets';
import { FaIcon, ModalBody, ModalFooter, ModalHeader, modalClassNames, notify } from '@/ui';
import { buildSubmissionEdits, padCells, type SourceRow } from './editPayload';
import {
  CELLS,
  fmtHours,
  formatTr,
  GENERAL,
  hoursFor,
  hoursWords,
  jobLabel,
  jobTitle,
  rangesText,
  REGULAR_CELLS,
  shortTime,
  sumHours,
} from './timesheetCells';
import css from './TimesheetsPage.module.css';

interface EditJob {
  key?: string;
  kind?: string;
  job_no: string;
  title: string;
  cells: boolean[];
}

/** The open editor (legacy state.edit). */
interface EditState {
  locked: boolean;
  kind: string;
  kindLabel: string;
  code: string;
  sourceRows: SourceRow[];
  offered: { job_no: string; title: string }[];
  jobs: EditJob[];
  blankDay: boolean;
  note: string;
  flags: TimesheetFlag[];
  dirty: boolean;
}

/** Legacy hydrateEdit: the editor state from a submission. */
function hydrate(detail: Submission, prev?: EditState): EditState {
  const parsed = detail.parsed ?? {};
  const rows = (parsed.rows ?? []).map((r) => ({
    key: r.key,
    kind: r.kind,
    job_no: r.job_no ?? '',
    title: r.title || '',
    cells: padCells(r.cells, CELLS.length),
  }));
  return {
    locked: detail.status === 'approved' || detail.status === 'discarded',
    kind: parsed.kind || prev?.kind || 'weekday',
    kindLabel: parsed.kind_label || prev?.kindLabel || '',
    code: parsed.code || detail.sheet_code || prev?.code || '',
    sourceRows: rows.map((r) => ({ key: r.key, kind: r.kind, job_no: r.job_no })),
    offered: rows.filter((r) => r.kind === 'preprinted').map((r) => ({ job_no: r.job_no, title: r.title })),
    jobs: rows.filter((r) => r.cells.some(Boolean) && r.job_no).map((r) => ({ ...r, cells: r.cells.slice() })),
    blankDay: !!parsed.blank_day,
    note: parsed.note || '',
    flags: (parsed.flags ?? []).filter((f) => f.level !== 'info'),
    dirty: false,
  };
}

/** The job that already has this hour, other than `exceptJob`. */
function cellOwner(jobs: EditJob[], idx: number, exceptJob: string): string | null {
  return jobs.find((j) => j.job_no !== exceptJob && j.cells[idx])?.job_no ?? null;
}

export interface SubmissionEditorModalProps {
  submissionId: number;
  /** Called when the modal closes, whatever happened in it (the page reloads the day). */
  onClose: () => void;
}

/** Puantaj editor: the day as the welder sees it on the phone (job cards with hour cells). */
export function SubmissionEditorModal({ submissionId, onClose }: SubmissionEditorModalProps) {
  const detail = useQuery(submissionQueryOptions(submissionId));

  useEffect(() => {
    if (detail.isError) {
      notify.error(detail.error, { fallback: 'Giriş alınamadı' });
      onClose();
    }
  }, [detail.isError, detail.error, onClose]);

  return (
    <Modal
      opened
      onClose={onClose}
      size="lg"
      withCloseButton={false}
      classNames={modalClassNames}
      closeOnClickOutside={false}
    >
      {detail.data ? (
        <Editor key={submissionId} submission={detail.data} onClose={onClose} />
      ) : (
        <Center py="xl">
          <Loader size="sm" />
        </Center>
      )}
    </Modal>
  );
}

function Editor({ submission, onClose }: { submission: Submission; onClose: () => void }) {
  const [edit, setEdit] = useState<EditState>(() => hydrate(submission));
  const [busy, setBusy] = useState(false);
  const [sendingBack, setSendingBack] = useState(false);
  const [lastAdded, setLastAdded] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const jobOptions = useJobOrderOptions({ weldingOnly: true });

  const name = submission.employee_name || '';
  const date = submission.parsed?.date || submission.date;

  // Bring a newly added job's card into view (legacy addJob).
  useEffect(() => {
    if (!lastAdded) return;
    const card = [...(bodyRef.current?.querySelectorAll<HTMLElement>('[data-row]') ?? [])].find(
      (el) => el.dataset.row === lastAdded,
    );
    card?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  }, [lastAdded]);

  const added = useMemo(() => new Set(edit.jobs.map((j) => j.job_no)), [edit.jobs]);
  const searchable = useMemo(
    () =>
      (jobOptions.data ?? [])
        .filter((j) => !added.has(j.job_no))
        .map((j) => ({
          value: j.job_no,
          label: j.job_no === GENERAL ? 'GENEL (1000) — İş emri dışı genel işler' : `${j.job_no} — ${j.title || ''}`,
        })),
    [jobOptions.data, added],
  );

  const change = (fn: (draft: EditState) => EditState) => {
    if (edit.locked) return;
    setEdit((prev) => ({ ...fn(prev), dirty: true }));
  };

  const updateJob = (jobNo: string, fn: (job: EditJob, jobs: EditJob[]) => EditJob[]) =>
    change((prev) => {
      const job = prev.jobs.find((j) => j.job_no === jobNo);
      return job ? { ...prev, jobs: fn(job, prev.jobs) } : prev;
    });

  const addJob = (jobNo: string, title: string) => {
    if (edit.locked || added.has(jobNo)) return;
    change((prev) => ({ ...prev, jobs: [...prev.jobs, { job_no: jobNo, title, cells: padCells([], CELLS.length) }] }));
    setLastAdded(jobNo);
  };

  const toggleCell = (jobNo: string, idx: number) =>
    updateJob(jobNo, (job, jobs) => {
      const on = job.cells[idx];
      // Marking an hour another job has moves it to this job.
      const owner = on ? null : cellOwner(jobs, idx, jobNo);
      return jobs.map((j) => {
        if (j.job_no === jobNo) return { ...j, cells: j.cells.map((c, i) => (i === idx ? !on : c)) };
        if (j.job_no === owner) return { ...j, cells: j.cells.map((c, i) => (i === idx ? false : c)) };
        return j;
      });
    });

  const quickFill = (jobNo: string, mode: 'day' | 'evening' | 'clear') =>
    updateJob(jobNo, (job, jobs) => {
      let cells: boolean[];
      if (mode === 'clear') {
        cells = job.cells.map(() => false);
      } else {
        const [from, to] = mode === 'day' ? [0, REGULAR_CELLS] : [REGULAR_CELLS, CELLS.length];
        // Hours another job already has stay with it.
        cells = job.cells.map((c, i) => (i >= from && i < to && !cellOwner(jobs, i, jobNo) ? true : c));
      }
      return jobs.map((j) => (j.job_no === jobNo ? { ...j, cells } : j));
    });

  const total = edit.blankDay ? 0 : edit.jobs.reduce((sum, j) => sum + sumHours(hoursFor(j.cells, edit.kind)), 0);
  const canSend = edit.blankDay || total > 0;

  /** Saves the draft; returns false when nothing was saved. */
  const save = async (silent = false): Promise<boolean> => {
    const payload = buildSubmissionEdits({
      blankDay: edit.blankDay,
      note: edit.note,
      jobs: edit.jobs,
      sourceRows: edit.sourceRows,
      cellCount: CELLS.length,
    });
    if (!payload.blank_day && !payload.rows.some((row) => row.cells.some(Boolean))) {
      notify.error('Saat işaretleyin veya günü boş işaretleyin');
      return false;
    }
    try {
      const saved = await updateSubmission(submission.id, payload);
      setEdit((prev) => hydrate(saved, prev));
      if (!silent) notify.success('Kaydedildi');
      return true;
    } catch (error) {
      notify.error(error, { fallback: 'Düzenleme kaydedilemedi' });
      return false;
    }
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  const approve = () =>
    run(async () => {
      if (edit.dirty && !(await save(true))) return;
      try {
        const res = await approveSubmission(submission.id);
        notify.success(res.created_count ? `${res.created_count} zaman kaydı oluşturuldu` : 'Boş gün olarak onaylandı');
        onClose();
      } catch (error) {
        notify.error(error, { fallback: 'Onaylanamadı' });
      }
    });

  const offered = [...edit.offered, { job_no: GENERAL, title: '' }].filter((j) => !added.has(j.job_no));

  return (
    <>
      <ModalHeader
        icon="fas fa-clipboard-check"
        title={`${name} · ${formatTr(date)}`}
        subtitle={[edit.kindLabel, edit.code].filter(Boolean).join(' · ') || undefined}
      />
      <ModalBody>
        <div ref={bodyRef} className={edit.locked ? css.locked : undefined} data-testid="timesheet-editor">
          {edit.flags.length ? (
            <div style={{ marginBottom: 8 }}>
              {edit.flags.map((f, i) => (
                <div key={i} className={css.flag} data-level={f.level}>
                  {f.text}
                </div>
              ))}
            </div>
          ) : null}

          <button
            type="button"
            className={css.toggle}
            data-on={edit.blankDay || undefined}
            aria-pressed={edit.blankDay}
            disabled={edit.locked}
            onClick={() => change((prev) => ({ ...prev, blankDay: !prev.blankDay }))}
          >
            <span className={css.check}>{edit.blankDay ? <FaIcon icon="fas fa-check" /> : null}</span>
            <span>
              Bugün çalışmadım <small className={css.muted}>(izin / rapor / görevli değil)</small>
            </span>
          </button>

          {edit.blankDay ? null : (
            <>
              {edit.jobs.length ? <div className={css.sectionTitle}>Günün işleri</div> : null}
              {edit.jobs.map((job) => (
                <div key={job.job_no} className={css.job} data-row={job.job_no}>
                  <div className={css.jobHead}>
                    <div className={css.jobNo}>{jobLabel(job.job_no)}</div>
                    <div className={css.jobTitle} title={jobTitle(job.job_no, job.title)}>
                      {jobTitle(job.job_no, job.title)}
                    </div>
                    <button
                      type="button"
                      className={css.remove}
                      aria-label={`${jobLabel(job.job_no)} kaldır`}
                      disabled={edit.locked}
                      onClick={() => change((prev) => ({ ...prev, jobs: prev.jobs.filter((j) => j.job_no !== job.job_no) }))}
                    >
                      <FaIcon icon="fas fa-xmark" />
                    </button>
                  </div>
                  <div className={css.quick}>
                    <button type="button" disabled={edit.locked} onClick={() => quickFill(job.job_no, 'day')}>
                      Gündüz 07:30–17:00
                    </button>
                    <button type="button" disabled={edit.locked} onClick={() => quickFill(job.job_no, 'evening')}>
                      Akşam 17–21
                    </button>
                    <button
                      type="button"
                      className={css.clear}
                      title="Temizle"
                      aria-label={`${jobLabel(job.job_no)} temizle`}
                      disabled={edit.locked}
                      onClick={() => quickFill(job.job_no, 'clear')}
                    >
                      <FaIcon icon="fas fa-eraser" />
                    </button>
                  </div>
                  <div className={css.grid}>
                    {CELLS.map((cell, idx) => {
                      const on = job.cells[idx];
                      const owner = on ? null : cellOwner(edit.jobs, idx, job.job_no);
                      const sub = owner ? jobLabel(owner) : cell.hours < 1 ? '½ saat' : idx >= REGULAR_CELLS ? 'mesai' : '';
                      return (
                        <button
                          key={idx}
                          type="button"
                          className={css.cell}
                          data-on={on || undefined}
                          data-used={owner ? true : undefined}
                          data-ot={idx >= REGULAR_CELLS || undefined}
                          data-half={cell.hours < 1 || undefined}
                          aria-pressed={on}
                          aria-label={`${jobLabel(job.job_no)} ${cell.start}–${cell.end}`}
                          title={`${cell.start}–${cell.end}${owner ? ` · ${jobLabel(owner)} işinde` : ''}`}
                          disabled={edit.locked}
                          onClick={() => toggleCell(job.job_no, idx)}
                        >
                          {shortTime(cell.start)}–{shortTime(cell.end)}
                          <small>{sub}</small>
                        </button>
                      );
                    })}
                  </div>
                  <div className={css.jobHours}>
                    {rangesText(job.cells) || '–'} <span className={css.muted}>·</span>{' '}
                    {hoursWords(hoursFor(job.cells, edit.kind))}
                  </div>
                </div>
              ))}

              <div className={css.sectionTitle}>{edit.jobs.length ? 'İş ekle' : 'Hangi işte çalıştı?'}</div>
              {offered.length ? (
                <div className={css.addList}>
                  {offered.map((j) => (
                    <button
                      key={j.job_no}
                      type="button"
                      className={css.add}
                      disabled={edit.locked}
                      onClick={() => addJob(j.job_no, j.title || '')}
                    >
                      <span className={css.addNo}>{jobLabel(j.job_no)}</span>
                      <span className={css.addTitle}>{jobTitle(j.job_no, j.title)}</span>
                      <FaIcon icon="fas fa-plus" />
                    </button>
                  ))}
                </div>
              ) : null}
              {edit.locked ? null : (
                <Select
                  aria-label="İş emri ekle"
                  placeholder="Listede yoksa iş emri ara ve ekle..."
                  data={searchable}
                  value={null}
                  searchable
                  nothingFoundMessage="Sonuç bulunamadı"
                  maxDropdownHeight={260}
                  comboboxProps={{ withinPortal: true }}
                  onChange={(value) => {
                    if (!value) return;
                    const option = (jobOptions.data ?? []).find((j) => j.job_no === value);
                    addJob(value, option?.title || '');
                  }}
                />
              )}
            </>
          )}

          <div className={css.sectionTitle}>
            Not <small className={css.muted}>(isteğe bağlı)</small>
          </div>
          <TextInput
            aria-label="Not"
            maxLength={200}
            value={edit.note}
            disabled={edit.locked}
            onChange={(event) => {
              const note = event.currentTarget.value;
              change((prev) => ({ ...prev, note }));
            }}
          />
        </div>
      </ModalBody>
      <ModalFooter>
        <Group w="100%" gap="md" wrap="wrap">
          <div>
            <Text size="xs" c="dimmed">
              Toplam
            </Text>
            <Text fw={700} size="lg" data-testid="timesheet-total">
              {edit.blankDay ? 'Çalışılmadı' : `${fmtHours(total)} saat`}
            </Text>
          </div>
          {edit.locked ? null : (
            <Button
              size="xs"
              variant="outline"
              color="red"
              leftSection={<FaIcon icon="fas fa-rotate-left" />}
              disabled={busy}
              onClick={() => setSendingBack(true)}
            >
              Kaynakçıya geri gönder
            </Button>
          )}
          <Group gap="xs" ml="auto">
            <Button size="xs" variant="default" leftSection={<FaIcon icon="fas fa-times" />} onClick={onClose}>
              Kapat
            </Button>
            {edit.locked ? null : (
              <>
                <Button
                  size="xs"
                  variant="outline"
                  leftSection={<FaIcon icon="fas fa-save" />}
                  disabled={!edit.dirty || !canSend || busy}
                  onClick={() => void run(async () => void (await save()))}
                >
                  Kaydet
                </Button>
                <Button
                  size="xs"
                  color="green"
                  leftSection={<FaIcon icon="fas fa-check" />}
                  disabled={!canSend}
                  loading={busy}
                  onClick={() => void approve()}
                >
                  {edit.dirty ? 'Kaydet ve onayla' : 'Onayla'}
                </Button>
              </>
            )}
          </Group>
        </Group>
      </ModalFooter>

      {sendingBack ? (
        <SendBackModal
          onCancel={() => setSendingBack(false)}
          onSend={async (reason) => {
            try {
              await sendBackSubmission(submission.id, reason);
              notify.success('Giriş kaynakçıya geri gönderildi');
              setSendingBack(false);
              onClose();
            } catch (error) {
              notify.error(error, { fallback: 'Geri gönderilemedi' });
            }
          }}
        />
      ) : null}
    </>
  );
}

/** Legacy window.prompt for the send-back reason. */
function SendBackModal({ onCancel, onSend }: { onCancel: () => void; onSend: (reason: string) => Promise<void> }) {
  const [reason, setReason] = useState('');
  const [sending, setSending] = useState(false);
  return (
    <Modal opened onClose={onCancel} size="md" withCloseButton={false} classNames={modalClassNames}>
      <ModalHeader tone="danger" icon="fas fa-rotate-left" title="Kaynakçıya geri gönder" />
      <ModalBody>
        <Textarea
          label="Kaynakçıya iletilecek açıklama (telefonunda görünür)"
          rows={3}
          value={reason}
          onChange={(event) => setReason(event.currentTarget.value)}
          data-autofocus
        />
      </ModalBody>
      <ModalFooter>
        <Button variant="default" onClick={onCancel} disabled={sending}>
          İptal
        </Button>
        <Button
          color="red"
          loading={sending}
          leftSection={<FaIcon icon="fas fa-rotate-left" />}
          onClick={async () => {
            setSending(true);
            try {
              await onSend(reason);
            } finally {
              setSending(false);
            }
          }}
        >
          Geri gönder
        </Button>
      </ModalFooter>
    </Modal>
  );
}
