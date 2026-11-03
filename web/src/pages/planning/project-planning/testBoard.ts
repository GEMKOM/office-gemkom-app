// A small but complete planning board for the tests: two resources, two job
// orders with every row kind (material, cutting, İmalat, machining, welding
// with a staged and an unstaged assignment, paint, shipping), and one job that
// is not assigned to anyone yet.

import type { PlanningBoard } from './model/types';

const task = (task_id: number, extra: Record<string, unknown> = {}) => ({
  task_id,
  status: 'in_progress',
  progress: 0,
  weight: 10,
  duration_wd: null,
  start_date: null,
  end_date: null,
  ...extra,
});

export function testBoard(): PlanningBoard {
  return {
    holidays: [{ date: '2026-10-29', is_half_day: false }],
    resources: [
      {
        resource_type: 'team',
        id: 3,
        name: 'KAYNAK EKİBİ 1',
        display_name: 'Ekip 1',
        blocks: [
          {
            assignment_type: 'internal_team',
            assignment_id: 11,
            subtask_id: 101,
            welding_task_id: 7,
            job_no: '293-03-07',
            job_order_title: 'COOLED PANEL 4',
            customer_name: 'ACME',
            allocated_weight_kg: 6000,
            notes: '',
            subtask: {
              status: 'in_progress',
              progress: 20,
              start_date: '2026-11-02',
              end_date: '2026-11-20',
              duration_wd: 15,
              actual_start_date: null,
            },
            stages: [
              {
                id: 51,
                title: 'Montaj',
                is_default: true,
                weight: 10,
                status: 'in_progress',
                progress: 40,
              },
              {
                id: 52,
                title: 'Kaynak ve Taşlama',
                is_default: true,
                weight: 10,
                status: 'pending',
                progress: 0,
              },
            ],
          },
          {
            assignment_type: 'internal_team',
            assignment_id: 12,
            subtask_id: 102,
            welding_task_id: 8,
            job_no: '100-102',
            job_order_title: 'HOPPER',
            customer_name: 'BETA',
            allocated_weight_kg: 2000,
            notes: 'acil',
            subtask: {
              status: 'in_progress',
              progress: 10,
              start_date: '2026-11-04',
              end_date: '2026-11-13',
              duration_wd: 8,
              actual_start_date: null,
            },
            stages: [],
          },
        ],
      },
      {
        resource_type: 'subcontractor',
        id: 5,
        name: 'HARUN METAL BAKIR',
        display_name: 'HARUN METAL',
        blocks: [
          {
            assignment_type: 'subcontracting',
            assignment_id: 21,
            subtask_id: 201,
            welding_task_id: 7,
            job_no: '293-03-07',
            job_order_title: 'COOLED PANEL 4',
            customer_name: 'ACME',
            allocated_weight_kg: 4000,
            is_billed: true,
            notes: '',
            subtask: {
              status: 'pending',
              progress: 0,
              start_date: null,
              end_date: null,
              actual_start_date: null,
            },
            stages: [],
          },
        ],
      },
    ],
    welding_tasks: [
      {
        welding_task_id: 7,
        job_no: '293-03-07',
        job_order_title: 'COOLED PANEL 4',
        customer_name: 'ACME',
        total_weight_kg: 10000,
      },
      {
        welding_task_id: 8,
        job_no: '100-102',
        job_order_title: 'HOPPER',
        customer_name: 'BETA',
        total_weight_kg: 1500,
      },
      {
        welding_task_id: 9,
        job_no: '195-35-01',
        job_order_title: 'SILO',
        customer_name: 'GAMA',
        total_weight_kg: 3000,
      },
    ],
    job_info: {
      '293-03-07': {
        job_order: {
          title: 'COOLED PANEL 4',
          start_date: '2026-10-01',
          end_date: '2026-12-15',
          total_weight_kg: 10000,
          quantity: 4,
          progress: 12,
          status: 'active',
        },
        material_supply: task(900, {
          status: 'completed',
          progress: 100,
          start_date: '2026-10-05',
          end_date: '2026-10-20',
        }),
        cutting: [task(901, { start_date: '2026-10-21', end_date: '2026-10-30', duration_wd: 7 })],
        manufacturing: task(902, {
          assigned_to: 4,
          assigned_to_name: 'Ali Usta',
          has_subtasks: true,
          weight: 90,
          start_date: '2026-11-02',
          entered_start_date: '2026-11-02',
          duration_wd: 30,
          entered_duration_wd: 30,
          end_date: '2026-12-14',
        }),
        machining: [
          task(903, {
            title: 'Torna',
            weight: 5,
            start_date: '2026-11-03',
            end_date: '2026-11-10',
          }),
        ],
        welding: task(904, {
          has_subtasks: true,
          weight: 85,
          start_date: '2026-11-02',
          end_date: '2026-12-01',
        }),
        painting: task(905, {
          status: 'pending',
          weight: 10,
          start_date: '2026-12-02',
          end_date: '2026-12-14',
        }),
        logistics: task(906, {
          status: 'pending',
          start_date: '2026-12-15',
          end_date: '2026-12-17',
          date_source: 'plan_tail',
        }),
      },
      '100-102': {
        job_order: {
          title: 'HOPPER',
          start_date: '2026-10-10',
          end_date: '2026-11-30',
          total_weight_kg: 1500,
          quantity: 1,
          status: 'active',
        },
        manufacturing: task(910, {
          assigned_to: 6,
          assigned_to_name: 'Veli Usta',
          has_subtasks: true,
          start_date: '2026-11-04',
        }),
        welding: task(911, { has_subtasks: true, weight: 90 }),
        painting: null,
      },
      '195-35-01': {
        job_order: {
          title: 'SILO',
          start_date: '2026-10-15',
          end_date: '2027-01-20',
          total_weight_kg: 3000,
          quantity: 2,
          status: 'active',
        },
        manufacturing: task(920, { status: 'pending', start_date: '2026-12-01' }),
      },
    },
  };
}
