import type { LegacyUser } from '@legacy/authService.js';
import type { DataTableColumn } from '@/ui';
import { departmentRequestColumns } from './general/department-requests/list/columns';
import { userColumns } from './human_resources/users/columns';
import { approvedRequestColumns } from './planning/department-requests/columns';
import { inventoryColumns } from './it/inventory/columns';
import {
  cncTimerColumns,
  machiningTimerColumns,
} from './manufacturing/reports-shared/finishedTimerColumns';
import { ncrColumns } from './quality-control/ncrs/columns';
import { reviewColumns } from './quality-control/qc-reviews/columns';
import { customerColumns } from './sales/customers/columns';

// Server-sorted tables send the sortable column's sortKey ?? key as `ordering`.
// DRF drops a field outside ordering_fields without a word (the header shows a
// sort the rows never get), and the timer list orders by any name it is given,
// so a field that is not a model column is a 500. These sets are the backends'
// ordering_fields as observed against the real API on 2026-11-02.
const CONTRACTS: {
  name: string;
  columns: DataTableColumn<never>[];
  tableSortable?: boolean;
  orderable: string[];
}[] = [
  {
    name: 'customers',
    columns: customerColumns as never,
    orderable: ['code', 'name', 'created_at', 'updated_at'],
  },
  {
    name: 'ncrs',
    columns: ncrColumns({ id: 1 } as LegacyUser, []) as never,
    orderable: ['created_at', 'severity', 'status'],
  },
  { name: 'qc reviews', columns: reviewColumns as never, orderable: ['submitted_at', 'status'] },
  {
    name: 'hr users',
    columns: userColumns as never,
    tableSortable: true,
    orderable: [
      'username',
      'first_name',
      'last_name',
      'email',
      'profile__must_reset_password',
      'profile__position__title',
      'profile__position__level',
      'profile__position__department_code',
    ],
  },
  {
    name: 'department requests',
    columns: departmentRequestColumns as never,
    orderable: ['id', 'created_at', 'needed_date', 'priority'],
  },
  {
    name: 'approved department requests (planning)',
    columns: approvedRequestColumns as never,
    orderable: ['id', 'created_at', 'needed_date', 'priority'],
  },
  {
    name: 'it inventory',
    columns: inventoryColumns(() => {}) as never,
    orderable: ['id', 'name', 'machine_type', 'code'],
  },
  // The timer list takes any model field: these are the FinishedTimer columns it has.
  {
    name: 'cnc finished timers',
    columns: cncTimerColumns as never,
    orderable: [
      'id',
      'object_id',
      'start_time',
      'finish_time',
      'duration',
      'comment',
      'manual_entry',
      'machine_fk',
    ],
  },
  {
    name: 'machining finished timers',
    columns: machiningTimerColumns as never,
    orderable: [
      'id',
      'object_id',
      'start_time',
      'finish_time',
      'duration',
      'comment',
      'manual_entry',
      'machine_fk',
    ],
  },
];

it.each(CONTRACTS)(
  '$name: every sortable column is one the backend orders by',
  ({ columns, tableSortable, orderable }) => {
    const sent = columns
      .filter((column) => column.sortable ?? tableSortable ?? false)
      .map((column) => column.sortKey ?? column.key);
    expect(sent.length).toBeGreaterThan(0);
    expect(sent.filter((field) => !orderable.includes(field))).toEqual([]);
  },
);
