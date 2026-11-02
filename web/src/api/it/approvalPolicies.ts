import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../client';
import { extractResults } from '../types';
import { organizationErrorMessage } from './organizationGroups';

/** Port of the policy, stage and subject-type calls in apis/approvals.js. */

export interface ApprovalUser {
  id?: number;
  full_name?: string;
  username?: string;
}

export interface ApprovalStage {
  id: number;
  name: string;
  order: number;
  required_approvals: number;
  climb_levels?: number | null;
  role_user_group?: number | null;
  role_user_group_name?: string | null;
  approver_users?: number[];
  approver_users_detail?: ApprovalUser[];
  [key: string]: unknown;
}

export interface ApprovalPolicy {
  id: number;
  name: string;
  subject_type?: string | null;
  is_active?: boolean;
  selection_priority?: number | null;
  min_amount_eur?: string | number | null;
  max_amount_eur?: string | number | null;
  is_rolling_mill?: boolean;
  stages?: ApprovalStage[];
  live_workflow_count?: number | null;
  total_workflow_count?: number | null;
  climb_levels?: number | null;
  [key: string]: unknown;
}

export interface PolicyInput {
  name: string;
  subject_type: string | null;
  is_active: boolean;
  selection_priority: number;
  min_amount_eur: number | null;
  max_amount_eur: number | null;
}

export interface StageInput {
  name: string;
  order: number;
  required_approvals: number;
  approver_users: number[];
  climb_levels: number | null;
  role_user_group: number | null;
}

export interface SubjectType {
  value: string;
  label: string;
}

export interface UserGroupOption {
  id: number | string;
  name?: string;
  display_name?: string;
  [key: string]: unknown;
}

export const approvalKeys = {
  all: ['approvalPolicies'] as const,
  list: () => ['approvalPolicies', 'list'] as const,
  detail: (id: number) => ['approvalPolicies', 'detail', id] as const,
  subjectTypes: () => ['approvalSubjectTypes'] as const,
  userGroups: () => ['organizationGroups', 'approvalOptions'] as const,
};

/** Legacy parseJsonOrThrow: detail / message / error, else the call's message. */
async function withMessage<T>(request: Promise<T>, fallback: string): Promise<T> {
  try {
    return await request;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new Error(organizationErrorMessage(error, fallback), { cause: error });
  }
}

export function approvalPoliciesQueryOptions() {
  return queryOptions({
    queryKey: approvalKeys.list(),
    queryFn: async ({ signal }) =>
      extractResults<ApprovalPolicy>(
        await withMessage(
          apiFetch<unknown>('/approvals/policies/', { signal }),
          'Politikalar yüklenemedi.',
        ),
      ),
  });
}

export function useApprovalPolicy(id: number | null) {
  return useQuery({
    queryKey: approvalKeys.detail(id ?? 0),
    queryFn: ({ signal }) =>
      withMessage(
        apiFetch<ApprovalPolicy>(`/approvals/policies/${id}/`, { signal }),
        'Politika yüklenemedi.',
      ),
    enabled: id !== null,
  });
}

/** `/approvals/subject-types/`, raw rows (value + Turkish label). */
export function useApprovalSubjectTypes(enabled = true) {
  return useQuery({
    queryKey: approvalKeys.subjectTypes(),
    queryFn: async ({ signal }) =>
      extractResults<Record<string, unknown>>(
        await withMessage(
          apiFetch<unknown>('/approvals/subject-types/', { signal }),
          'Konu türleri yüklenemedi.',
        ),
      ),
    staleTime: 5 * 60_000,
    enabled,
  });
}

/** Port of ensureOrganizationUserGroupsLoaded: groups with an id, for the stage picker. */
export function useApprovalUserGroups() {
  return useQuery({
    queryKey: approvalKeys.userGroups(),
    queryFn: async ({ signal }) => {
      const data = await apiFetch<unknown>('/organization/groups/', {
        params: { page_size: 1000 },
        signal,
      });
      return extractResults<Record<string, unknown>>(data)
        .filter(Boolean)
        .map(
          (group) => ({ ...group, id: group.id ?? group.pk ?? group.group_id }) as UserGroupOption,
        )
        .filter((group) => group.id !== undefined && group.id !== null && group.id !== '');
    },
    staleTime: 5 * 60_000,
  });
}

function useInvalidatePolicies() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: approvalKeys.all });
}

export function useSavePolicy() {
  const invalidate = useInvalidatePolicies();
  return useMutation({
    mutationFn: ({ id, data }: { id: number | null; data: PolicyInput }) =>
      id === null
        ? withMessage(
            apiFetch<ApprovalPolicy>('/approvals/policies/', { method: 'POST', body: data }),
            'Politika oluşturulamadı.',
          )
        : withMessage(
            apiFetch<ApprovalPolicy>(`/approvals/policies/${id}/`, { method: 'PATCH', body: data }),
            'Politika güncellenemedi.',
          ),
    onSuccess: invalidate,
  });
}

export function useDeletePolicy() {
  const invalidate = useInvalidatePolicies();
  return useMutation({
    mutationFn: (id: number) =>
      withMessage(
        apiFetch<void>(`/approvals/policies/${id}/`, { method: 'DELETE' }),
        'Politika silinemedi.',
      ),
    onSuccess: invalidate,
  });
}

export function useSaveStage() {
  const invalidate = useInvalidatePolicies();
  return useMutation({
    mutationFn: ({
      policyId,
      stageId,
      data,
    }: {
      policyId: number;
      stageId: number | null;
      data: StageInput;
    }) =>
      stageId === null
        ? withMessage(
            apiFetch<ApprovalStage>(`/approvals/policies/${policyId}/stages/`, {
              method: 'POST',
              body: data,
            }),
            'Aşama oluşturulamadı.',
          )
        : withMessage(
            apiFetch<ApprovalStage>(`/approvals/stages/${stageId}/`, {
              method: 'PATCH',
              body: data,
            }),
            'Aşama güncellenemedi.',
          ),
    onSuccess: invalidate,
  });
}

export function useDeleteStage() {
  const invalidate = useInvalidatePolicies();
  return useMutation({
    mutationFn: (stageId: number) =>
      withMessage(
        apiFetch<void>(`/approvals/stages/${stageId}/`, { method: 'DELETE' }),
        'Aşama silinemedi.',
      ),
    onSuccess: invalidate,
  });
}
