import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Code,
  Group,
  List,
  Modal,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
} from '@mantine/core';
import { useState } from 'react';
import { lookupCardsByCode, type Item } from '@/api/procurement/items';
import {
  FaIcon,
  FileDropInput,
  ModalBody,
  ModalFooter,
  ModalHeader,
  modalClassNames,
  notify,
} from '@/ui';
import {
  detectColumnMapping,
  EXCEL_FIELDS,
  missingRequired,
  parseCsv,
  processRows,
  type ColumnMapping,
  type ImportedItem,
} from './logic';

/** First sheet as rows of cells; CSV through the legacy parser. */
async function readRows(file: File): Promise<unknown[][]> {
  if (file.name.toLowerCase().endsWith('.csv')) return parseCsv(await file.text());
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0] ?? ''];
  return sheet ? XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 }) : [];
}

type Stage =
  | { step: 'pick' }
  | {
      step: 'map';
      headers: unknown[];
      dataRows: unknown[][];
      mapping: ColumnMapping;
      detected: ColumnMapping;
    };

/** Whether a row's code is a stock card: found and active, found but inactive, or none. */
type CardStatus = 'ok' | 'inactive' | 'missing' | 'unchecked';

function cardStatus(code: string, cards: Map<string, Item> | null): CardStatus {
  if (!cards) return 'unchecked';
  const card = cards.get(code.trim());
  if (!card) return 'missing';
  return card.is_active === false ? 'inactive' : 'ok';
}

const STATUS_BADGE: Record<CardStatus, { color: string; label: string; title: string }> = {
  ok: { color: 'green', label: 'Geçerli', title: 'Stok kartı var' },
  inactive: {
    color: 'yellow',
    label: 'Pasif kart',
    title: 'Kart var ama pasif (eski sac/boy/hizmet kartı ya da stoksuz Mikro kodu)',
  },
  missing: {
    color: 'red',
    label: 'Kart yok',
    title: 'Bu kodla stok kartı yok: satır kodsuz aktarılır, kartı aramadan seçin',
  },
  unchecked: {
    color: 'gray',
    label: 'Kontrol edilemedi',
    title: 'Stok kartları kontrol edilemedi',
  },
};

export interface ExcelImportModalProps {
  onClose: () => void;
  onImport: (items: ImportedItem[]) => void;
}

/**
 * Port of the Excel import + column mapping modals: pick a file, check the
 * detected columns (always asked, as legacy did), preview, import.
 */
export function ExcelImportModal({ onClose, onImport }: ExcelImportModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<Stage>({ step: 'pick' });
  const [preview, setPreview] = useState<ImportedItem[] | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [summary, setSummary] = useState<{ processed: number; skipped: number } | null>(null);
  // The stock cards behind the preview's codes (null: the lookup failed).
  const [cards, setCards] = useState<Map<string, Item> | null>(null);
  const [checking, setChecking] = useState(false);

  const clear = () => {
    setFile(null);
    setStage({ step: 'pick' });
    setPreview(null);
    setErrors([]);
    setSummary(null);
    setCards(null);
  };

  const previewFile = async () => {
    if (!file) {
      notify.warning('Lütfen bir dosya seçin');
      return;
    }
    let rows: unknown[][];
    try {
      rows = await readRows(file);
    } catch {
      notify.error('Dosya okunamadı. Lütfen geçerli bir Excel veya CSV dosyası seçin');
      return;
    }
    if (rows.length < 2) {
      notify.error('Dosya boş veya geçersiz format');
      return;
    }
    const headers = rows[0] ?? [];
    const detected = detectColumnMapping(headers);
    setStage({ step: 'map', headers, dataRows: rows.slice(1), mapping: detected, detected });
  };

  const confirmMapping = async () => {
    if (stage.step !== 'map') return;
    if (missingRequired(stage.mapping).length > 0) {
      notify.error('Lütfen gerekli alanları eşleştirin');
      return;
    }
    const result = processRows(stage.dataRows, stage.mapping);
    setStage({ step: 'pick' });
    if (result.items.length === 0) {
      setErrors(result.errors);
      setSummary(null);
      setPreview(null);
      return;
    }
    // Legacy showed the summary, then the preview hid it again; keep it visible.
    setErrors(result.errors);
    setSummary(
      result.errors.length > 0 || result.skipped > 0
        ? { processed: result.items.length, skipped: result.skipped }
        : null,
    );
    setPreview(result.items);
    setChecking(true);
    try {
      setCards(await lookupCardsByCode(result.items.map((item) => item.item_code)));
    } catch {
      setCards(null);
      notify.warning('Stok kartları kontrol edilemedi; kodlar kaydederken denetlenecek');
    } finally {
      setChecking(false);
    }
  };

  const deleteRow = (index: number) => {
    setPreview((prev) => (prev ? prev.filter((_, i) => i !== index) : prev));
    notify.success('Satır başarıyla silindi');
  };

  const importItems = () => {
    if (!preview || preview.length === 0) return;
    // A code with no stock card comes in empty: the planner picks the card.
    const items = preview.map((item) =>
      cardStatus(item.item_code, cards) === 'missing' ? { ...item, item_code: '' } : item,
    );
    const missing = preview.length - items.filter((item) => item.item_code).length;
    onImport(items);
    notify.success(`${preview.length} ürün başarıyla içe aktarıldı`);
    if (missing > 0) {
      notify.warning(`${missing} satırın kodu stok kartlarında yok; bu satırlar için kartı seçin`);
    }
    onClose();
  };

  const count = preview?.length ?? 0;

  return (
    <Modal opened onClose={onClose} size="xl" withCloseButton={false} classNames={modalClassNames}>
      <ModalHeader title="Excel'den Ürün İçe Aktarma" icon="fas fa-file-excel" />
      <ModalBody>
        <Stack gap="sm">
          {stage.step === 'map' ? (
            <>
              <Alert
                color="yellow"
                variant="light"
                icon={<FaIcon icon="fas fa-exclamation-triangle" />}
              >
                <strong>Dikkat:</strong> Excel dosyanızdaki sütunları sistem alanlarıyla
                eşleştirmeniz gerekiyor. Gerekli alanlar{' '}
                <Text span c="red">
                  *
                </Text>{' '}
                ile işaretlenmiştir.
              </Alert>
              <Text fw={600}>Sütun Eşleştirme</Text>
              {EXCEL_FIELDS.map((field) => {
                const detected = stage.detected[field.key];
                const value = stage.mapping[field.key];
                return (
                  <Select
                    key={field.key}
                    label={
                      <>
                        {field.label}{' '}
                        {field.required ? (
                          <Text span c="red">
                            *
                          </Text>
                        ) : null}{' '}
                        {detected !== -1 ? (
                          <Text span c="green" size="sm">
                            (Otomatik algılandı: &quot;
                            {String(stage.headers[detected] ?? 'Bilinmeyen')}&quot;)
                          </Text>
                        ) : null}
                      </>
                    }
                    placeholder="Seçiniz"
                    clearable
                    data={stage.headers.map((header, index) => ({
                      value: String(index),
                      label: header ? String(header) : `Sütun ${index + 1}`,
                    }))}
                    value={value === -1 ? null : String(value)}
                    onChange={(next) =>
                      setStage({
                        ...stage,
                        mapping: {
                          ...stage.mapping,
                          [field.key]: next === null ? -1 : Number(next),
                        },
                      })
                    }
                  />
                );
              })}
            </>
          ) : (
            <>
              <Alert color="blue" variant="light" icon={<FaIcon icon="fas fa-info-circle" />}>
                <strong>Kullanım:</strong> Excel dosyanızı yükleyin. Sistem otomatik olarak
                sütunları algılamaya çalışacaktır. Eğer algılanamazsa, sütunları manuel olarak
                eşleştirmeniz istenecektir.
              </Alert>
              <SimpleGrid cols={{ base: 1, sm: 2 }}>
                <Stack gap={4}>
                  <Text size="sm" fw={600}>
                    Gerekli Sütunlar:
                  </Text>
                  <Code block>
                    {
                      'Kodu → Ürün Kodu\nismi → Ürün Adı\nsrm.mrk. → İş No\nMiktar → Miktar\nBirim → Birim'
                    }
                  </Code>
                  <Text size="sm" fw={600}>
                    Opsiyonel Sütunlar:
                  </Text>
                  <Code block>{'Açıklama 1 → Ürün Açıklaması\nAçıklama 2 → Özellikler'}</Code>
                </Stack>
                <Stack gap={4}>
                  <Text size="sm" fw={600}>
                    Birim Seçenekleri:
                  </Text>
                  <Text size="sm">adet, kg, metre, litre, paket, kutu, set, m2, varil</Text>
                </Stack>
              </SimpleGrid>
              <FileDropInput
                label="Excel Dosyası Seçin:"
                description="Desteklenen formatlar: .xlsx, .xls, .csv"
                placeholder="Excel veya CSV dosyasını sürükleyin ya da seçin..."
                accept=".xlsx,.xls,.csv"
                clearable
                value={file}
                onChange={setFile}
              />
              <Group gap="xs">
                <Button
                  size="xs"
                  variant="default"
                  leftSection={<FaIcon icon="fas fa-eye" />}
                  onClick={() => void previewFile()}
                >
                  Önizleme
                </Button>
                <Button
                  size="xs"
                  variant="default"
                  leftSection={<FaIcon icon="fas fa-trash" />}
                  onClick={clear}
                >
                  Temizle
                </Button>
              </Group>

              {summary ? (
                <Alert color="blue" variant="light" title="İçe Aktarma Özeti:">
                  <List size="sm">
                    <List.Item>
                      <strong>Başarıyla işlenen:</strong> {summary.processed} satır
                    </List.Item>
                    <List.Item>
                      <strong>Atlanan satırlar:</strong> {summary.skipped} satır
                    </List.Item>
                    <List.Item>
                      <strong>Hatalı satırlar:</strong> {errors.length} satır
                    </List.Item>
                  </List>
                </Alert>
              ) : null}
              {errors.length > 0 ? (
                <Alert
                  color={preview ? 'yellow' : 'red'}
                  variant="light"
                  title={preview ? 'Atlanan Satırlar:' : 'İçe aktarma hataları:'}
                >
                  <List size="sm">
                    {errors.map((error, index) => (
                      <List.Item key={index}>{error}</List.Item>
                    ))}
                  </List>
                </Alert>
              ) : null}

              {preview ? (
                <>
                  <Text fw={600}>Önizleme ({count} ürün)</Text>
                  <Table.ScrollContainer minWidth={900}>
                    <Table withTableBorder withColumnBorders verticalSpacing={4} fz="sm">
                      <Table.Thead>
                        <Table.Tr>
                          {[
                            '#',
                            'Ürün Kodu',
                            'Ürün Adı',
                            'Ürün Açıklaması',
                            'İş No',
                            'Miktar',
                            'Birim',
                            'Özellikler',
                            'Durum',
                            'İşlemler',
                          ].map((h) => (
                            <Table.Th key={h}>{h}</Table.Th>
                          ))}
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {preview.map((item, index) => (
                          <Table.Tr key={index}>
                            <Table.Td>{index + 1}</Table.Td>
                            <Table.Td>{item.item_code}</Table.Td>
                            <Table.Td>{item.item_name}</Table.Td>
                            <Table.Td>{item.item_description || '-'}</Table.Td>
                            <Table.Td>{item.job_no}</Table.Td>
                            <Table.Td>{item.quantity}</Table.Td>
                            <Table.Td>{item.unit}</Table.Td>
                            <Table.Td>{item.specifications || '-'}</Table.Td>
                            <Table.Td>
                              {checking ? (
                                <Badge color="gray">Kontrol ediliyor…</Badge>
                              ) : (
                                <Badge
                                  color={STATUS_BADGE[cardStatus(item.item_code, cards)].color}
                                  title={STATUS_BADGE[cardStatus(item.item_code, cards)].title}
                                >
                                  {STATUS_BADGE[cardStatus(item.item_code, cards)].label}
                                </Badge>
                              )}
                            </Table.Td>
                            <Table.Td>
                              <ActionIcon
                                variant="default"
                                color="red"
                                aria-label={`Satır ${index + 1} sil`}
                                onClick={() => deleteRow(index)}
                              >
                                <FaIcon icon="fas fa-trash" />
                              </ActionIcon>
                            </Table.Td>
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  </Table.ScrollContainer>
                </>
              ) : null}
            </>
          )}
        </Stack>
      </ModalBody>
      <ModalFooter>
        {stage.step === 'map' ? (
          <>
            <Button
              variant="default"
              leftSection={<FaIcon icon="fas fa-times" />}
              onClick={() => setStage({ step: 'pick' })}
            >
              İptal
            </Button>
            <Button
              leftSection={<FaIcon icon="fas fa-check" />}
              onClick={() => void confirmMapping()}
            >
              Eşleştirmeyi Onayla
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="default"
              leftSection={<FaIcon icon="fas fa-times" />}
              onClick={onClose}
            >
              İptal
            </Button>
            <Button
              disabled={count === 0 || checking}
              leftSection={<FaIcon icon="fas fa-upload" />}
              onClick={importItems}
            >
              {count > 0 ? `${count} Ürünü İçe Aktar` : 'Ürünleri İçe Aktar'}
            </Button>
          </>
        )}
      </ModalFooter>
    </Modal>
  );
}
