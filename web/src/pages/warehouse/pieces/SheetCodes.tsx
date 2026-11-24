import { Alert, Button, Table, Text } from '@mantine/core';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { DetailModal, FaIcon, notify } from '@/ui';

// The codes new plate sheets got (Mal Kabul, Parça Ekle, a cut's remnants),
// shown right after they are saved so they can be written on the sheets
// themselves, with a print of the list.

export interface CodedSheet {
  code: string;
  item_code: string;
  item_name?: string;
  width_mm: string | null;
  length_mm: string;
  heat_number?: string;
}

const mm = (v: string | null) => (v === null ? '' : String(Number(v)));

export function sheetSize(s: { width_mm: string | null; length_mm: string }): string {
  return s.width_mm ? `${mm(s.width_mm)} × ${mm(s.length_mm)} mm` : `${mm(s.length_mm)} mm`;
}

/** The coded sheets among rows the backend sent back (bars have no code). */
export function codedSheets<T extends { code?: string | null }>(
  rows: T[],
): (T & { code: string })[] {
  return rows.filter((r): r is T & { code: string } => Boolean(r.code));
}

const PRINT_CSS = `
  body { font: 11pt/1.4 "Segoe UI", Arial, sans-serif; color: #111; margin: 12mm; }
  h1 { font-size: 14pt; margin: 0 0 4mm; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #999; padding: 2mm 2.5mm; text-align: left; vertical-align: middle; }
  th { background: #eee; font-size: 9.5pt; }
  td.code { font: 700 16pt/1.2 Consolas, "Courier New", monospace; letter-spacing: .5pt; white-space: nowrap; }
  tr { page-break-inside: avoid; }
  @page { size: A4; margin: 10mm; }
`;

function PrintList({ title, sheets }: { title: string; sheets: CodedSheet[] }) {
  return (
    <>
      <h1>{title}</h1>
      <table>
        <thead>
          <tr>
            <th>Sac Kodu</th>
            <th>Stok Kartı</th>
            <th>Ölçü</th>
            <th>Döküm No</th>
          </tr>
        </thead>
        <tbody>
          {sheets.map((s) => (
            <tr key={s.code}>
              <td className="code">{s.code}</td>
              <td>
                {s.item_code}
                {s.item_name ? ` · ${s.item_name}` : ''}
              </td>
              <td>{sheetSize(s)}</td>
              <td>{s.heat_number || '–'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

/** The list in a new window, printed. */
export function printSheetCodes(title: string, sheets: CodedSheet[]): void {
  const win = window.open('', '_blank');
  if (!win) {
    notify.error('Yazdırma penceresi açılamadı; tarayıcının açılır pencere iznini kontrol edin.');
    return;
  }
  const doc = win.document;
  doc.open();
  doc.write(
    '<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"><title></title></head><body></body></html>',
  );
  doc.close();
  doc.title = title;
  const style = doc.createElement('style');
  style.textContent = PRINT_CSS;
  doc.head.appendChild(style);
  const host = doc.createElement('div');
  doc.body.appendChild(host);
  const root = createRoot(host);
  flushSync(() => root.render(<PrintList title={title} sheets={sheets} />));
  win.addEventListener('beforeunload', () => root.unmount());
  win.focus();
  setTimeout(() => {
    try {
      win.print();
    } catch {
      /* the user can print from the window */
    }
  }, 50);
}

export function SheetCodesTable({ sheets }: { sheets: CodedSheet[] }) {
  return (
    <Table striped withTableBorder verticalSpacing="xs">
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Sac Kodu</Table.Th>
          <Table.Th>Stok Kartı</Table.Th>
          <Table.Th>Ölçü</Table.Th>
          <Table.Th>Döküm No</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {sheets.map((s) => (
          <Table.Tr key={s.code}>
            <Table.Td>
              <Text fw={700} size="lg" ff="monospace" style={{ whiteSpace: 'nowrap' }}>
                {s.code}
              </Text>
            </Table.Td>
            <Table.Td>
              <Text size="sm" fw={600}>
                {s.item_code}
              </Text>
              {s.item_name ? (
                <Text size="xs" c="dimmed">
                  {s.item_name}
                </Text>
              ) : null}
            </Table.Td>
            <Table.Td style={{ whiteSpace: 'nowrap' }}>{sheetSize(s)}</Table.Td>
            <Table.Td>{s.heat_number || '–'}</Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

/** After saving: the new sheets' codes, to write on the sheets. */
export function SheetCodesModal({
  opened,
  onClose,
  title,
  sheets,
}: {
  opened: boolean;
  onClose: () => void;
  title: string;
  sheets: CodedSheet[];
}) {
  return (
    <DetailModal
      opened={opened}
      onClose={onClose}
      title="Sac kodları"
      subtitle={title}
      icon="fas fa-tags"
      size="lg"
      footerActions={
        <Button
          variant="default"
          leftSection={<FaIcon icon="fas fa-print" />}
          onClick={() => printSheetCodes(title, sheets)}
        >
          Yazdır
        </Button>
      }
      sections={[
        {
          content: (
            <>
              <Alert color="blue" variant="light" mb="sm" icon={<FaIcon icon="fas fa-pen" />}>
                Her sacın üzerine kodunu yazın. Kod ile Sac Stoğu’nda aratınca sacın kartı, ölçüsü
                ve döküm no’su bulunur; kesimde de sac bu kodla seçilir.
              </Alert>
              <SheetCodesTable sheets={sheets} />
            </>
          ),
        },
      ]}
    />
  );
}
