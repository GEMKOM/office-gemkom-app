import { Alert, Button, Code, Grid, Group, Modal, NativeSelect, Stack, Table, Text } from '@mantine/core';
import { useState } from 'react';
import { FaIcon, FileDropInput, ModalBody, ModalFooter, ModalHeader, modalClassNames, notify, StatusBadge } from '@/ui';
import {
  detectColumnMapping,
  MAPPING_FIELDS,
  processRows,
  readSpreadsheet,
  type Cell,
  type ColumnMapping,
  type ImportedItem,
} from '../importItems';
import { newItemId, type PrItem } from '../model';

// itemsManager bulk import: file → column mapping → preview → import.

const truncate = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}...` : text);

export function BulkImportModal({ onClose, onImport }: { onClose: () => void; onImport: (items: PrItem[]) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState<{ headers: Cell[]; rows: Cell[][]; mapping: ColumnMapping; detected: ColumnMapping } | null>(null);
  const [preview, setPreview] = useState<ImportedItem[] | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  const clear = () => {
    setFile(null);
    setPending(null);
    setPreview(null);
    setErrors([]);
  };

  const previewFile = async () => {
    if (!file) {
      notify.warning('Lütfen bir dosya seçin.');
      return;
    }
    let data: Cell[][];
    try {
      data = await readSpreadsheet(file);
    } catch {
      notify.error('Dosya okunamadı. Lütfen geçerli bir Excel veya CSV dosyası seçin.');
      return;
    }
    if (data.length < 2) {
      notify.error('Dosya boş veya geçersiz format.');
      return;
    }
    const headers = data[0] ?? [];
    const rows = data.slice(1);
    const detected = detectColumnMapping(headers, rows);
    setPending({ headers, rows, mapping: detected, detected });
  };

  const confirmMapping = () => {
    if (!pending) return;
    // Legacy compared against -1 while an empty select gave NaN, so this never fired.
    if (MAPPING_FIELDS.some(({ field }) => pending.mapping[field] === -1)) {
      notify.warning('Lütfen gerekli alanları eşleştirin.');
      return;
    }
    // The mapping modal has no specs select: only "açıklama" columns feed specs (legacy).
    const result = processRows(pending.rows, { ...pending.mapping, specs: undefined }, pending.headers);
    setPending(null);
    if (result.items.length === 0) {
      setErrors(result.errors);
      setPreview(null);
      return;
    }
    setErrors([]);
    setPreview(result.items);
  };

  const importItems = () => {
    if (!preview?.length) return;
    onImport(preview.map((item) => ({ id: newItemId(), ...item })));
    notify.success(`${preview.length} malzeme başarıyla içe aktarıldı.`);
    onClose();
  };

  return (
    <>
      <Modal opened onClose={onClose} size="xl" withCloseButton={false} classNames={modalClassNames} padding={0}>
        <ModalHeader title="Toplu Malzeme İçe Aktarma" icon="fas fa-upload" />
        <ModalBody>
          <Stack gap="md">
            <Alert color="blue" p="xs">
              <strong>Kullanım:</strong> Excel dosyanızı yükleyin. Sistem otomatik olarak sütunları algılamaya
              çalışacaktır. Eğer algılanamazsa, sütunları manuel olarak eşleştirmeniz istenecektir.
            </Alert>
            <Grid>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <Text size="sm" fw={600}>Gerekli Sütunlar:</Text>
                <Code block>
                  {'Stok kodu - Malzeme kodu\nAd - Malzeme adı\nSRM. KODU - İş No\nMiktar - Miktar değeri\nBirim - Birim türü'}
                </Code>
                <Text size="sm" fw={600} mt="xs">Opsiyonel Sütunlar:</Text>
                <Code block>Özellikler - Teknik özellikler</Code>
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <Text size="sm" fw={600}>Birim Seçenekleri:</Text>
                <Code block>adet, kg, metre, litre, paket, kutu</Code>
              </Grid.Col>
            </Grid>
            <FileDropInput
              label="Excel Dosyası Seçin:"
              placeholder="Excel veya CSV dosyasını sürükleyin ya da seçin..."
              accept=".xlsx,.xls,.csv"
              description="Desteklenen formatlar: .xlsx, .xls, .csv"
              value={file}
              onChange={setFile}
            />
            <Group>
              <Button variant="outline" leftSection={<FaIcon icon="fas fa-eye" />} onClick={() => void previewFile()}>
                Önizleme
              </Button>
              <Button variant="default" leftSection={<FaIcon icon="fas fa-trash" />} onClick={clear}>
                Temizle
              </Button>
            </Group>
            {errors.length ? (
              <Alert color="red" title="İçe aktarma hataları:">
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {errors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </Alert>
            ) : null}
            {preview ? (
              <div>
                <Text fw={600} mb={4}>{`Önizleme (${preview.length} malzeme)`}</Text>
                <Table fz="sm" data-testid="import-preview">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>#</Table.Th>
                      <Table.Th>Malzeme Kodu</Table.Th>
                      <Table.Th>Malzeme Adı</Table.Th>
                      <Table.Th>İş No</Table.Th>
                      <Table.Th>Miktar</Table.Th>
                      <Table.Th>Birim</Table.Th>
                      <Table.Th>Teknik Özellikler</Table.Th>
                      <Table.Th>Durum</Table.Th>
                      <Table.Th>İşlemler</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {preview.map((item, i) => (
                      <Table.Tr key={i}>
                        <Table.Td>{i + 1}</Table.Td>
                        <Table.Td>{item.code}</Table.Td>
                        <Table.Td>{item.name}</Table.Td>
                        <Table.Td>{item.job_no}</Table.Td>
                        <Table.Td>{item.quantity}</Table.Td>
                        <Table.Td>{item.unit}</Table.Td>
                        <Table.Td>{item.specs ? truncate(item.specs, 50) : '-'}</Table.Td>
                        <Table.Td>
                          <StatusBadge color="green">Geçerli</StatusBadge>
                        </Table.Td>
                        <Table.Td>
                          <Button
                            size="compact-xs"
                            color="red"
                            variant="outline"
                            aria-label="Satırı sil"
                            onClick={() => {
                              const next = preview.filter((_, j) => j !== i);
                              setPreview(next.length ? next : null);
                              notify.success('Satır başarıyla silindi');
                            }}
                          >
                            <i className="fas fa-trash" />
                          </Button>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </div>
            ) : null}
          </Stack>
        </ModalBody>
        <ModalFooter>
          <Button variant="default" onClick={onClose}>
            İptal
          </Button>
          <Button leftSection={<FaIcon icon="fas fa-upload" />} disabled={!preview?.length} onClick={importItems}>
            {preview?.length ? `${preview.length} Malzemeyi İçe Aktar` : 'Malzemeleri İçe Aktar'}
          </Button>
        </ModalFooter>
      </Modal>
      {pending ? (
        <Modal opened onClose={() => setPending(null)} size="lg" withCloseButton={false} classNames={modalClassNames} padding={0}>
          <ModalHeader title="Sütun Eşleştirme" icon="fas fa-columns" />
          <ModalBody>
            <Stack gap="sm">
              <Alert color="yellow" p="xs">
                <strong>Dikkat:</strong> Excel dosyanızdaki sütunları sistem alanlarıyla eşleştirmeniz gerekiyor. Gerekli
                alanlar * ile işaretlenmiştir.
              </Alert>
              {MAPPING_FIELDS.map(({ field, label }) => {
                const detected = pending.detected[field];
                return (
                  <NativeSelect
                    key={field}
                    label={
                      <>
                        {`${label} *`}
                        {detected !== -1 ? (
                          <Text span c="green" size="xs">{` (Otomatik algılandı: "${String(pending.headers[detected] ?? '') || 'Bilinmeyen'}")`}</Text>
                        ) : null}
                      </>
                    }
                    value={String(pending.mapping[field])}
                    onChange={(e) => {
                      const value = Number.parseInt(e.currentTarget.value, 10);
                      setPending((p) => (p ? { ...p, mapping: { ...p.mapping, [field]: value } } : p));
                    }}
                    data={[
                      { value: '-1', label: 'Seçiniz' },
                      ...pending.headers.map((h, i) => ({ value: String(i), label: h ? String(h) : `Sütun ${i + 1}` })),
                    ]}
                  />
                );
              })}
            </Stack>
          </ModalBody>
          <ModalFooter>
            <Button variant="default" onClick={() => setPending(null)}>
              İptal
            </Button>
            <Button leftSection={<FaIcon icon="fas fa-check" />} onClick={confirmMapping}>
              Eşleştirmeyi Onayla
            </Button>
          </ModalFooter>
        </Modal>
      ) : null}
    </>
  );
}
