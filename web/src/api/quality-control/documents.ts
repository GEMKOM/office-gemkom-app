import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, cleanParams } from '../client';
import { toPaginated } from '../types';

// Quality documents from apis/qualityControl.js (list, upload, edit, delete).

/** Mirror of the backend QualityDocument.DOCUMENT_TYPE_CHOICES. */
export const QUALITY_DOCUMENT_TYPE_CHOICES = [
  { value: 'procedure', label: 'Prosedür' },
  { value: 'instruction', label: 'Talimat' },
  { value: 'form', label: 'Form' },
  { value: 'certificate', label: 'Sertifika' },
  { value: 'material_cert', label: 'Malzeme Sertifikası' },
  { value: 'inspection_plan', label: 'Kontrol Planı' },
  { value: 'inspection_report', label: 'Muayene Raporu' },
  { value: 'test_report', label: 'Test Raporu' },
  { value: 'wps', label: 'Kaynak Prosedürü (WPS)' },
  { value: 'drawing', label: 'Çizim' },
  { value: 'other', label: 'Diğer' },
] as const;

/** Computed by the backend: 'expiring' = 30 days or less left. */
export type ExpiryStatus = 'expiring' | 'expired' | 'valid';

export interface QualityDocument {
  id: number;
  title?: string;
  document_type?: string;
  document_number?: string;
  revision?: string;
  description?: string;
  job_order?: string | null;
  job_order_no?: string | null;
  valid_until?: string | null;
  is_active?: boolean;
  expiry_status?: ExpiryStatus | null;
  days_until_expiry?: number | null;
  uploaded_by_name?: string;
  created_at?: string;
  url?: string | null;
}

export interface QualityDocumentsParams {
  document_type?: string;
  expiry_status?: string;
  search?: string;
  ordering?: string;
  page?: number;
  page_size?: number;
}

/** What the form sends; null clears valid_until / job_order (JSON only, as legacy). */
export interface QualityDocumentMeta {
  title: string;
  document_type: string;
  document_number: string;
  revision: string;
  description: string;
  valid_until: string | null;
  job_order: string | null;
}

export const qualityDocumentKeys = {
  all: ['qualityDocuments'] as const,
  list: (params: QualityDocumentsParams) =>
    ['qualityDocuments', 'list', cleanParams({ ...params })] as const,
};

export function qualityDocumentsQueryOptions(params: QualityDocumentsParams) {
  return queryOptions({
    queryKey: qualityDocumentKeys.list(params),
    queryFn: async ({ signal }) =>
      toPaginated<QualityDocument>(
        await apiFetch<unknown>('/quality-control/documents/', { params: { ...params }, signal }),
      ),
    staleTime: 30_000,
  });
}

/** How many active documents have this expiry status, from a one-row page (legacy banner). */
export function qualityDocumentExpiryCountQueryOptions(status: 'expiring' | 'expired') {
  return queryOptions({
    ...qualityDocumentsQueryOptions({
      expiry_status: status,
      ordering: 'valid_until',
      page: 1,
      page_size: 1,
    }),
    select: (page) => page.count,
  });
}

function formData(file: File, meta: object, keep: (value: unknown) => boolean): FormData {
  const data = new FormData();
  data.append('file', file);
  for (const [key, value] of Object.entries(meta)) {
    if (keep(value)) data.append(key, String(value));
  }
  return data;
}

const isPresent = (value: unknown) => value !== null && value !== undefined;

/** createQualityDocument: multipart, empty and null fields left out. */
export function useCreateQualityDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ file, meta }: { file: File; meta: QualityDocumentMeta }) =>
      apiFetch<QualityDocument>('/quality-control/documents/', {
        method: 'POST',
        body: formData(file, meta, (v) => isPresent(v) && v !== ''),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qualityDocumentKeys.all }),
  });
}

/**
 * updateQualityDocument: JSON PATCH, or multipart when a new file is picked
 * (then null fields are left out, as legacy did).
 */
export function useUpdateQualityDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      meta,
      file,
    }: {
      id: number;
      meta: QualityDocumentMeta;
      file?: File | null;
    }) =>
      apiFetch<QualityDocument>(`/quality-control/documents/${id}/`, {
        method: 'PATCH',
        body: file ? formData(file, meta, isPresent) : meta,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qualityDocumentKeys.all }),
  });
}

export function useDeleteQualityDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiFetch<void>(`/quality-control/documents/${id}/`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qualityDocumentKeys.all }),
  });
}
