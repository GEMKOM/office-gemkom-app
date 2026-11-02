import type { UserOption } from '@/api/reference/users';
import {
  blankRow,
  matchEmployeeFromPaste,
  normalizePersonName,
  parseExcelPaste,
  parsePastedDate,
  usersForRow,
  validateBulkRows,
} from './bulkPaste';

const USERS: UserOption[] = [
  { id: 1, username: 'ahmet.yilmaz', first_name: 'Ahmet', last_name: 'Yılmaz' },
  { id: 2, username: 'sukru', full_name: 'Şükrü Öztürk' },
  { id: 3, username: 'ali', full_name: 'Çelik, Ali' },
  { id: 4, username: 'ahmet.k', first_name: 'Ahmet', last_name: 'Kaya' },
];
const LEFT: UserOption = { id: 9, username: 'gitti', full_name: 'İsmail Gider', is_active: false };
const ALL = [...USERS, LEFT];
const JOBS = [
  { job_no: '270-01', title: 'Tank' },
  { job_no: 'AB-5', title: 'Kazan' },
];

describe('name matching (legacy matchEmployeeFromPaste)', () => {
  it('folds Turkish letters, case and spaces', () => {
    expect(normalizePersonName('  ŞÜKRÜ   Öztürk ')).toBe('sukru ozturk');
    expect(matchEmployeeFromPaste('sukru ozturk', USERS)?.id).toBe(2);
  });

  it('matches surname-first, comma names and usernames', () => {
    expect(matchEmployeeFromPaste('Yılmaz Ahmet', USERS)?.id).toBe(1);
    expect(matchEmployeeFromPaste('Ali Çelik', USERS)?.id).toBe(3);
    expect(matchEmployeeFromPaste('ahmet.yilmaz', USERS)?.id).toBe(1);
  });

  it('drops parenthesised parts and a BOM', () => {
    expect(matchEmployeeFromPaste('\uFEFFAhmet Kaya (ahmet.k)', USERS)?.id).toBe(4);
  });

  it('falls back to the longest containing variant, first user on ties', () => {
    // "ahmet" equals the first-name variant of user 1 exactly: first exact wins.
    expect(matchEmployeeFromPaste('Ahmet', USERS)?.id).toBe(1);
    // Contained in "ahmet kaya" (score 7) and in no longer variant.
    expect(matchEmployeeFromPaste('met kay', USERS)?.id).toBe(4);
    expect(matchEmployeeFromPaste('Zeynep', USERS)).toBeNull();
    expect(matchEmployeeFromPaste('  ', USERS)).toBeNull();
  });
});

describe('parseExcelPaste', () => {
  it('parses tab rows, skips the header, and explains failures', () => {
    const text = [
      'Çalışan\tİş No\tTarih\tSaat\tMesai Tipi\tAçıklama',
      'Ahmet Yılmaz\t270-01\t05.10.2026\t7,5\tFazla Mesai\tKaynak',
      'Sukru Ozturk\tab-5\t2026-10-06\t8\t2x',
      'İsmail Gider\t270-01\t06/10/2026\t4\tTatil',
      'Kimse\t999\tdün\t0',
      'eksik\tsatır',
    ].join('\n');
    const { rows, failed } = parseExcelPaste(text, USERS, ALL, JOBS);
    expect(rows.map((r) => ({ ...r, _key: undefined }))).toEqual([
      {
        employee: '1',
        employee_label: 'Ahmet Yılmaz (ahmet.yilmaz)',
        job_no: '270-01',
        date: '2026-10-05',
        hours: '7.5',
        overtime_type: 'after_hours',
        description: 'Kaynak',
      },
      {
        employee: '2',
        employee_label: 'Şükrü Öztürk (sukru)',
        // Listed spelling of a case-insensitive match.
        job_no: 'AB-5',
        date: '2026-10-06',
        hours: '8',
        overtime_type: 'holiday',
        description: '',
      },
      {
        // Only in the all-accounts list.
        employee: '9',
        employee_label: 'İsmail Gider (gitti)',
        job_no: '270-01',
        date: '2026-10-06',
        hours: '4',
        overtime_type: 'holiday',
        description: '',
      },
    ]);
    expect(failed).toEqual([
      {
        rowNumber: 5,
        employee: 'Kimse',
        job_no: '999',
        date: 'dün',
        hours: '0',
        reason: 'Çalışan bulunamadı, İş no listede yok, Saat geçersiz',
      },
      {
        rowNumber: 6,
        employee: 'eksik',
        job_no: 'satır',
        date: '',
        hours: '',
        reason: 'Sütun sayısı yetersiz',
      },
    ]);
  });

  it('reads comma-separated lines and defaults the overtime type to regular', () => {
    const { rows } = parseExcelPaste('Ahmet Kaya,270-01,2026-10-07,3', USERS, ALL, JOBS);
    expect(rows[0]).toMatchObject({ employee: '4', overtime_type: 'regular', hours: '3' });
  });

  it('reads day-first dates and keeps the local day', () => {
    expect(parsePastedDate('5.1.2026')).toBe('2026-01-05');
    expect(parsePastedDate('31/12/2026')).toBe('2026-12-31');
    expect(parsePastedDate('2026-02-03')).toBe('2026-02-03');
    expect(parsePastedDate('olmaz')).toBe('olmaz');
  });
});

describe('editor helpers', () => {
  it('adds a departed employee to their own row picker only', () => {
    expect(usersForRow({ employee: '' }, USERS, ALL)).toBe(USERS);
    expect(usersForRow({ employee: '2' }, USERS, ALL)).toBe(USERS);
    expect(usersForRow({ employee: '9' }, USERS, ALL).map((u) => u.id)).toEqual([1, 2, 3, 4, 9]);
  });

  it('lists missing required fields, then non-positive hours', () => {
    const empty = blankRow();
    expect(validateBulkRows([empty])).toEqual([
      'Lütfen aşağıdaki zorunlu alanları doldurun:',
      'Satır 1: Çalışan',
      'Satır 1: İş No',
      'Satır 1: Tarih',
      'Satır 1: Saat',
      'Satır 1: Mesai Tipi',
    ]);
    const row = {
      ...empty,
      employee: '1',
      job_no: '270-01',
      date: '2026-10-01',
      hours: '-1',
      overtime_type: 'regular',
    };
    expect(validateBulkRows([row])).toEqual([
      'Lütfen aşağıdaki hataları düzeltin:',
      "Satır 1: Saat 0'dan büyük olmalıdır",
    ]);
    expect(validateBulkRows([{ ...row, hours: '2' }])).toBeNull();
  });
});
