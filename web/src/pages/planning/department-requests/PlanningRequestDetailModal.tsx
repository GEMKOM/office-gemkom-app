import { Badge, Box, Button, Group, Stack, Table, Text, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  markReadyForProcurement,
  planningRequestKeys,
  type PlanningRequest,
  type PurchaseRequestInfo,
} from '@/api/planning/planningRequests';
import {
  DetailModal,
  errorMessage,
  FaIcon,
  FileAttachments,
  FormModal,
  notify,
  StatusBadge,
  type DetailSection,
} from '@/ui';
import { NeoAskButton } from '@/neo';
import { PlanningStatusBadge, PriorityBadge } from './columns';
import { toAttachmentFiles } from './DepartmentRequestDetailModal';
import { downloadItemsCsv } from './exportCsv';
import { formatQuantity, purchaseRequestFamily } from './logic';

function PurchaseRequests({ info }: { info: PurchaseRequestInfo[] | null | undefined }) {
  if (!info || info.length === 0) return <>-</>;
  return (
    <Group gap={4}>
      {info.map((pr, index) => (
        <StatusBadge key={index} color={purchaseRequestFamily(pr.status)}>
          {pr.request_number || '-'}
        </StatusBadge>
      ))}
    </Group>
  );
}

function ItemsTable({ request }: { request: PlanningRequest }) {
  return (
    <Table.ScrollContainer minWidth={1200}>
      <Table striped withTableBorder verticalSpacing={6} fz="sm">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>#</Table.Th>
            <Table.Th style={{ minWidth: 200, whiteSpace: 'nowrap' }}>Ürün Kodu</Table.Th>
            <Table.Th>Ürün Adı</Table.Th>
            <Table.Th>Ürün Açıklaması</Table.Th>
            <Table.Th>İş No</Table.Th>
            <Table.Th>Envanterden</Table.Th>
            <Table.Th>Satın Alınacak</Table.Th>
            <Table.Th>Birim</Table.Th>
            <Table.Th>Öncelik</Table.Th>
            <Table.Th>Özellikler</Table.Th>
            <Table.Th>Satın Alma Talebi</Table.Th>
            <Table.Th>Dosyalar</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {(request.items ?? []).map((item, index) => {
            const files = item.files?.length ?? 0;
            return (
              <Table.Tr key={item.id ?? index}>
                <Table.Td>{index + 1}</Table.Td>
                <Table.Td fw={700} style={{ whiteSpace: 'nowrap' }}>
                  {item.item_code || '-'}
                </Table.Td>
                <Table.Td>{item.item_name || '-'}</Table.Td>
                <Table.Td>{item.item_description || '-'}</Table.Td>
                <Table.Td>{item.job_no || '-'}</Table.Td>
                <Table.Td>{formatQuantity(item.quantity_from_inventory || 0)}</Table.Td>
                <Table.Td fw={700}>{formatQuantity(item.quantity_to_purchase || 0)}</Table.Td>
                <Table.Td>{item.item_unit || 'adet'}</Table.Td>
                <Table.Td>
                  <PriorityBadge priority={item.priority || 'normal'} />
                </Table.Td>
                <Table.Td>{item.specifications || '-'}</Table.Td>
                <Table.Td>
                  <PurchaseRequests info={item.purchase_request_info} />
                </Table.Td>
                <Table.Td>
                  {files > 0 ? (
                    <Badge color="cyan" variant="light">
                      {files} dosya
                    </Badge>
                  ) : (
                    '-'
                  )}
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}

function ItemFiles({ request }: { request: PlanningRequest }) {
  return (
    <Stack gap="md">
      {(request.items ?? []).map((item, index) =>
        item.files && item.files.length > 0 ? (
          <Box key={item.id ?? index}>
            <Text size="sm" c="dimmed" fw={600} mb={4}>
              <FaIcon icon="fas fa-box" /> {item.item_code || item.item_name || `Ürün ${index + 1}`}
              {item.item_name && item.item_code ? ` - ${item.item_name}` : ''}
            </Text>
            <FileAttachments files={toAttachmentFiles(item.files)} layout="grid" readOnly />
          </Box>
        ) : null,
      )}
    </Stack>
  );
}

/** Legacy showErpCodeModal: the ERP code marks the request ready for procurement. */
function ErpCodeModal({
  request,
  onClose,
  onDone,
}: {
  request: PlanningRequest;
  onClose: () => void;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const form = useForm({
    initialValues: { erp_code: request.erp_code || '' },
    validate: { erp_code: (value) => (value.trim() ? null : 'ERP kodu gereklidir') },
  });
  const mark = useMutation({
    mutationFn: (code: string) => markReadyForProcurement(request.id, code),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: planningRequestKeys.all }),
  });
  return (
    <FormModal
      opened
      onClose={onClose}
      title="ERP Kodu Gir"
      icon="fas fa-code"
      size="md"
      submitLabel="Kaydet"
      submitting={mark.isPending}
      onSubmit={form.onSubmit(async ({ erp_code }) => {
        try {
          await mark.mutateAsync(erp_code);
          notify.success('Planlama talebi satın alma için hazır olarak işaretlendi');
          onDone();
        } catch (error) {
          notify.error(errorMessage(error));
        }
      })}
    >
      <TextInput
        label="ERP Kodu"
        placeholder="ERP sistem kodunu girin"
        description="Planlama talebini satın alma için hazır olarak işaretlemek için ERP kodu gereklidir."
        withAsterisk
        data-autofocus
        {...form.getInputProps('erp_code')}
      />
    </FormModal>
  );
}

export interface PlanningRequestDetailModalProps {
  request: PlanningRequest | undefined;
  loading: boolean;
  onClose: () => void;
}

/** Port of showPlanningRequestDetailsModal (department-requests.js). */
export function PlanningRequestDetailModal({
  request: r,
  loading,
  onClose,
}: PlanningRequestDetailModalProps) {
  const [erpOpen, setErpOpen] = useState(false);
  const items = r?.items ?? [];
  const sections: DetailSection[] = r
    ? [
        {
          title: 'Genel Bilgiler',
          icon: 'fas fa-info-circle',
          fields: [
            { label: 'Talep No', value: `#${r.id}`, span: 6 },
            {
              label: 'Talep Numarası',
              value: r.request_number,
              span: 6,
              hidden: !r.request_number,
            },
            {
              label: 'Oluşturan',
              value: r.created_by_full_name || r.created_by_username || 'Bilinmiyor',
              span: 6,
            },
            { label: 'Durum', render: <PlanningStatusBadge row={r} />, span: 6 },
            { label: 'Oluşturulma', value: r.created_at, type: 'datetime', span: 6 },
            { label: 'Son Güncelleme', value: r.updated_at, type: 'datetime', span: 6 },
            {
              label: 'Hazır Olma Tarihi',
              value: r.ready_at,
              type: 'datetime',
              span: 6,
              hidden: !r.ready_at,
            },
            {
              label: 'Dönüştürülme Tarihi',
              value: r.converted_at,
              type: 'datetime',
              span: 6,
              hidden: !r.converted_at,
            },
            {
              label: 'Departman Talebi',
              value: `#${r.department_request}`,
              span: 6,
              hidden: !r.department_request,
            },
          ],
        },
        {
          title: 'Talep Bilgileri',
          icon: 'fas fa-clipboard-list',
          fields: [
            { label: 'Başlık', value: r.title, span: 12, hidden: !r.title },
            {
              label: 'Açıklama',
              render: (
                <Text size="sm" style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}>
                  {r.description || '-'}
                </Text>
              ),
              span: 12,
            },
            { label: 'Öncelik', render: <PriorityBadge priority={r.priority} />, span: 6 },
            { label: 'İhtiyaç Tarihi', value: r.needed_date, type: 'date', span: 6 },
            { label: 'Ürün Sayısı', value: `${items.length} ürün`, span: 6 },
          ],
        },
        {
          title: 'Talep Edilen Ürünler',
          icon: 'fas fa-boxes',
          hidden: items.length === 0,
          content: <ItemsTable request={r} />,
        },
        {
          title: 'Talep Dosyaları',
          icon: 'fas fa-paperclip',
          hidden: !r.files || r.files.length === 0,
          content: (
            <FileAttachments
              title="Ekler"
              files={toAttachmentFiles(r.files)}
              layout="grid"
              readOnly
            />
          ),
        },
        {
          title: 'Ürün Dosyaları',
          icon: 'fas fa-file-alt',
          hidden: !items.some((item) => item.files && item.files.length > 0),
          content: <ItemFiles request={r} />,
        },
      ]
    : [];

  return (
    <>
      <DetailModal
        opened
        onClose={onClose}
        title="Planlama Talebi Detayları"
        subtitle={r?.request_number || r?.title || undefined}
        icon="fas fa-clipboard-list"
        size="xl"
        loading={loading}
        sections={sections}
        headerActions={
          <NeoAskButton
            page={
              r?.request_number
                ? {
                    type: 'planning_request',
                    id: String(r.request_number),
                    label: r.title ? String(r.title) : undefined,
                  }
                : null
            }
          />
        }
        footerActions={
          r ? (
            <>
              {r.status === 'pending_erp_entry' ? (
                <Button
                  leftSection={<FaIcon icon="fas fa-check-circle" />}
                  onClick={() => setErpOpen(true)}
                >
                  Satın Alma İçin Hazır İşaretle
                </Button>
              ) : null}
              {items.length > 0 ? (
                <Button
                  color="green"
                  leftSection={<FaIcon icon="fas fa-file-csv" />}
                  onClick={() => downloadItemsCsv(items, r.needed_date)}
                >
                  CSV Dışa Aktar
                </Button>
              ) : null}
            </>
          ) : null
        }
      />
      {erpOpen && r ? (
        <ErpCodeModal
          request={r}
          onClose={() => setErpOpen(false)}
          onDone={() => {
            setErpOpen(false);
            onClose();
          }}
        />
      ) : null}
    </>
  );
}
