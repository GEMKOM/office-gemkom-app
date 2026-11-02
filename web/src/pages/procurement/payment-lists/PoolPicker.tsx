import { Button, Modal, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { addPaymentListItems, paymentPoolQueryOptions, type PoolRow } from '@/api/procurement/paymentLists';
import { DataTable, FaIcon, FilterBar, ModalBody, ModalFooter, ModalHeader, modalClassNames, notify } from '@/ui';
import { fmtEur, rowEur } from './format';
import { useInvalidatePayments } from './modals';
import { excelColumns, POOL_FILTER_DEFAULTS, poolParams, poolRowId, usePoolFilterConfig, type PoolFilterValues } from './poolShared';
import { nextSelection } from './PoolView';

const columns = excelColumns<PoolRow>({ withListed: true });
const EMPTY_FILTERS: PoolFilterValues = { ...POOL_FILTER_DEFAULTS, basis: '' };
const isRowSelectable = (row: PoolRow) => !row.open_list;

interface PoolPickerProps {
  listId: number;
  onClose: () => void;
}

/**
 * "Havuzdan Kalem Ekle": the pool in a fullscreen modal, rows already on a
 * list hidden, a selection that survives paging.
 */
export function PoolPicker({ listId, onClose }: PoolPickerProps) {
  const invalidate = useInvalidatePayments();
  const filterConfig = usePoolFilterConfig({ forceHideListed: true });
  const [filters, setFilters] = useState<PoolFilterValues>(POOL_FILTER_DEFAULTS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [selection, setSelection] = useState<Map<string, PoolRow>>(new Map());
  const [adding, setAdding] = useState(false);

  const pool = useQuery(paymentPoolQueryOptions(poolParams(filters, { page, pageSize, forceHideListed: true })));
  useEffect(() => {
    if (pool.isError) notify.error(pool.error, { fallback: 'Havuz yüklenemedi' });
  }, [pool.isError, pool.error, pool.errorUpdatedAt]);
  const rows = pool.isError ? [] : (pool.data?.results ?? []);
  const total = pool.isError ? 0 : (pool.data?.count ?? 0);

  const picked = [...selection.values()];
  const add = async () => {
    const ids = picked.map((r) => r.schedule_id);
    if (!ids.length) return;
    setAdding(true);
    try {
      await addPaymentListItems(listId, ids);
      notify.success(`${ids.length} kalem eklendi`);
      onClose();
      void invalidate();
    } catch (error) {
      notify.error(error, { fallback: 'Kalemler eklenemedi' });
      setAdding(false);
    }
  };

  return (
    <Modal
      opened
      onClose={onClose}
      fullScreen
      closeOnClickOutside={false}
      closeOnEscape={false}
      withCloseButton={false}
      classNames={modalClassNames}
    >
      <ModalHeader title="Havuzdan Kalem Ekle" icon="fas fa-water" />
      <ModalBody>
        <DataTable
          filters={
            <FilterBar
              inline
              filters={filterConfig}
              values={filters}
              onApply={(next) => {
                setFilters(next);
                setPage(1);
              }}
              onClear={() => {
                setFilters(EMPTY_FILTERS);
                setPage(1);
              }}
            />
          }
          data={rows}
          columns={columns}
          getRowId={poolRowId}
          loading={pool.isFetching}
          selection={{
            selectedIds: [...selection.keys()],
            onChange: (ids) => setSelection((prev) => nextSelection(prev, ids, rows)),
            isRowSelectable,
          }}
          pagination={{
            page,
            pageSize,
            total,
            onPageChange: setPage,
            onPageSizeChange: (size) => {
              setPageSize(size);
              setPage(1);
            },
          }}
          stickyHeader
          verticalSpacing="xs"
          emptyMessage="Havuzda bekleyen taksit yok."
        />
      </ModalBody>
      <ModalFooter>
        <Text c="dimmed" mr="auto" data-testid="picker-count">
          {picked.length
            ? `${picked.length} kalem seçildi · toplam ${fmtEur(picked.reduce((s, r) => s + (rowEur(r) || 0), 0))}`
            : '0 kalem seçildi'}
        </Text>
        <Button variant="default" onClick={onClose} leftSection={<FaIcon icon="fas fa-times" />}>
          İptal
        </Button>
        <Button
          disabled={picked.length === 0}
          loading={adding}
          leftSection={<FaIcon icon="fas fa-plus" />}
          onClick={() => void add()}
        >
          Seçilenleri Ekle
        </Button>
      </ModalFooter>
    </Modal>
  );
}
