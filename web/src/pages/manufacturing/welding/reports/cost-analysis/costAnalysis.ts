import type {
  WeldingJobCostDetail,
  WeldingJobCostTotal,
  WeldingJobEntry,
  WeldingTypeSplit,
} from '@/api/welding/jobCosts';

// The legacy page's data shaping (costAnalysis.js), kept apart from React.

/** A summary table row (legacy processJobCostData). */
export interface JobCostRow {
  job_no: string;
  weekday_work_hours: number;
  after_hours_hours: number;
  sunday_hours: number;
  weekday_work_cost: number;
  after_hours_cost: number;
  sunday_cost: number;
  total_cost: number;
  cost_per_hour: number;
}

/** A user row of the detail modal (legacy userMap aggregation). */
export interface UserCostRow {
  key: string;
  user: string;
  weekday_work_hours: number;
  after_hours_hours: number;
  sunday_hours: number;
  total_hours: number;
  weekday_work_cost: number;
  after_hours_cost: number;
  sunday_cost: number;
  total_cost: number;
  cost_per_hour: number;
  /** Distinct issue keys of the user's entries, in entry order. */
  issue_keys: string[];
}

const num = (value: unknown): number => Number(value) || 0;

function splitTotal(split: WeldingTypeSplit | undefined): number {
  return num(split?.regular) + num(split?.after_hours) + num(split?.holiday);
}

export function toJobCostRow(job: WeldingJobCostTotal): JobCostRow {
  const totalHours = splitTotal(job.hours);
  const totalCost = num(job.total_cost);
  return {
    job_no: job.job_no,
    weekday_work_hours: num(job.hours?.regular),
    after_hours_hours: num(job.hours?.after_hours),
    sunday_hours: num(job.hours?.holiday),
    weekday_work_cost: num(job.costs?.regular),
    after_hours_cost: num(job.costs?.after_hours),
    sunday_cost: num(job.costs?.holiday),
    total_cost: totalCost,
    cost_per_hour: totalHours > 0 ? totalCost / totalHours : 0,
  };
}

export interface CostLeader {
  job_no: string;
  value: number;
}

export interface CostStats {
  mostExpensive: CostLeader;
  mostExpensivePerHour: CostLeader;
  mostOvertimeCost: CostLeader;
  mostHours: CostLeader;
}

/** The first row with the largest value (legacy reduce with `>`). */
function leader(rows: JobCostRow[], value: (row: JobCostRow) => number): CostLeader {
  let best = rows[0]!;
  for (const row of rows) if (value(row) > value(best)) best = row;
  return { job_no: best.job_no, value: value(best) };
}

/** Legacy updateStatistics; null when there are no rows (cards show '-'). */
export function costStats(rows: JobCostRow[]): CostStats | null {
  if (rows.length === 0) return null;
  return {
    mostExpensive: leader(rows, (r) => r.total_cost),
    mostExpensivePerHour: leader(rows, (r) => r.cost_per_hour),
    mostOvertimeCost: leader(rows, (r) => r.after_hours_cost + r.sunday_cost),
    mostHours: leader(rows, (r) => r.weekday_work_hours + r.after_hours_hours + r.sunday_hours),
  };
}

/** Legacy showUserDetails: the entries summed per employee. */
export function aggregateUsers(entries: WeldingJobEntry[]): UserCostRow[] {
  const users = new Map<string, UserCostRow>();
  for (const entry of entries) {
    const key = String(entry.employee_id ?? entry.employee_username ?? '');
    let user = users.get(key);
    if (!user) {
      user = {
        key,
        user: entry.employee_full_name || entry.employee_username || '-',
        weekday_work_hours: 0,
        after_hours_hours: 0,
        sunday_hours: 0,
        total_hours: 0,
        weekday_work_cost: 0,
        after_hours_cost: 0,
        sunday_cost: 0,
        total_cost: 0,
        cost_per_hour: 0,
        issue_keys: [],
      };
      users.set(key, user);
    }
    const type = entry.overtime_type || 'regular';
    // The API may send hours/cost as decimal strings.
    const hours = num(entry.hours);
    const cost = num(entry.cost);
    if (type === 'regular') user.weekday_work_hours += hours;
    else if (type === 'after_hours') user.after_hours_hours += hours;
    else if (type === 'holiday') user.sunday_hours += hours;

    if (entry.cost !== undefined) {
      if (type === 'regular') user.weekday_work_cost += cost;
      else if (type === 'after_hours') user.after_hours_cost += cost;
      else if (type === 'holiday') user.sunday_cost += cost;
      user.total_cost += cost;
    }
    if (entry.issue_key && !user.issue_keys.includes(entry.issue_key))
      user.issue_keys.push(entry.issue_key);
  }
  return Array.from(users.values(), (user) => {
    const totalHours = user.weekday_work_hours + user.after_hours_hours + user.sunday_hours;
    return {
      ...user,
      total_hours: totalHours,
      cost_per_hour: totalHours > 0 ? user.total_cost / totalHours : 0,
    };
  });
}

export interface UserDetailSummary {
  totalUsers: number;
  totalCost: number;
  overtimeCost: number;
  costPerHour: number;
  weekdayHours: number;
  afterHours: number;
  sundayHours: number;
  totalHours: number;
}

/** Legacy modal totals: the server summary where it has one, else the user sums. */
export function userDetailSummary(
  detail: WeldingJobCostDetail,
  users: UserCostRow[],
): UserDetailSummary {
  const sum = (value: (u: UserCostRow) => number) =>
    users.reduce((total, u) => total + value(u), 0);
  const breakdown = detail.summary?.breakdown_by_type;
  const totalCost = sum((u) => u.total_cost);
  const weekdayHours = Number(breakdown?.regular || sum((u) => u.weekday_work_hours));
  const afterHours = Number(breakdown?.after_hours || sum((u) => u.after_hours_hours));
  const sundayHours = Number(breakdown?.holiday || sum((u) => u.sunday_hours));
  const totalHours = Number(detail.summary?.total_hours || weekdayHours + afterHours + sundayHours);
  return {
    totalUsers: users.length,
    totalCost,
    overtimeCost: sum((u) => u.after_hours_cost + u.sunday_cost),
    costPerHour: totalHours > 0 ? totalCost / totalHours : 0,
    weekdayHours,
    afterHours,
    sundayHours,
    totalHours,
  };
}
