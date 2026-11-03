import { Alert, Badge, Button, Checkbox, Modal, Stack, Table, Text } from '@mantine/core';
import { useState } from 'react';
import { ModalBody, ModalFooter, ModalHeader, modalClassNames } from '@/ui';
import { jobTotals, mergeGroups, mergeSelection, type PrItem } from '../model';
import { notifyLines } from '../notifyLines';

// itemsManager.mergeDuplicateItems / confirmMergeItems ("Birleştir").

const truncate = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}...` : text);

export function MergeModal({
  items,
  onClose,
  onMerge,
}: {
  items: readonly PrItem[];
  onClose: () => void;
  onMerge: (merges: { item: PrItem; sources: PrItem[] }[], summary: string) => void;
}) {
  const [groups] = useState(() => mergeGroups(items));
  const [selected, setSelected] = useState<ReadonlySet<string>>(
    () =>
      new Set(groups.filter((g) => g.sameName && g.sameUnit && !g.cannotMerge).flatMap((g) => g.items.map((i) => i.id))),
  );
  const toggle = (ids: string[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });

  const confirmMerge = () => {
    const merges: { item: PrItem; sources: PrItem[] }[] = [];
    const lines: string[] = [];
    for (const g of groups) {
      const picked = g.items.filter((i) => selected.has(i.id));
      if (picked.length < 2) continue;
      const outcome = mergeSelection(g.code, picked);
      if (outcome.kind !== 'merged') {
        notifyLines.error(outcome.message);
        continue;
      }
      merges.push(outcome);
      lines.push(
        `• ${g.code}: ${picked.length} seçili satır → 1 satır (${outcome.item.allocations?.length ?? 0} iş no, ${outcome.item.quantity} ${outcome.item.unit})`,
      );
    }
    if (!merges.length) return;
    onMerge(merges, `${merges.length} malzeme grubu başarıyla birleştirildi:\n\n${lines.join('\n')}\n`);
  };

  return (
    <Modal opened onClose={onClose} size="xl" withCloseButton={false} classNames={modalClassNames} padding={0}>
      <ModalHeader title="Malzeme Birleştirme Onayı" icon="fas fa-object-group" />
      <ModalBody>
        <Stack gap="md">
          <Alert color="blue" p="xs">
            <strong>{groups.length} kod</strong> için birden fazla malzeme bulundu. Birleştirmek istediğiniz grupları ve
            öğeleri seçebilirsiniz.
          </Alert>
          {groups.map((g, gi) => {
            const mergeable = g.sameName && g.sameUnit && !g.cannotMerge;
            const picked = g.items.filter((i) => selected.has(i.id));
            const totals = jobTotals(picked);
            const total = totals.reduce((s, t) => s + t.quantity, 0);
            const unit = g.items[0]!.unit;
            return (
              <div key={gi} style={{ border: '1px solid var(--gk-line)', borderRadius: 8, padding: 12 }} data-testid="merge-group">
                <Text fw={600} mb={4}>
                  Kod: <strong>{g.code}</strong>{' '}
                  <Badge size="sm" color="gray">{`${g.items.length} adet`}</Badge>
                </Text>
                <Checkbox
                  label="Bu grubu birleştir"
                  disabled={!mergeable}
                  checked={mergeable && picked.length === g.items.length}
                  indeterminate={picked.length > 0 && picked.length < g.items.length}
                  onChange={(e) => toggle(g.items.map((i) => i.id), e.currentTarget.checked)}
                  mb="xs"
                />
                {!g.sameName || !g.sameUnit ? (
                  <Alert color="yellow" p="xs" mb="xs">
                    <strong>Uyarı:</strong> Bu gruptaki malzemeler farklı ad veya birime sahip olduğu için birleştirilemez.
                    {!g.sameName ? <div>• Farklı malzeme adları</div> : null}
                    {!g.sameUnit ? <div>• Farklı birimler</div> : null}
                  </Alert>
                ) : null}
                {g.cannotMerge ? (
                  <Alert color="red" p="xs" mb="xs">
                    <strong>Birleştirilemez:</strong> Bu gruptaki malzemeler aynı kod, ad, iş numarası ve teknik özelliklere
                    sahip olduğu için birleştirilemez.
                    <div>• Aynı malzeme adı: {g.items[0]!.name}</div>
                    <div>• Aynı iş numarası: {g.items[0]!.job_no || 'Belirtilmemiş'}</div>
                    <div>• Aynı teknik özellikler: {g.items[0]!.specs || 'Belirtilmemiş'}</div>
                    <div>
                      <strong>Not:</strong> Eğer bu malzemeler aynıysa ve iş emri de aynıysa farklı bir malzeme girip toplam
                      miktarını güncelleyebilirsiniz.
                    </div>
                  </Alert>
                ) : null}
                {g.distinctSpecs.length > 1 ? (
                  <Alert color="blue" p="xs" mb="xs">
                    <strong>Teknik Özellikler Farklılığı:</strong> Bu gruptaki malzemeler farklı teknik özelliklere sahip.
                    {g.distinctSpecs.map((s, i) => (
                      <div key={i}>{`Özellik ${i + 1}: ${s}`}</div>
                    ))}
                  </Alert>
                ) : null}
                <Table fz="sm" verticalSpacing={4}>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Seç</Table.Th>
                      <Table.Th>#</Table.Th>
                      <Table.Th>Ad</Table.Th>
                      <Table.Th>İş No</Table.Th>
                      <Table.Th>Miktar</Table.Th>
                      <Table.Th>Birim</Table.Th>
                      <Table.Th>Teknik Özellikler</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {g.items.map((item, i) => (
                      <Table.Tr key={item.id}>
                        <Table.Td>
                          <Checkbox
                            aria-label={`${item.code} ${i + 1} seç`}
                            disabled={!mergeable}
                            checked={selected.has(item.id)}
                            onChange={(e) => toggle([item.id], e.currentTarget.checked)}
                          />
                        </Table.Td>
                        <Table.Td>{i + 1}</Table.Td>
                        <Table.Td>{item.name}</Table.Td>
                        <Table.Td>{item.job_no || '-'}</Table.Td>
                        <Table.Td>{item.quantity}</Table.Td>
                        <Table.Td>{item.unit}</Table.Td>
                        <Table.Td>{item.specs ? truncate(item.specs, 50) : 'Özellik belirtilmemiş'}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
                <Text size="sm" mt={6}>
                  <strong>Birleştirilecek:</strong>{' '}
                  {picked.length === 0
                    ? 'Hiçbir öğe seçilmedi'
                    : `${total} ${unit} toplam - ${totals.map((t) => `${t.quantity} ${unit} (${t.job_no || 'İş No Yok'})`).join(', ')}`}
                </Text>
              </div>
            );
          })}
          <Alert color="yellow" p="xs">
            <strong>Not:</strong> Birleştirme işlemi aynı kod, ad ve birime sahip malzemeler için yapılır. Farklı iş
            numaraları tek bir satırda allocations olarak birleştirilecektir.
          </Alert>
        </Stack>
      </ModalBody>
      <ModalFooter>
        <Button variant="default" onClick={onClose}>
          İptal
        </Button>
        <Button leftSection={<i className="fas fa-object-group" />} onClick={confirmMerge}>
          Seçilenleri Birleştir
        </Button>
      </ModalFooter>
    </Modal>
  );
}
