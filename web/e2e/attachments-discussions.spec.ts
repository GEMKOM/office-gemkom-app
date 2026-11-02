import { deflateSync } from 'node:zlib';
import type { Page } from '@playwright/test';
import { expect, mockBackend, paginated, seedSession, test } from './fixtures';

// FileAttachments, FileViewer and the rich-text discussion, on the pages that
// were waiting for them.
//   /isg/issues/?issue=…   GET /isg/issues/, /isg/issues/<id>/, /<id>/files/,
//                          POST /<id>/files/upload/ (multipart, with progress)
//   /general/discussions/  GET /projects/my-discussions/{topics,summary}/,
//                          /projects/discussion-topics/<id>/ and /comments/,
//                          POST /projects/discussion-comments/
// Set ATTACH_SHOTS=<folder> to also save screenshots there.

const SHOTS = process.env.ATTACH_SHOTS;
const shot = async (page: Page, name: string) => {
  if (!SHOTS) return;
  // Let modal transitions settle first.
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

// A 480x300 PNG (a red band on graphite, like a photo of a sign), served
// from a file host the way presigned URLs are.
function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let k = 0; k < 8; k++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}
function makePng(width: number, height: number): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.writeUInt8(8, 8); // bit depth
  header.writeUInt8(2, 9); // RGB
  const rows: Buffer[] = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 3);
    for (let x = 0; x < width; x++) {
      const band = y > height * 0.35 && y < height * 0.6;
      const [r, g, b] = band ? [139, 0, 0] : (x + y) % 40 < 20 ? [74, 82, 91] : [96, 104, 113];
      row.writeUInt8(r, 1 + x * 3);
      row.writeUInt8(g, 2 + x * 3);
      row.writeUInt8(b, 3 + x * 3);
    }
    rows.push(row);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
const PNG = makePng(480, 300);
const FILE_HOST = 'https://files.e2e.test';

const USER_ID = 990001;

const ISSUE = {
  id: 501,
  issue_number: 'ISG-2026-014',
  title: 'Kaynakhanede baret kullanılmıyor',
  description: 'B blokta iki operatör baretsiz çalışıyor.',
  category: 'ppe',
  category_display: 'Kişisel Koruyucu Donanım',
  severity: 'high',
  severity_display: 'Yüksek',
  status: 'open',
  status_display: 'Açık',
  location: 'Kaynakhane B',
  assigned_to: [USER_ID],
  assigned_to_data: [{ id: USER_ID, name: 'E2E Kullanıcı' }],
  due_date: '2026-11-10',
  is_overdue: false,
  file_count: 1,
  created_at: '2026-11-01T08:00:00+03:00',
  created_by_name: 'İSG Uzmanı',
  discussion_topic_id: null,
};

const EXISTING_FILE = {
  id: 1,
  url: `${FILE_HOST}/isg/olcum-raporu.pdf`,
  name: 'Ölçüm raporu',
  extension: 'pdf',
  file_type_display: 'Rapor',
  uploaded_at: '2026-11-01T09:00:00+03:00',
  uploaded_by_name: 'İSG Uzmanı',
};
const UPLOADED_FILE = {
  id: 2,
  url: `${FILE_HOST}/isg/bulgu.png`,
  name: 'bulgu.png',
  extension: 'png',
  file_type_display: 'Fotoğraf',
  uploaded_at: '2026-11-02T10:00:00+03:00',
  uploaded_by_name: 'E2E Kullanıcı',
};

test('İSG: upload an attachment with its type, then preview it', async ({
  page,
  consoleErrors,
}) => {
  const session = await seedSession(page, { admin: false });
  await page.route(`${FILE_HOST}/**`, (route) =>
    route.fulfill({
      status: 200,
      body: PNG,
      contentType: 'image/png',
      headers: { 'Access-Control-Allow-Origin': '*' },
    }),
  );
  const backend = await mockBackend(
    page,
    {
      'GET /isg/issues/': { json: paginated([ISSUE]) },
      'GET /isg/issues/summary/': {
        json: { total: 1, open: 1, in_progress: 0, resolved: 0, overdue: 0, mine_open: 1 },
      },
      'GET /isg/issues/my-permissions/': { json: { can_manage: false } },
      'GET /isg/issues/501/': { json: ISSUE },
      'GET /isg/issues/501/files/': ({ callIndex }) => ({
        json: callIndex === 0 ? [EXISTING_FILE] : [EXISTING_FILE, UPLOADED_FILE],
      }),
      'POST /isg/issues/501/files/upload/': { status: 201, json: UPLOADED_FILE },
    },
    { session },
  );

  await page.goto('/isg/issues/?issue=ISG-2026-014');
  const details = page.getByRole('dialog', { name: /ISG-2026-014 — Kaynakhanede baret/ });
  await expect(details).toBeVisible();
  await expect(
    details.getByRole('button', { name: 'Ölçüm raporu.pdf', exact: true }),
  ).toBeVisible();
  await expect(details.getByText('Tür: Rapor')).toBeVisible();

  await details.getByRole('button', { name: 'Dosya Yükle' }).click();
  const upload = page.getByRole('dialog', { name: 'Dosya Yükle' });
  await upload
    .getByTestId('file-input')
    .setInputFiles({ name: 'bulgu.png', mimeType: 'image/png', buffer: PNG });
  await expect(upload.getByText('bulgu.png')).toBeVisible();
  await upload.getByLabel('Açıklama').fill('Baretsiz çalışma');
  await shot(page, 'isg-upload');
  await upload.getByRole('button', { name: 'Yükle' }).click();

  await expect(page.getByText('1 dosya yüklendi')).toBeVisible();
  const [post] = backend.callsTo('/isg/issues/501/files/upload/', 'POST');
  expect(post!.authorization).toBe(`Bearer ${session.accessToken}`);
  expect(String(post!.body)).toContain('name="file_type"');
  expect(String(post!.body)).toContain('photo');
  expect(String(post!.body)).toContain('Baretsiz çalışma');

  // Back on the details, the new file is listed; open it in the viewer.
  await expect(details.getByRole('button', { name: 'bulgu.png', exact: true })).toBeVisible();
  await shot(page, 'isg-details');
  await details.getByRole('button', { name: 'bulgu.png', exact: true }).click();
  const viewer = page.getByRole('dialog', { name: 'bulgu.png' });
  await expect(viewer).toBeVisible();
  await expect(viewer.getByRole('img', { name: 'bulgu.png' })).toHaveAttribute(
    'src',
    UPLOADED_FILE.url,
  );
  await viewer.getByRole('button', { name: 'Yakınlaştır' }).click();
  await expect(viewer.getByText('%125')).toBeVisible();
  await shot(page, 'file-viewer');
  // ← goes to the previous file: the PDF, in the browser's own viewer.
  await page.keyboard.press('ArrowLeft');
  const pdf = page.getByRole('dialog', { name: 'Ölçüm raporu.pdf' });
  await expect(pdf.locator('iframe')).toHaveAttribute('src', EXISTING_FILE.url);
  await page.keyboard.press('Escape');
  await expect(pdf).toHaveCount(0);
  consoleErrors.expectNone();
});

const TOPIC_ROW = {
  id: 77,
  title: 'Kaynak fikstürü ölçüleri',
  topic_type: 'general',
  priority: 'high',
  priority_display: 'Yüksek',
  comment_count: 2,
  reply_count: 1,
  last_comment_by_me: false,
  last_comment_by: 'Caner Şahin',
  last_comment_excerpt: 'Ölçüler **teyit** edildi, !!sac kalınlığı!! bekleniyor',
  created_at: '2026-10-20T08:00:00+03:00',
  last_activity_at: '2026-11-02T09:15:00+03:00',
  source: {
    kind: 'job_order',
    label: '293-12',
    detail: 'COPPER PANEL',
    link: '/projects/project-tracking/?job=293-12',
  },
};

const TOPIC = {
  id: 77,
  title: 'Kaynak fikstürü ölçüleri',
  content: 'Fikstür ölçülerini **kontrol** edelim:\n- flanş delikleri\n- sac kalınlığı',
  attachments_data: [],
  mentioned_users_data: [],
  mentioned_groups_data: [],
};

const COMMENTS = [
  {
    id: 900,
    content: 'Ölçüler teyit edildi, !!sac kalınlığı!! bekleniyor @ayse',
    created_by_name: 'Caner Şahin',
    created_by_username: 'caner',
    created_at: '2026-11-02T09:15:00+03:00',
    mentioned_users_data: [{ username: 'ayse', full_name: 'Ayşe Yılmaz' }],
    attachments_data: [],
  },
];

test('Tartışmalarım: reply in place with a mention', async ({ page, consoleErrors }) => {
  const session = await seedSession(page, { admin: false });
  const backend = await mockBackend(
    page,
    {
      'GET /projects/my-discussions/topics/': { json: paginated([TOPIC_ROW]) },
      'GET /projects/my-discussions/summary/': {
        json: {
          topics: 1,
          comments: 3,
          total_topics: 1,
          total_comments: 3,
          types: [{ value: 'general', label: 'Genel', count: 1 }],
        },
      },
      'GET /projects/discussion-topics/77/': { json: TOPIC },
      'GET /projects/discussion-topics/77/comments/': ({ callIndex }) => ({
        json:
          callIndex === 0
            ? COMMENTS
            : [
                ...COMMENTS,
                {
                  id: 901,
                  content: 'Tamam @caner teşekkürler',
                  created_by_name: 'E2E Kullanıcı',
                  created_by_username: 'e2e.user',
                  created_at: '2026-11-02T10:00:00+03:00',
                  mentioned_users_data: [{ username: 'caner', full_name: 'Caner Şahin' }],
                  attachments_data: [],
                },
              ],
      }),
      'POST /projects/discussion-comments/': { status: 201, json: { id: 901, topic: 77 } },
      'GET /users/dropdown/': {
        json: [
          { id: 11, username: 'caner', full_name: 'Caner Şahin' },
          { id: 12, username: 'ayse', full_name: 'Ayşe Yılmaz' },
        ],
      },
      'GET /organization/groups/': {
        json: [{ id: 9, name: 'Planlama', display_name: 'Planlama', member_count: 4 }],
      },
    },
    { session },
  );

  await page.goto('/general/discussions/');
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { level: 1, name: 'Tartışmalarım' })).toBeVisible();
  const row = main.getByTestId('disc-row-77');
  await expect(row).toContainText('Yeni yanıt');
  await expect(row).toContainText('Ölçüler teyit edildi, sac kalınlığı bekleniyor');
  await shot(page, 'discussions');

  await row.getByRole('button', { name: 'Tartışmayı aç' }).click();
  const dialog = page.getByRole('dialog', { name: 'Kaynak fikstürü ölçüleri' });
  await expect(dialog.locator('strong', { hasText: 'kontrol' })).toBeVisible();
  await expect(dialog.locator('.rt-critical', { hasText: 'sac kalınlığı' })).toBeVisible();
  await expect(dialog.locator('.mention-badge', { hasText: '@Ayşe Yılmaz' })).toBeVisible();

  const editor = dialog.getByRole('textbox', { name: 'Yorum' });
  await editor.click();
  await page.keyboard.type('Tamam @can');
  const option = dialog.getByRole('option', { name: /Caner Şahin/ });
  await expect(option).toBeVisible();
  await shot(page, 'mention-suggestions');
  await page.keyboard.press('Enter');
  await expect(editor.locator('.mention-badge')).toHaveText('@Caner Şahin');
  await page.keyboard.type('teşekkürler');
  await dialog.getByRole('button', { name: 'Yorum Ekle' }).click();

  await expect(page.getByText('Yorum eklendi')).toBeVisible();
  const [post] = backend.callsTo('/projects/discussion-comments/', 'POST');
  expect(post!.body).toEqual({ topic: 77, content: 'Tamam @caner teşekkürler' });
  await expect(dialog.getByText('Yorumlar (2)')).toBeVisible();
  await expect(dialog.locator('.mention-badge', { hasText: '@Caner Şahin' })).toBeVisible();
  await expect(editor).toHaveText('');
  await shot(page, 'discussion-thread');
  consoleErrors.expectNone();
});
