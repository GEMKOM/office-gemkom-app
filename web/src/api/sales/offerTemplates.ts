import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../client';
import { extractResults } from '../types';

// Port of the apis/sales/offerTemplates.js calls the Ürün Kataloğu page
// (sales/catalog) and the offers page's catalog panel make. The cost table
// still uses the legacy module.

/** A row of GET /sales/offer-templates/. */
export interface OfferTemplate {
  id: number;
  name: string;
  description?: string | null;
  is_active?: boolean;
  node_count?: number;
  [key: string]: unknown;
}

export interface TemplateNode {
  id: number;
  title: string;
  description?: string | null;
  sequence?: number | null;
  is_active?: boolean;
  parent?: number | null;
  children_count?: number | null;
  children?: TemplateNode[];
  [key: string]: unknown;
}

/** GET /sales/offer-templates/<id>/. */
export interface OfferTemplateDetail extends OfferTemplate {
  root_nodes?: TemplateNode[];
}

export interface TemplateInput {
  name: string;
  description: string;
  is_active: boolean;
}

export interface NodeInput {
  title: string;
  description: string;
  sequence: number;
  is_active: boolean;
  parent?: number | null;
}

const BASE = '/sales/offer-templates';

export const offerTemplateKeys = {
  all: ['sales', 'offerTemplates'] as const,
  list: () => ['sales', 'offerTemplates', 'list'] as const,
  detail: (id: number) => ['sales', 'offerTemplates', 'detail', id] as const,
  children: (templateId: number, nodeId: number) =>
    ['sales', 'offerTemplates', 'detail', templateId, 'children', nodeId] as const,
};

/** listOfferTemplates() with no options, as the catalog page called it. */
export function offerTemplatesQueryOptions() {
  return queryOptions({
    queryKey: offerTemplateKeys.list(),
    queryFn: async ({ signal }) => extractResults<OfferTemplate>(await apiFetch<unknown>(`${BASE}/`, { signal })),
  });
}

export function offerTemplateQueryOptions(id: number) {
  return queryOptions({
    queryKey: offerTemplateKeys.detail(id),
    queryFn: ({ signal }) => apiFetch<OfferTemplateDetail>(`${BASE}/${id}/`, { signal }),
  });
}

/** A node's children: a plain list, a DRF page, `data` or `children` (legacy extractNodeList). */
export function nodeChildrenQueryOptions(templateId: number, nodeId: number) {
  return queryOptions({
    queryKey: offerTemplateKeys.children(templateId, nodeId),
    queryFn: async ({ signal }) => {
      const data = await apiFetch<unknown>(`${BASE}/${templateId}/nodes/${nodeId}/`, { signal });
      if (Array.isArray(data)) return data as TemplateNode[];
      if (!data || typeof data !== 'object') return [];
      const body = data as { results?: unknown; data?: unknown; children?: unknown };
      const list = body.results ?? body.data ?? body.children;
      return Array.isArray(list) ? (list as TemplateNode[]) : [];
    },
  });
}

/** A template's root nodes (GET <id>/nodes/), the offers page's catalog panel. */
export function templateRootNodesQueryOptions(templateId: number) {
  return queryOptions({
    queryKey: [...offerTemplateKeys.detail(templateId), 'roots'] as const,
    queryFn: async ({ signal }) =>
      extractResults<TemplateNode>(await apiFetch<unknown>(`${BASE}/${templateId}/nodes/`, { signal })),
  });
}

/** A node found by GET nodes/search/?q=: where it sits, and its template. */
export interface TemplateNodeHit extends TemplateNode {
  breadcrumb?: string[];
  template?: number;
  code?: string;
}

export function searchTemplateNodesQueryOptions(q: string) {
  return queryOptions({
    queryKey: [...offerTemplateKeys.all, 'search', q] as const,
    queryFn: async ({ signal }) =>
      extractResults<TemplateNodeHit>(
        await apiFetch<unknown>(`${BASE}/nodes/search/`, { params: { q }, signal }),
      ),
  });
}

/** Template and node writes; each reloads the list and the open template (with its loaded children). */
export function useOfferTemplateMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: offerTemplateKeys.all });
  return {
    createTemplate: useMutation({
      mutationFn: (data: TemplateInput) => apiFetch<OfferTemplate>(`${BASE}/`, { method: 'POST', body: data }),
      onSuccess: invalidate,
    }),
    patchTemplate: useMutation({
      mutationFn: ({ id, data }: { id: number; data: TemplateInput }) =>
        apiFetch<OfferTemplate>(`${BASE}/${id}/`, { method: 'PATCH', body: data }),
      onSuccess: invalidate,
    }),
    createNode: useMutation({
      mutationFn: ({ templateId, data }: { templateId: number; data: NodeInput }) =>
        apiFetch<TemplateNode>(`${BASE}/${templateId}/nodes/`, { method: 'POST', body: data }),
      onSuccess: invalidate,
    }),
    patchNode: useMutation({
      mutationFn: ({ templateId, nodeId, data }: { templateId: number; nodeId: number; data: NodeInput }) =>
        apiFetch<TemplateNode>(`${BASE}/${templateId}/nodes/${nodeId}/`, { method: 'PATCH', body: data }),
      onSuccess: invalidate,
    }),
    deleteNode: useMutation({
      mutationFn: ({ templateId, nodeId }: { templateId: number; nodeId: number }) =>
        apiFetch<void>(`${BASE}/${templateId}/nodes/${nodeId}/`, { method: 'DELETE' }),
      onSuccess: invalidate,
    }),
  };
}
