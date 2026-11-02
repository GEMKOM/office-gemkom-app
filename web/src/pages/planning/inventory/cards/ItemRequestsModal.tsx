import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import {
  itemErrorMessage,
  itemRequestsQueryOptions,
  type Item,
  type ItemRequest,
  type ItemRequestsKind,
} from '@/api/procurement/items';
import { DataTable, DetailModal, notify } from '@/ui';
import { planningRequestColumns, purchaseRequestColumns } from './columns';

const KINDS = {
  purchase: {
    title: 'Satın Alma Talepleri',
    icon: 'fas fa-shopping-cart',
    columns: purchaseRequestColumns,
    emptyMessage: 'Satın alma talebi bulunmamaktadır',
    loadError: 'Satın alma talepleri yüklenirken hata oluştu',
  },
  planning: {
    title: 'Planlama Talepleri',
    icon: 'fas fa-calendar-alt',
    columns: planningRequestColumns,
    emptyMessage: 'Planlama talebi bulunmamaktadır',
    loadError: 'Planlama talepleri yüklenirken hata oluştu',
  },
} as const;

const EMPTY: ItemRequest[] = [];

export interface ItemRequestsModalProps {
  item: Item;
  kind: ItemRequestsKind;
  onClose: () => void;
}

/**
 * Port of showPurchaseRequests / showPlanningRequests in cards.js: the item's
 * requests in a client-paged, client-sorted table (20 a page).
 */
export function ItemRequestsModal({ item, kind, onClose }: ItemRequestsModalProps) {
  const config = KINDS[kind];
  // Legacy fetched again every time the modal opened.
  const requests = useQuery({
    ...itemRequestsQueryOptions(item.id, kind),
    staleTime: 0,
    gcTime: 0,
  });

  useEffect(() => {
    if (!requests.isError) return;
    console.error(`Error loading ${kind} requests:`, requests.error);
    notify.error(`${config.loadError}: ${itemErrorMessage(requests.error, config.loadError)}`);
    onClose();
  }, [requests.isError, requests.error, kind, config.loadError, onClose]);

  return (
    <DetailModal
      opened
      onClose={onClose}
      title={`${config.title} - ${item.name || item.code}`}
      icon={config.icon}
      size="xl"
      loading={requests.isPending}
      sections={[
        {
          title: config.title,
          icon: config.icon,
          content: (
            <DataTable
              data={requests.data ?? EMPTY}
              columns={config.columns}
              getRowId={(row, index) => String(row.id ?? index)}
              loading={requests.isPending}
              pagination={{ pageSize: 20 }}
              emptyMessage={config.emptyMessage}
            />
          ),
        },
      ]}
    />
  );
}
