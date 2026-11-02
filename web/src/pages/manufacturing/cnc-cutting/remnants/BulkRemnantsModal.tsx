import { Alert, Badge, Box, Code, Group, List, Table, Text, Textarea } from '@mantine/core';
import { useMemo, useState } from 'react';
import { useBulkCreateRemnantPlates, type RemnantPlateInput } from '@/api/manufacturing/remnants';
import { FaIcon, FormModal, ModalSection, notify } from '@/ui';
import { parseBulkRemnants } from './parseBulkRemnants';

const PLACEHOLDER =
  'Her satır bir plaka olacak şekilde verileri girin:\n2,5\t290\t660\t1\tBAKIR\n3\t8\t1500\t660\t5\tGALVANİZ';

const HELP =
  'Format: Kalınlık(mm) [TAB] Kalınlık2(mm) [TAB] Genişlik(mm) [TAB] Yükseklik(mm) [TAB] Adet [TAB] Malzeme ' +
  '(her satır bir plaka, 6 alan, tab veya virgül ile ayrılmış). Kalınlık2 opsiyoneldir - 5 alan girilirse ' +
  'Kalınlık2 atlanır. Not: Kalınlık için ondalık ayırıcı olarak nokta veya virgül kullanılabilir (örn: 2.5 veya 2,5)';

/** Port of showBulkCreateRemnantsModal in remnants.js: pasted rows, a live preview, one bulk request. */
export function BulkRemnantsModal({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState('');
  const { valid, invalid } = useMemo(() => parseBulkRemnants(text), [text]);
  const bulkCreate = useBulkCreateRemnantPlates();

  const save = async () => {
    if (!text.trim()) {
      notify.error('Plaka verileri gereklidir');
      return;
    }
    const first = invalid[0];
    if (first) {
      notify.error(`Satır ${first.lineNumber}: ${first.error}`);
      return;
    }
    if (valid.length === 0) {
      notify.error('Geçerli plaka verisi bulunamadı');
      return;
    }
    const data: RemnantPlateInput[] = valid.map(
      ({ thickness_mm, thickness_mm_2, dimensions, quantity, material }) => ({
        thickness_mm,
        ...(thickness_mm_2 ? { thickness_mm_2 } : {}),
        dimensions,
        quantity,
        material,
      }),
    );
    try {
      await bulkCreate.mutateAsync(data);
      notify.success(`${data.length} adet fire plaka başarıyla oluşturuldu`);
      onClose();
    } catch (error) {
      console.error('Error bulk creating remnant plates:', error);
      notify.error('Plakalar oluşturulurken hata oluştu');
    }
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title="Toplu Fire Plaka Ekle"
      icon="fas fa-layer-group"
      size="lg"
      submitLabel="Plakaları Oluştur"
      submitting={bulkCreate.isPending}
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <ModalSection title="Toplu Plaka Bilgileri" icon="fas fa-info-circle">
        <Textarea
          label="Plaka Verileri"
          withAsterisk
          description={HELP}
          placeholder={PLACEHOLDER}
          rows={10}
          value={text}
          onChange={(event) => setText(event.currentTarget.value)}
          styles={{ input: { fontFamily: 'var(--mantine-font-family-monospace)' } }}
        />
      </ModalSection>
      <ModalSection title="Önizleme" icon="fas fa-eye">
        <Group mb="xs">
          <Badge
            color={valid.length > 0 ? 'green' : 'blue'}
            variant="light"
            data-testid="bulk-preview-count"
          >
            {valid.length} plaka
          </Badge>
        </Group>
        <Box mah={300} style={{ overflowY: 'auto' }}>
          {valid.length === 0 && invalid.length === 0 ? (
            <Text c="dimmed" ta="center" py="md" size="sm">
              <FaIcon icon="fas fa-info-circle" style={{ marginRight: 8 }} />
              Veri giriş yaptığınızda önizleme burada görünecek
            </Text>
          ) : null}
          {valid.length > 0 ? (
            <Table withTableBorder withColumnBorders striped fz="sm" mb="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>#</Table.Th>
                  <Table.Th>Kalınlık (mm)</Table.Th>
                  <Table.Th>Kalınlık 2 (mm)</Table.Th>
                  <Table.Th>Boyutlar</Table.Th>
                  <Table.Th>Adet</Table.Th>
                  <Table.Th>Malzeme</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {valid.map((item) => (
                  <Table.Tr key={item.lineNumber}>
                    <Table.Td>{item.lineNumber}</Table.Td>
                    <Table.Td>{item.thickness_mm}</Table.Td>
                    <Table.Td>{item.thickness_mm_2 || '-'}</Table.Td>
                    <Table.Td>{item.dimensions}</Table.Td>
                    <Table.Td>{item.quantity}</Table.Td>
                    <Table.Td>{item.material}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          ) : null}
          {invalid.length > 0 ? (
            <Alert
              color="yellow"
              icon={<FaIcon icon="fas fa-exclamation-triangle" />}
              title={`Hatalı Satırlar (${invalid.length})`}
            >
              <List size="sm" spacing={4}>
                {invalid.map((item) => (
                  <List.Item key={item.lineNumber}>
                    <strong>Satır {item.lineNumber}:</strong> {item.error}
                    <br />
                    <Code>{item.line}</Code>
                  </List.Item>
                ))}
              </List>
            </Alert>
          ) : null}
        </Box>
      </ModalSection>
    </FormModal>
  );
}
