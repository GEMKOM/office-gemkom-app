import { Button, Grid, Modal, NativeSelect, NumberInput, Textarea, TextInput } from '@mantine/core';
import { useState } from 'react';
import { ModalBody, ModalFooter, ModalHeader, modalClassNames } from '@/ui';
import { itemFromDraft, UNIT_CHOICES, validateNewItem, type ItemDraft, type PrItem } from '../model';
import { notifyLines } from '../notifyLines';

// itemsManager.showItemModal / saveItem ("Malzeme Ekle").

const EMPTY: ItemDraft = {
  code: '',
  name: '',
  job_no: '',
  quantity: 0,
  unit: '',
  item_description: '',
  specifications: '',
};

export function ItemModal({ onClose, onAdd }: { onClose: () => void; onAdd: (item: PrItem) => void }) {
  const [draft, setDraft] = useState<ItemDraft>(EMPTY);
  const set = <K extends keyof ItemDraft>(key: K, value: ItemDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const save = () => {
    const errors = validateNewItem(draft);
    if (errors.length) {
      notifyLines.error(`Lütfen aşağıdaki hataları düzeltin:\n${errors.join('\n')}`);
      return;
    }
    onAdd(itemFromDraft(draft));
    onClose();
  };

  return (
    <Modal opened onClose={onClose} size="lg" withCloseButton={false} classNames={modalClassNames} padding={0}>
      <ModalHeader title="Malzeme Ekle" icon="fas fa-box" />
      <ModalBody>
        <Grid>
          <Grid.Col span={{ base: 12, md: 4 }}>
            <TextInput label="Malzeme Kodu" required value={draft.code} onChange={(e) => set('code', e.currentTarget.value)} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 4 }}>
            <TextInput label="Malzeme Adı" value={draft.name} onChange={(e) => set('name', e.currentTarget.value)} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 4 }}>
            <TextInput
              label="İş No"
              placeholder="SRM. KODU"
              value={draft.job_no}
              onChange={(e) => set('job_no', e.currentTarget.value)}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 6 }}>
            <NumberInput
              label="Miktar"
              step={0.01}
              decimalSeparator=","
              value={draft.quantity || ''}
              onChange={(v) => set('quantity', typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.')) || 0)}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 6 }}>
            <NativeSelect
              label="Birim"
              value={draft.unit}
              onChange={(e) => set('unit', e.currentTarget.value)}
              data={[{ value: '', label: 'Birim Seçin' }, ...UNIT_CHOICES]}
            />
          </Grid.Col>
          <Grid.Col span={12}>
            <Textarea
              label="Malzeme Açıklaması"
              rows={2}
              placeholder="Malzeme açıklamasını buraya yazın..."
              value={draft.item_description}
              onChange={(e) => set('item_description', e.currentTarget.value)}
            />
          </Grid.Col>
          <Grid.Col span={12}>
            <Textarea
              label="Teknik Özellikler"
              rows={3}
              placeholder="Teknik özellikleri buraya yazın..."
              value={draft.specifications}
              onChange={(e) => set('specifications', e.currentTarget.value)}
            />
          </Grid.Col>
        </Grid>
      </ModalBody>
      <ModalFooter>
        <Button variant="default" onClick={onClose}>
          İptal
        </Button>
        <Button onClick={save}>Kaydet</Button>
      </ModalFooter>
    </Modal>
  );
}
