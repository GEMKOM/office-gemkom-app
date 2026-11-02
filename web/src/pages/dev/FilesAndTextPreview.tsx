import { Group, SimpleGrid, Stack, Switch, Text } from '@mantine/core';
import { useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import {
  groupMembersQueryOptions,
  teamsQueryOptions,
  usersQueryOptions,
  type Team,
  type UserOption,
} from '@/api/reference/users';
import {
  FileAttachments,
  notify,
  Panel,
  RichText,
  RichTextEditor,
  type AttachmentFile,
  type UploadFn,
} from '@/ui';

// Dev-only demos for /react-preview/ui: RichText, RichTextEditor,
// FileAttachments and FileViewer, with fake people, groups and files.

const USERS: UserOption[] = [
  { id: 1, username: 'onatcalik', full_name: 'Onat Çalık' },
  { id: 2, username: 'canersahin', full_name: 'Caner Şahin' },
  { id: 3, username: 'aysey', full_name: 'Ayşe Yılmaz' },
];
const TEAMS: Team[] = [
  {
    id: 9,
    name: 'Satın Alma',
    display_name: 'Satın Alma',
    value: 'Satın Alma',
    label: 'Satın Alma',
    member_count: 3,
  },
  {
    id: 7,
    name: 'Planlama',
    display_name: 'Planlama',
    value: 'Planlama',
    label: 'Planlama',
    member_count: 2,
  },
];

/** Seeds the reference cache, so the @ list and the group popover work without a backend. */
function FakeReferenceData({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  useState(() => {
    queryClient.setQueryData(usersQueryOptions({}).queryKey, USERS);
    queryClient.setQueryData(teamsQueryOptions().queryKey, TEAMS);
    queryClient.setQueryData(groupMembersQueryOptions(9).queryKey, {
      id: 9,
      name: 'Satın Alma',
      members: USERS.map((user) => ({
        username: user.username,
        full_name: user.full_name,
        position: 'Satın Alma Uzmanı',
      })),
    });
    return null;
  });
  return <>{children}</>;
}

const SAMPLE = [
  'Hat 3 kaynak fikstürü için **son durum**:',
  '- !!Termin riski!!: sac kalınlığı teyit bekliyor',
  '- ++Malzeme geldi++, depoya alındı',
  '- Ölçü kontrolü `QC-2026-114` ile yapılacak',
  '',
  '@onatcalik @Satın Alma bakabilir mi? Detay: https://ofis.gemcore.com.tr/projects/project-tracking?job=293-12',
].join('\n');

/** A one-page PDF built in the browser, so the viewer has something to show. */
function samplePdfUrl(): string {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    '',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  const text = 'BT /F1 24 Tf 72 760 Td (GEMKOM - ornek PDF) Tj ET';
  objects[3] = `<< /Length ${text.length} >>\nstream\n${text}\nendstream`;
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return URL.createObjectURL(new Blob([pdf], { type: 'application/pdf' }));
}

const INITIAL_FILES = (): AttachmentFile[] => [
  {
    id: 1,
    url: '/images/gemkom.png',
    name: 'gemkom-logo.png',
    size: 10_109,
    uploadedBy: 'Onat Çalık',
    uploadedAt: '2026-11-01T09:30:00+03:00',
    typeLabel: 'Fotoğraf',
  },
  {
    id: 2,
    url: samplePdfUrl(),
    name: 'olcu-raporu.pdf',
    size: 1_204,
    uploadedBy: 'Ayşe Yılmaz',
    uploadedAt: '2026-11-02T08:05:00+03:00',
    typeLabel: 'Rapor',
  },
  {
    id: 3,
    url: '/images/layout.png',
    name: 'yerlesim.png',
    uploadedBy: 'Caner Şahin',
    uploadedAt: '2026-10-28T14:12:00+03:00',
  },
  {
    id: 4,
    url: '/images/gemkom.png',
    name: 'malzeme-listesi.xlsx',
    size: 48_200,
    typeLabel: 'Doküman',
  },
];

/** Pretends to upload: progress in steps, and a file named "hata…" fails. */
const fakeUpload: UploadFn = (file, { onProgress, signal }) =>
  new Promise((resolve, reject) => {
    let done = 0;
    const timer = window.setInterval(() => {
      done += 0.2;
      onProgress(done);
      if (done >= 1) {
        window.clearInterval(timer);
        if (file.name.toLocaleLowerCase('tr').startsWith('hata'))
          reject(new Error('Sunucu dosyayı reddetti'));
        else resolve(undefined);
      }
    }, 250);
    signal.addEventListener('abort', () => window.clearInterval(timer));
  });

export function RichTextDemo() {
  const [value, setValue] = useState(SAMPLE);
  return (
    <FakeReferenceData>
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
        <Stack gap={6}>
          <Text size="sm" fw={600}>
            RichTextEditor (@ ile kişi / grup)
          </Text>
          <RichTextEditor
            label="Yorum"
            placeholder="Yorum yazın... (@ile kullanıcı etiketleyin)"
            value={value}
            onChange={setValue}
            rows={6}
          />
          <Text size="xs" c="dimmed" ff="monospace" style={{ whiteSpace: 'pre-wrap' }}>
            {value}
          </Text>
        </Stack>
        <Stack gap={6}>
          <Text size="sm" fw={600}>
            RichText (grup rozetine tıklayın)
          </Text>
          <Panel>
            <RichText
              content={value}
              mentionedUsers={USERS}
              mentionedGroups={TEAMS.map((team) => ({ id: team.id ?? 0, name: team.name }))}
            />
          </Panel>
        </Stack>
      </SimpleGrid>
    </FakeReferenceData>
  );
}

export function FileAttachmentsDemo() {
  const [files, setFiles] = useState(INITIAL_FILES);
  const [readOnly, setReadOnly] = useState(false);
  const [layout, setLayout] = useState<'list' | 'grid'>('list');
  return (
    <Stack gap="sm">
      <Group>
        <Switch
          label="Salt okunur"
          checked={readOnly}
          onChange={(event) => setReadOnly(event.currentTarget.checked)}
        />
        <Switch
          label="Izgara"
          checked={layout === 'grid'}
          onChange={(event) => setLayout(event.currentTarget.checked ? 'grid' : 'list')}
        />
      </Group>
      <Panel>
        <FileAttachments
          title="Dosyalar"
          files={files}
          layout={layout}
          readOnly={readOnly}
          maxSize={20 * 1024 * 1024}
          onUpload={async (file, context) => {
            await fakeUpload(file, context);
            setFiles((list) => [
              ...list,
              {
                id: `${file.name}-${Date.now()}`,
                url: URL.createObjectURL(file),
                name: file.name,
                size: file.size,
                uploadedBy: 'Siz',
                uploadedAt: new Date().toISOString(),
              },
            ]);
          }}
          onUploaded={({ uploaded, failed }) => {
            if (uploaded && !failed) notify.success(`${uploaded} dosya yüklendi`);
            else if (uploaded)
              notify.warning(`${uploaded} dosya yüklendi, ${failed} dosya yüklenemedi`);
          }}
          onDelete={async (file) => {
            setFiles((list) => list.filter((entry) => entry.id !== file.id));
            notify.success('Dosya silindi');
          }}
        />
      </Panel>
    </Stack>
  );
}
