import { Alert, Badge, Group, Select, Table, Text, Textarea, TextInput } from '@mantine/core';
import { useMemo, useState, type ReactNode } from 'react';
import type { OfferItem } from '@/api/sales/offers';
import { FaIcon, FormModal, ModalSection, notify } from '@/ui';
import {
  buildPasteItems,
  buildPastePrices,
  columnSample,
  guessItemColumnRoles,
  guessPriceColumnRoles,
  itemTitle,
  parsePasteTable,
  setColumnRole,
  type ItemColumnRole,
  type PastedPrice,
  type PasteTable,
  type PriceColumnRole,
} from '../logic';
import css from '../OffersPage.module.css';

/** The pasted text, its table and the role picked for each column (guessed on every new paste). */
function usePasteTable<R extends string>(guess: (rows: string[][], count: number) => R[]) {
  const [text, setText] = useState('');
  const [table, setTable] = useState<PasteTable>({ rows: [], columnCount: 0 });
  const [roles, setRoles] = useState<R[]>([]);
  const onText = (value: string) => {
    setText(value);
    const parsed = parsePasteTable(value);
    setTable(parsed);
    setRoles(parsed.columnCount ? guess(parsed.rows, parsed.columnCount) : []);
  };
  return { text, onText, table, roles, setRoles };
}

function ColumnCards<R extends string>({
  table,
  roles,
  options,
  exclusive,
  onChange,
}: {
  table: PasteTable;
  roles: R[];
  options: { value: R; label: string }[];
  exclusive: readonly R[];
  onChange: (roles: R[]) => void;
}) {
  return (
    <div className={css.columnMap}>
      {Array.from({ length: table.columnCount }, (_, col) => {
        const sample = columnSample(table.rows, col);
        return (
          <div key={col} className={css.columnCard}>
            <Text size="sm" fw={600}>
              Sütun {col + 1}
            </Text>
            <div className={css.columnSample} title={sample}>
              {sample}
            </div>
            <Select
              mt={6}
              size="xs"
              aria-label={`Sütun ${col + 1}`}
              data={options}
              value={roles[col] ?? 'ignore'}
              allowDeselect={false}
              onChange={(value) =>
                value && onChange(setColumnRole(roles, col, value as R, exclusive))
              }
            />
          </div>
        );
      })}
    </div>
  );
}

function PasteBody({
  label,
  placeholder,
  help,
  text,
  onText,
  onSubmitShortcut,
  intro,
  children,
}: {
  label: string;
  placeholder: string;
  help: ReactNode;
  text: string;
  onText: (value: string) => void;
  onSubmitShortcut: () => void;
  intro?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <>
      <ModalSection title={label} icon="fas fa-table">
        {intro}
        <Textarea
          label="Yapıştır"
          placeholder={placeholder}
          description={help}
          rows={6}
          data-autofocus
          classNames={{ input: css.mono }}
          value={text}
          onChange={(e) => onText(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              onSubmitShortcut();
            }
          }}
        />
      </ModalSection>
      {children}
    </>
  );
}

const ITEM_ROLES: { value: ItemColumnRole; label: string }[] = [
  { value: 'ignore', label: 'Yok say' },
  { value: 'title', label: 'Başlık' },
  { value: 'quantity', label: 'Adet' },
];

/** Legacy showPasteSubItemsModal: rows of a pasted table become custom staged items. */
export function PasteItemsModal({
  parentTitle,
  subItems,
  onAdd,
  onClose,
}: {
  parentTitle?: string;
  subItems: boolean;
  onAdd: (rows: { title: string; quantity: number }[]) => number;
  onClose: () => void;
}) {
  const paste = usePasteTable(guessItemColumnRoles);
  const [separator, setSeparator] = useState(' - ');
  const items = useMemo(
    () => buildPasteItems(paste.table.rows, paste.roles, separator),
    [paste.table, paste.roles, separator],
  );
  const titleCols = paste.roles.filter((r) => r === 'title').length;
  const ready = titleCols > 0 && items.length > 0;

  const submit = () => {
    if (!ready) return;
    if (!items.length) {
      notify.warning('Geçerli satır bulunamadı');
      return;
    }
    const count = onAdd(items);
    notify.success(`${count} ${subItems ? 'alt kalem' : 'kalem'} eklendi`);
    onClose();
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title={subItems ? 'Alt Kalemleri Yapıştır' : 'Kalemleri Yapıştır'}
      icon="fas fa-paste"
      size="xl"
      submitLabel="Ekle"
      submitDisabled={!ready}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <PasteBody
        label="Tablo Verisi"
        placeholder="Tablo verisini buraya yapıştırın (sütunlar tab ile ayrılır)..."
        help="Excel veya tablodan kopyalayıp yapıştırın. Sütunları eşleştirin ve önizlemeyi kontrol edin."
        text={paste.text}
        onText={paste.onText}
        onSubmitShortcut={submit}
        intro={
          parentTitle ? (
            <Text size="sm" c="dimmed" mb="xs">
              Üst kalem: <strong>{parentTitle}</strong>
            </Text>
          ) : null
        }
      >
        {paste.table.columnCount ? (
          <ModalSection title="Sütun Eşleştirme" icon="fas fa-columns">
            <ColumnCards
              table={paste.table}
              roles={paste.roles}
              options={ITEM_ROLES}
              exclusive={['quantity']}
              onChange={paste.setRoles}
            />
            {titleCols > 1 ? (
              <TextInput
                mt="sm"
                maw={260}
                size="xs"
                label="Başlık birleştirme ayırıcısı"
                placeholder="Örn: - veya /"
                value={separator}
                onChange={(e) => setSeparator(e.currentTarget.value)}
              />
            ) : null}
            <Preview count={`${items.length} kalem`}>
              {!titleCols ? (
                <Text size="sm" c="yellow.8" p="sm">
                  En az bir sütun &quot;Başlık&quot; olarak seçilmelidir.
                </Text>
              ) : !items.length ? (
                <Text size="sm" c="dimmed" p="sm">
                  Geçerli satır bulunamadı.
                </Text>
              ) : (
                <Table striped withTableBorder fz="sm">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th w={48}>#</Table.Th>
                      <Table.Th>Başlık</Table.Th>
                      <Table.Th w={72}>Adet</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {items.slice(0, 100).map((item, i) => (
                      <Table.Tr key={i}>
                        <Table.Td c="dimmed">{i + 1}</Table.Td>
                        <Table.Td>{item.title}</Table.Td>
                        <Table.Td>{item.quantity}</Table.Td>
                      </Table.Tr>
                    ))}
                    {items.length > 100 ? (
                      <Table.Tr>
                        <Table.Td colSpan={3} ta="center" c="dimmed">
                          … ve {items.length - 100} satır daha
                        </Table.Td>
                      </Table.Tr>
                    ) : null}
                  </Table.Tbody>
                </Table>
              )}
            </Preview>
          </ModalSection>
        ) : null}
      </PasteBody>
    </FormModal>
  );
}

function Preview({ count, children }: { count: string; children: ReactNode }) {
  return (
    <>
      <Group justify="space-between" mt="md" mb={6}>
        <Text size="sm" fw={600}>
          <FaIcon icon="fas fa-eye" /> Önizleme
        </Text>
        <Badge color="gray" variant="light">
          {count}
        </Badge>
      </Group>
      <div className={css.previewTable}>{children}</div>
    </>
  );
}

const PRICE_ROLES: { value: PriceColumnRole; label: string }[] = [
  { value: 'ignore', label: 'Yok say' },
  { value: 'unit_price', label: 'Birim Fiyat' },
  { value: 'weight_kg', label: 'Birim Ağırlık (kg)' },
  { value: 'delivery_period', label: 'Termin' },
  { value: 'notes', label: 'Not' },
];
const PRICE_EXCLUSIVE: PriceColumnRole[] = ['unit_price', 'weight_kg', 'delivery_period', 'notes'];

/** Legacy showPastePricesModal: pasted rows fill the priceable items top to bottom. */
export function PastePricesModal({
  items,
  onApply,
  onClose,
}: {
  /** The priceable items in tree order. */
  items: OfferItem[];
  onApply: (prices: PastedPrice[]) => void;
  onClose: () => void;
}) {
  const paste = usePasteTable(guessPriceColumnRoles);
  const prices = useMemo(
    () => buildPastePrices(paste.table.rows, paste.roles),
    [paste.table, paste.roles],
  );
  const mapped = paste.roles.some((r) => r !== 'ignore');
  const matchCount = Math.min(prices.length, items.length);
  const ready = mapped && matchCount > 0;
  const show = (role: PriceColumnRole) => paste.roles.includes(role);

  const submit = () => {
    if (!ready) return;
    onApply(prices.slice(0, matchCount));
    notify.success(`${matchCount} kaleme fiyat uygulandı`);
    onClose();
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title="Fiyatları Yapıştır"
      icon="fas fa-paste"
      size="xl"
      submitLabel="Uygula"
      submitDisabled={!ready}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <PasteBody
        label="Fiyat Verisi"
        placeholder="Fiyat verisini buraya yapıştırın (sütunlar tab ile ayrılır)..."
        help={`${items.length} fiyatlanabilir kalem mevcut. Her satır sırayla bir kaleme uygulanır.`}
        text={paste.text}
        onText={paste.onText}
        onSubmitShortcut={submit}
        intro={
          <Alert color="blue" variant="light" mb="sm" icon={<FaIcon icon="fas fa-info-circle" />}>
            <strong>{items.length}</strong> kalem fiyatlanabilir. Veriler yukarıdan aşağıya sırayla
            eşleştirilir.
          </Alert>
        }
      >
        {paste.table.columnCount ? (
          <ModalSection title="Sütun Eşleştirme" icon="fas fa-columns">
            <ColumnCards
              table={paste.table}
              roles={paste.roles}
              options={PRICE_ROLES}
              exclusive={PRICE_EXCLUSIVE}
              onChange={paste.setRoles}
            />
            <Preview count={`${matchCount} / ${items.length} kalem`}>
              {!mapped ? (
                <Text size="sm" c="yellow.8" p="sm">
                  En az bir sütun eşleştirilmelidir.
                </Text>
              ) : (
                <Table striped withTableBorder fz="sm">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th w={32}>#</Table.Th>
                      <Table.Th>Kalem</Table.Th>
                      {show('unit_price') ? <Table.Th ta="right">Birim Fiyat</Table.Th> : null}
                      {show('weight_kg') ? <Table.Th ta="right">Ağırlık (kg)</Table.Th> : null}
                      {show('delivery_period') ? <Table.Th>Termin</Table.Th> : null}
                      {show('notes') ? <Table.Th>Not</Table.Th> : null}
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {prices.slice(0, matchCount).map((p, i) => (
                      <Table.Tr key={i}>
                        <Table.Td c="dimmed">{i + 1}</Table.Td>
                        <Table.Td>{items[i] ? itemTitle(items[i]) : ''}</Table.Td>
                        {show('unit_price') ? (
                          <Table.Td ta="right">
                            {p.unit_price !== null ? p.unit_price.toLocaleString('tr-TR') : '—'}
                          </Table.Td>
                        ) : null}
                        {show('weight_kg') ? (
                          <Table.Td ta="right">
                            {p.weight_kg !== null ? p.weight_kg.toLocaleString('tr-TR') : '—'}
                          </Table.Td>
                        ) : null}
                        {show('delivery_period') ? (
                          <Table.Td>{p.delivery_period || '—'}</Table.Td>
                        ) : null}
                        {show('notes') ? <Table.Td>{p.notes || ''}</Table.Td> : null}
                      </Table.Tr>
                    ))}
                    {prices.length < items.length ? (
                      <Table.Tr>
                        <Table.Td colSpan={10} ta="center" c="yellow.8">
                          <FaIcon icon="fas fa-exclamation-triangle" />{' '}
                          {items.length - prices.length} kalem için veri yok — bu kalemler değişmez
                        </Table.Td>
                      </Table.Tr>
                    ) : null}
                  </Table.Tbody>
                </Table>
              )}
            </Preview>
          </ModalSection>
        ) : null}
      </PasteBody>
    </FormModal>
  );
}
