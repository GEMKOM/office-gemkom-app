import { Alert, Button, Group, Modal, Table, Text, TextInput } from '@mantine/core';
import { useRef, useState, type KeyboardEvent } from 'react';
import { formatNumber } from '@/lib/format';
import { ModalBody, ModalFooter, ModalHeader, modalClassNames, notify } from '@/ui';
import { CURRENCY_SYMBOLS } from '../../shared/comparison';
import { buildOffer, type OfferRow, type PrItem, type PrOffer, type PrSupplier } from '../model';
import { notifyLines } from '../notifyLines';

// suppliersManager.showOfferModal / saveOffer ("Teklif Gir"). Arrow keys move
// between the price, delivery and note inputs like legacy.

const COLS = ['unitPrice', 'deliveryDays', 'notes'] as const;

export function OfferModal({
  supplier,
  items,
  existing,
  onClose,
  onSave,
}: {
  supplier: PrSupplier;
  items: readonly PrItem[];
  existing: Record<string, PrOffer> | undefined;
  onClose: () => void;
  onSave: (offers: Record<string, PrOffer>) => void;
}) {
  const [rows, setRows] = useState<Record<string, OfferRow>>(() =>
    Object.fromEntries(
      items.map((i) => {
        const o = existing?.[i.id];
        return [
          i.id,
          { unitPrice: o?.unitPrice ? String(o.unitPrice) : '', deliveryDays: o?.deliveryDays ? String(o.deliveryDays) : '', notes: o?.notes ?? '' },
        ];
      }),
    ),
  );
  const refs = useRef<Record<string, HTMLInputElement | null>>({});
  const set = (id: string, key: keyof OfferRow, value: string) =>
    setRows((prev) => ({ ...prev, [id]: { ...prev[id]!, [key]: value } }));

  const onKey = (row: number, col: number) => (e: KeyboardEvent<HTMLInputElement>) => {
    let r = row;
    let c = col;
    if (e.key === 'ArrowUp') r--;
    else if (e.key === 'ArrowDown') r++;
    else if (e.key === 'ArrowLeft') c--;
    else if (e.key === 'ArrowRight') c++;
    else return;
    e.preventDefault();
    const target = refs.current[`${r}-${c}`];
    if (target) {
      target.focus();
      target.select();
    }
  };

  const save = () => {
    const result = buildOffer(items, rows);
    if (!result.ok) {
      notify.error(result.error);
      return;
    }
    if (result.warnings.length) notifyLines.warning(`Bazı satırlarda eksik bilgi var:\n${result.warnings.join('\n')}`);
    onSave(result.offers);
    onClose();
  };

  const validity = (value: string, positive: boolean) =>
    value === '' ? undefined : positive ? undefined : true;

  const symbol = CURRENCY_SYMBOLS[supplier.default_currency] ?? '';
  return (
    <Modal
      opened
      onClose={onClose}
      size="95%"
      withCloseButton={false}
      closeOnClickOutside={false}
      closeOnEscape={false}
      classNames={modalClassNames}
      padding={0}
    >
      <ModalHeader title="Teklif Girişi" icon="fas fa-dollar-sign" />
      <ModalBody>
        <Group gap="xl" mb="sm">
          <Text size="sm">
            <strong>Tedarikçi:</strong> {supplier.name}
          </Text>
          <Text size="sm">
            <strong>Para Birimi:</strong> {`${symbol} ${supplier.default_currency}`}
          </Text>
        </Group>
        <Alert color="blue" p="xs" mb="sm">
          <strong>Bilgi:</strong> En az bir malzeme için hem birim fiyat hem de teslimat süresi girilmelidir. * işaretli
          alanlar zorunludur.
        </Alert>
        <Table fz="sm" verticalSpacing={4} data-testid="offer-table">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Malzeme</Table.Th>
              <Table.Th>İş No</Table.Th>
              <Table.Th>Miktar</Table.Th>
              <Table.Th>Birim</Table.Th>
              <Table.Th>Birim Fiyat *</Table.Th>
              <Table.Th>Teslimat Süresi *</Table.Th>
              <Table.Th>Notlar</Table.Th>
              <Table.Th>Toplam Fiyat</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {items.map((item, r) => {
              const row = rows[item.id]!;
              const price = parseFloat(row.unitPrice as string) || 0;
              const days = Number.parseInt(row.deliveryDays as string, 10) || 0;
              return (
                <Table.Tr key={item.id}>
                  <Table.Td>{item.name}</Table.Td>
                  <Table.Td>{item.job_no || '-'}</Table.Td>
                  <Table.Td>{item.quantity}</Table.Td>
                  <Table.Td>{item.unit}</Table.Td>
                  {COLS.map((key, c) => (
                    <Table.Td key={key}>
                      <TextInput
                        size="xs"
                        ref={(el) => {
                          refs.current[`${r}-${c}`] = el;
                        }}
                        aria-label={`${item.name} ${key === 'unitPrice' ? 'Birim Fiyat' : key === 'deliveryDays' ? 'Teslimat Süresi' : 'Notlar'}`}
                        type={key === 'notes' ? 'text' : 'number'}
                        min={key === 'deliveryDays' ? 1 : 0}
                        step={key === 'unitPrice' ? 0.01 : undefined}
                        placeholder={key === 'deliveryDays' ? 'Gün' : key === 'notes' ? 'Notlar...' : undefined}
                        value={String(row[key])}
                        error={
                          key === 'unitPrice'
                            ? validity(String(row.unitPrice), price > 0)
                            : key === 'deliveryDays'
                              ? validity(String(row.deliveryDays), days > 0)
                              : undefined
                        }
                        onChange={(e) => set(item.id, key, e.currentTarget.value)}
                        onKeyDown={onKey(r, c)}
                      />
                    </Table.Td>
                  ))}
                  <Table.Td>{formatNumber(price * item.quantity, 2)}</Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </ModalBody>
      <ModalFooter>
        <Button variant="default" onClick={onClose}>
          İptal
        </Button>
        <Button onClick={save}>Teklifi Kaydet</Button>
      </ModalFooter>
    </Modal>
  );
}
