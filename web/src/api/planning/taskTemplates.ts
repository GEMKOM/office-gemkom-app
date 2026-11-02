import { keepPreviousData, queryOptions } from '@tanstack/react-query';
import { apiFetch, cleanParams, isApiError, type QueryParams } from '../client';
import { extractResults, toPaginated, type Paginated } from '../types';

// Port of apis/projects/taskTemplates.js as the Görev Şablonları page uses it
// (/projects/task-templates/). The project tracking planner still uses the
// legacy module.

export interface ChoiceOption {
  value: string;
  label: string;
}

export interface TemplateChildItem {
  id: number;
  parent?: number | null;
  title: string;
  sequence?: number | null;
  weight?: number | null;
  department?: string | null;
  department_display?: string | null;
  task_type?: string | null;
}

export interface TemplateItem extends TemplateChildItem {
  depends_on?: number[] | null;
  children_count?: number | null;
  children?: TemplateChildItem[] | null;
}

export interface TaskTemplate {
  id: number;
  name: string;
  description?: string | null;
  is_active?: boolean;
  is_default?: boolean;
  created_at?: string | null;
  created_by_name?: string | null;
  items?: TemplateItem[] | null;
}

export type TaskTemplatesParams = {
  search?: string;
  is_active?: boolean;
  is_default?: boolean;
  ordering?: string;
  page?: number;
};

export interface TaskTemplateInput {
  name: string;
  description: string;
  is_active: boolean;
  is_default: boolean;
}

export interface TemplateItemInput {
  department?: string;
  title?: string;
  sequence?: number;
  weight?: number;
  task_type?: string | null;
  depends_on?: number[];
}

/** Static fallback when department_choices fails (legacy DEPARTMENT_OPTIONS). */
export const DEPARTMENT_OPTIONS: ChoiceOption[] = [
  { value: 'design', label: 'Tasarım' },
  { value: 'planning', label: 'Planlama' },
  { value: 'procurement', label: 'Satın Alma' },
  { value: 'manufacturing', label: 'Üretim' },
  { value: 'painting', label: 'Boya' },
  { value: 'logistics', label: 'Lojistik' },
];

/** Static fallback when task_type_choices fails (legacy TASK_TYPE_OPTIONS). */
export const TASK_TYPE_OPTIONS: ChoiceOption[] = [
  { value: 'cnc_cutting', label: 'CNC Kesim' },
  { value: 'linear_cutting', label: 'Lineer Kesim' },
  { value: 'machining', label: 'Talaşlı İmalat' },
  { value: 'welding', label: 'Kaynaklı İmalat' },
  { value: 'painting', label: 'Boya' },
  { value: 'part', label: 'Parça' },
  { value: 'subcontracting', label: 'Taşeron' },
  { value: 'internal_team', label: 'Dahili Takım' },
];

const BASE = '/projects/task-templates/';
const detailPath = (id: number) => `${BASE}${id}/`;
const itemsPath = (id: number) => `${BASE}${id}/items/`;

export const taskTemplateKeys = {
  all: ['taskTemplates'] as const,
  list: (params: TaskTemplatesParams) => ['taskTemplates', 'list', cleanParams(params as QueryParams)] as const,
  detail: (id: number) => ['taskTemplates', 'detail', id] as const,
  items: (id: number) => ['taskTemplates', 'items', id] as const,
  departments: ['taskTemplates', 'departmentChoices'] as const,
  taskTypes: ['taskTemplates', 'taskTypeChoices'] as const,
};

export function listTaskTemplates(params: TaskTemplatesParams = {}, signal?: AbortSignal): Promise<Paginated<TaskTemplate>> {
  return apiFetch<unknown>(BASE, { params: params as QueryParams, signal }).then((data) => toPaginated<TaskTemplate>(data));
}

export function taskTemplatesQueryOptions(params: TaskTemplatesParams) {
  return queryOptions({
    queryKey: taskTemplateKeys.list(params),
    queryFn: ({ signal }) => listTaskTemplates(params, signal),
    placeholderData: keepPreviousData,
  });
}

export function getTaskTemplate(id: number, signal?: AbortSignal): Promise<TaskTemplate> {
  return apiFetch<TaskTemplate>(detailPath(id), { signal });
}

export function taskTemplateQueryOptions(id: number) {
  return queryOptions({
    queryKey: taskTemplateKeys.detail(id),
    queryFn: ({ signal }) => getTaskTemplate(id, signal),
    staleTime: 0,
  });
}

export function createTaskTemplate(data: TaskTemplateInput): Promise<TaskTemplate> {
  return apiFetch<TaskTemplate>(BASE, { method: 'POST', body: data });
}

/** PUT: the legacy page always sent every field. */
export function updateTaskTemplate(id: number, data: TaskTemplateInput): Promise<TaskTemplate> {
  return apiFetch<TaskTemplate>(detailPath(id), { method: 'PUT', body: data });
}

export function deleteTaskTemplate(id: number): Promise<void> {
  return apiFetch<void>(detailPath(id), { method: 'DELETE' });
}

export function getTemplateItems(id: number, signal?: AbortSignal): Promise<TemplateItem[]> {
  return apiFetch<unknown>(itemsPath(id), { signal }).then((data) => extractResults<TemplateItem>(data));
}

export function templateItemsQueryOptions(id: number) {
  return queryOptions({
    queryKey: taskTemplateKeys.items(id),
    queryFn: ({ signal }) => getTemplateItems(id, signal),
    staleTime: 0,
  });
}

export function addTemplateItem(templateId: number, data: TemplateItemInput): Promise<TemplateItem> {
  return apiFetch<TemplateItem>(itemsPath(templateId), { method: 'POST', body: data });
}

export function updateTemplateItem(templateId: number, itemId: number, data: TemplateItemInput): Promise<TemplateItem> {
  return apiFetch<TemplateItem>(`${itemsPath(templateId)}${itemId}/`, { method: 'PATCH', body: data });
}

export function removeTemplateItem(templateId: number, itemId: number): Promise<void> {
  return apiFetch<void>(`${itemsPath(templateId)}${itemId}/`, { method: 'DELETE' });
}

export function addTemplateItemChild(templateId: number, itemId: number, data: TemplateItemInput): Promise<TemplateItem> {
  return apiFetch<TemplateItem>(`${itemsPath(templateId)}${itemId}/children/`, { method: 'POST', body: data });
}

function choices(path: string, fallback: ChoiceOption[], signal?: AbortSignal): Promise<ChoiceOption[]> {
  return apiFetch<unknown>(path, { signal }).then((data) => {
    const list = extractResults<ChoiceOption>(data);
    return list.length ? list : fallback;
  });
}

/** Choices are enums on the backend; the static lists stand in when the call fails. */
export function departmentChoicesQueryOptions() {
  return queryOptions({
    queryKey: taskTemplateKeys.departments,
    queryFn: ({ signal }) => choices(`${BASE}department_choices/`, DEPARTMENT_OPTIONS, signal),
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export function taskTypeChoicesQueryOptions() {
  return queryOptions({
    queryKey: taskTemplateKeys.taskTypes,
    queryFn: ({ signal }) => choices(`${BASE}task_type_choices/`, TASK_TYPE_OPTIONS, signal),
    staleTime: 5 * 60_000,
    retry: false,
  });
}

/**
 * The legacy item calls threw JSON.stringify(body); the page showed every
 * value of it joined with ', ', else the fallback.
 */
export function taskTemplateErrorMessage(error: unknown, fallback: string): string {
  if (isApiError(error) && error.data && typeof error.data === 'object' && !Array.isArray(error.data)) {
    const messages = Object.values(error.data as Record<string, unknown>)
      .flat()
      .filter((v) => v !== null && v !== undefined && v !== '')
      .map(String);
    return messages.join(', ') || fallback;
  }
  return fallback;
}
