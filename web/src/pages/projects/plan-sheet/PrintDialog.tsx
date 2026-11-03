import { Button, Checkbox, Group, Modal, NativeSelect, SimpleGrid, Stack, Text } from '@mantine/core';
import { useState } from 'react';
import type { SheetLang } from '@/features/plan-sheet/sheetLang';
import { SHEET_COLUMN_LABELS, SHEET_FIELDS } from '@/features/plan-sheet/sheetRows';
import type { ViewChoices } from '@/features/plan-sheet/types';
import { FaIcon } from '@/ui/FaIcon';

interface PrintDialogProps {
  opened: boolean;
  onClose: () => void;
  columns: string[] | null;
  showHeader: boolean;
  mainOnly: boolean;
  expandAll: boolean;
  lang: SheetLang;
  /** The choices, saved with the link's edits; `print` opens the print dialog after. */
  onApply: (choices: Required<ViewChoices>, print: boolean) => void;
}

/**
 * An editable link's print choices: the office dialog's (which columns, the
 * header, sub-rows, folded jobs, language), made on the link itself and saved
 * with the edits, so the next PDF from this link comes out the same.
 */
export function PrintDialog(props: PrintDialogProps) {
  return (
    <Modal opened={props.opened} onClose={props.onClose} title="Yazdır / PDF" size="lg" centered>
      {/* Mounted per opening, so it starts from the current choices. */}
      {props.opened && <PrintChoices {...props} />}
    </Modal>
  );
}

function PrintChoices({ onClose, columns, showHeader, mainOnly, expandAll, lang, onApply }: PrintDialogProps) {
  const [chosen, setChosen] = useState(() => new Set<string>(columns ?? SHEET_FIELDS));
  const [head, setHead] = useState(showHeader);
  const [expand, setExpand] = useState(expandAll);
  const [main, setMain] = useState(mainOnly);
  const [language, setLanguage] = useState<SheetLang>(lang);

  const apply = (print: boolean) => {
    const picked = ['title', ...SHEET_FIELDS.filter((f) => f !== 'title' && chosen.has(f))];
    onApply(
      {
        columns: picked.length === SHEET_FIELDS.length ? [] : picked,
        show_header: head,
        main_only: main,
        expand_all: expand,
        language,
      },
      print,
    );
  };

  const toggle = (field: string, on: boolean) =>
    setChosen((s) => {
      const next = new Set(s);
      if (on) next.add(field);
      else next.delete(field);
      return next;
    });

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        Sütunları seçin; Görev sütunu ve zaman çizelgesi her zaman yer alır. Açılan yazdırma penceresinde "PDF
        olarak kaydet"i seçin.
      </Text>
      <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="xs" verticalSpacing={6}>
        {SHEET_FIELDS.map((field) =>
          field === 'title' ? (
            <Checkbox key={field} checked disabled label={`${SHEET_COLUMN_LABELS[field]} (her zaman)`} />
          ) : (
            <Checkbox
              key={field}
              checked={chosen.has(field)}
              onChange={(e) => toggle(field, e.currentTarget.checked)}
              label={SHEET_COLUMN_LABELS[field]}
            />
          ),
        )}
      </SimpleGrid>
      <Checkbox
        checked={head}
        onChange={(e) => setHead(e.currentTarget.checked)}
        label="Başlık bölümünü göster (iş emri, müşteri ve tarih zinciri)"
      />
      <Checkbox
        checked={expand}
        onChange={(e) => setExpand(e.currentTarget.checked)}
        label="Katlanmış iş emirlerini de açık göster"
      />
      <Checkbox
        checked={main}
        onChange={(e) => setMain(e.currentTarget.checked)}
        label="Yalnızca departman görevleri (alt satırlar, ekip ve taşeron adları gizli)"
      />
      <NativeSelect
        label="Dil (PDF)"
        w={200}
        size="xs"
        value={language}
        onChange={(e) => setLanguage(e.currentTarget.value === 'en' ? 'en' : 'tr')}
        data={[
          { value: 'tr', label: 'Türkçe' },
          { value: 'en', label: 'English' },
        ]}
      />
      <Group justify="flex-end" gap="xs" mt="xs">
        <Button variant="default" size="xs" onClick={onClose}>
          Vazgeç
        </Button>
        <Button variant="outline" color="red" size="xs" onClick={() => apply(false)}>
          Uygula
        </Button>
        <Button color="red" size="xs" leftSection={<FaIcon icon="fas fa-print" />} onClick={() => apply(true)}>
          Yazdır / PDF
        </Button>
      </Group>
    </Stack>
  );
}
