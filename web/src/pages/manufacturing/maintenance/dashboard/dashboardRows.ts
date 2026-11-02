// Port of the row helpers in dashboard.js. The timer and fault endpoints have
// shipped several field spellings; legacy tried them in this order.

type Row = Record<string, unknown>;

function text(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s === '' ? null : s;
}

/** Legacy getStartMs: a timestamp (ms, s, or a numeric string) or a date string. */
export function startMs(row: Row): number | null {
  const raw = row.start_time ?? row.started_at ?? row.start ?? row.created_at ?? row.reported_at;
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number' && !Number.isNaN(raw)) return raw;
  const asNum = Number(raw);
  if (!Number.isNaN(asNum) && String(raw).trim() !== '') {
    // Unix seconds look like this; anything bigger is already milliseconds.
    return asNum < 10_000_000_000 ? asNum * 1000 : asNum;
  }
  const date = new Date(String(raw));
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

/** Legacy getUsername. */
export function userName(row: Row): string {
  for (const key of [
    'resolved_by_username',
    'username',
    'user',
    'user_name',
    'reported_by_username',
    'created_by_username',
  ]) {
    const value = row[key];
    if (value) return String(value);
  }
  return 'Bilinmiyor';
}

/** Legacy getMachineName. */
export function machineName(row: Row): string {
  const machine = row.machine;
  const fromFk =
    text(row.machine_name) ??
    (machine && typeof machine === 'object' ? text((machine as Row).name) : null) ??
    (typeof machine === 'string' ? text(machine) : null) ??
    text(row.asset_name) ??
    text(row.equipment_name);
  return fromFk ?? text(row.fault_machine_name) ?? 'Bilinmiyor';
}

/** Legacy getFaultLabel: the description, else the issue name, else "#<fault id>". */
export function faultLabel(row: Row): string {
  for (const key of [
    'fault_description',
    'description',
    'reason',
    'reason_name',
    'fault_reason_name',
  ]) {
    const value = row[key];
    if (value && String(value).trim() !== '') return String(value);
  }
  const issue = text(row.issue_name);
  if (issue) return issue;
  const id = row.fault_id ?? row.fault ?? row.machine_fault_id ?? row.request_id ?? row.id;
  const idText = text(id);
  return idText ? `#${idText}` : '-';
}

/** Legacy getResolvedAt. */
export function resolvedAt(row: Row): string | null {
  const value = row.resolved_at || row.resolved_date || row.completed_at || row.updated_at;
  return value ? String(value) : null;
}

/** The raw start value shown in Başlangıç. */
export function startedAt(row: Row): string | number | null {
  const value = row.start_time || row.started_at || row.start || row.created_at || row.reported_at;
  return typeof value === 'string' || typeof value === 'number' ? value : null;
}

/** Legacy formatDurationFromMs: "HH:MM:SS". */
export function clock(ms: number): string {
  const total = Math.floor(Math.max(0, ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

export interface TimerRow {
  key: string;
  user: string;
  machine: string;
  fault: string;
  started_at: string | number | null;
  start_ms: number | null;
}

export interface ResolvedRow {
  key: string;
  user: string;
  machine: string;
  fault: string;
  resolved_at: string | null;
}

export function toTimerRow(row: Row, index: number): TimerRow {
  return {
    key: String(row.id ?? `t${index}`),
    user: userName(row),
    machine: machineName(row),
    fault: faultLabel(row),
    started_at: startedAt(row),
    start_ms: startMs(row),
  };
}

export function toResolvedRow(row: Row, index: number): ResolvedRow {
  return {
    key: String(row.id ?? `r${index}`),
    user: userName(row),
    machine: machineName(row),
    fault: faultLabel(row),
    resolved_at: resolvedAt(row),
  };
}
