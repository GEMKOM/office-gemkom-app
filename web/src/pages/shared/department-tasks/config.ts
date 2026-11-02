/**
 * What differs between the five department task pages. Legacy passed a
 * small config to initDepartmentTasksPage and branched on `department`
 * inside the component; the branches are named flags here so each page's
 * behaviour is readable in one place.
 */
export type TaskDepartment = 'design' | 'logistics' | 'manufacturing' | 'planning' | 'procurement';

export interface DepartmentTasksConfig {
  /** API `department` filter, and the user list's department_code (legacy userTeam). */
  department: TaskDepartment;
  title: string;
  subtitle: string;
  backTo: string;
  /** "Yeni Görev" in the header: the department raises its own (standalone) tasks. */
  canCreateTasks: boolean;
  /**
   * Drawing releases: review badges in Durum, completion through the release
   * modals, "Revizyonu Başlat", the Çizim İncelemesi tab and the release
   * guards (design).
   */
  releaseFlow: boolean;
  /** The "Alt Görev Ekle" tab (design). */
  addSubtaskTab: boolean;
  /** "KK'ya Gönder" tab with the Excel import (manufacturing). */
  qcSubmit: boolean;
  /** Taşeron / Takım tabs on welding, subcontracting and internal_team tasks (manufacturing). */
  weldingAssignments: boolean;
  /** Extra column after "Atanan". */
  extraColumn: 'allocations' | 'jobOrderWeight' | null;
}

const SUBTITLE = 'Görevleri görüntüleyin, başlatın ve yönetin';

const BASE = {
  subtitle: SUBTITLE,
  canCreateTasks: false,
  releaseFlow: false,
  addSubtaskTab: false,
  qcSubmit: false,
  weldingAssignments: false,
  extraColumn: null,
} satisfies Partial<DepartmentTasksConfig>;

export const DESIGN_TASKS: DepartmentTasksConfig = {
  ...BASE,
  department: 'design',
  title: 'Dizayn Departmanı Görevleri',
  backTo: '/design/',
  canCreateTasks: true,
  releaseFlow: true,
  addSubtaskTab: true,
};

export const LOGISTICS_TASKS: DepartmentTasksConfig = {
  ...BASE,
  department: 'logistics',
  title: 'Lojistik Departmanı Görevleri',
  backTo: '/logistics/',
};

export const MANUFACTURING_TASKS: DepartmentTasksConfig = {
  ...BASE,
  department: 'manufacturing',
  title: 'İmalat Departmanı Görevleri',
  backTo: '/manufacturing/',
  qcSubmit: true,
  weldingAssignments: true,
  extraColumn: 'jobOrderWeight',
};

export const PLANNING_TASKS: DepartmentTasksConfig = {
  ...BASE,
  department: 'planning',
  title: 'Planlama Departmanı Görevleri',
  backTo: '/planning/',
  extraColumn: 'allocations',
};

export const PROCUREMENT_TASKS: DepartmentTasksConfig = {
  ...BASE,
  department: 'procurement',
  title: 'Satın Alma Departmanı Görevleri',
  backTo: '/procurement/',
};
