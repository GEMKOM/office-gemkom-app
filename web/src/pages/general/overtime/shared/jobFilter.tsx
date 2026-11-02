import { MultiSelect, TextInput } from '@mantine/core';
import { useMemo, useState } from 'react';
import { useJobOrderOptions, type JobOrderOption } from '@/api/reference/jobOrders';
import type { FilterOption } from '@/ui';

// İş No multi-select shared by the overtime report pages (cost report,
// machining report); was general/overtime/jobFilter.js.
//
// Options are each project number (the part before the first dash, e.g.
// RM269 — not itself a job order) followed by its top-level job orders, so
// typing "RM269" shows a handful of rows instead of every sub-job. The backend
// matches every pick as a prefix (overtime/services/job_filter.py), so RM269-06
// also covers RM269-06-04.

export function buildJobOptions(jobOrders: readonly JobOrderOption[]): FilterOption[] {
  const projects = new Map<string, JobOrderOption[]>();
  jobOrders.forEach((j) => {
    const project = String(j.job_no).split('-')[0] ?? '';
    const list = projects.get(project);
    if (list) list.push(j);
    else projects.set(project, [j]);
  });

  const options: FilterOption[] = [];
  projects.forEach((jobs, project) => {
    const exact = jobs.find((j) => j.job_no === project);
    if (!exact || jobs.length > 1) {
      const customer = jobs.map((j) => j.customer_name).find(Boolean);
      const extra = [`tüm işler (${jobs.length} iş emri)`, customer].filter(Boolean).join(' · ');
      options.push({ value: project, label: `${project} — ${extra}` });
    }
    jobs
      .filter((j) => j !== exact || jobs.length === 1)
      .forEach((j) => {
        const extra = [j.title, j.customer_name].filter(Boolean).join(' · ');
        options.push({ value: j.job_no, label: extra ? `${j.job_no} - ${extra}` : j.job_no });
      });
  });
  return options;
}

/** Mantine refuses duplicate values; picks from a deep link stay visible before the list loads. */
function withPicked(options: FilterOption[], picked: readonly string[]): FilterOption[] {
  const seen = new Set<string>();
  const out: FilterOption[] = [];
  for (const option of options) {
    if (seen.has(option.value)) continue;
    seen.add(option.value);
    out.push(option);
  }
  for (const value of picked) {
    if (!seen.has(value)) {
      seen.add(value);
      out.push({ value, label: value });
    }
  }
  return out;
}

function JobTextFilter({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const applied = value.join(',');
  const [draft, setDraft] = useState(applied);
  const [synced, setSynced] = useState(applied);
  if (synced !== applied) {
    setSynced(applied);
    setDraft(applied);
  }
  const commit = () => {
    const text = draft.trim();
    if (text !== applied) onChange(text ? [text] : []);
  };
  return (
    <TextInput
      size="xs"
      w={240}
      aria-label="İş No"
      placeholder="İş emri no (virgülle birden fazla)..."
      value={draft}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') commit();
      }}
    />
  );
}

/**
 * The İş No filter (legacy addJobFilter): a searchable multi-select over the
 * job orders (completed and cancelled too — overtime is historical; top-level
 * only, sub-jobs come in through the prefix). Falls back to a comma-separated
 * text field when the job list cannot be loaded.
 */
export function JobFilter({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const jobs = useJobOrderOptions({ includeAll: true, withCustomer: true, rootOnly: true });
  const options = useMemo(
    () => withPicked(buildJobOptions(jobs.data ?? []), value),
    [jobs.data, value],
  );
  if (jobs.isError) return <JobTextFilter value={value} onChange={onChange} />;
  return (
    <MultiSelect
      size="xs"
      miw={240}
      maw={420}
      aria-label="İş No (alt işler dahil)"
      placeholder={value.length ? undefined : 'İş No (alt işler dahil)'}
      data={options}
      value={value}
      onChange={onChange}
      searchable
      clearable
      nothingFoundMessage="Sonuç bulunamadı"
      maxDropdownHeight={320}
      comboboxProps={{ withinPortal: true }}
    />
  );
}
