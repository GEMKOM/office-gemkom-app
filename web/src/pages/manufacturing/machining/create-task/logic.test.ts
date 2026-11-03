import { emptyRow, FILTER_DEFAULTS, taskQuery, taskStatus, toPayload, validateRows } from './logic';

const row = (over = {}) => ({ ...emptyRow(), ...over });
const full = row({ name: 'Flanş', job_no: '254-01', quantity: '4', finish_time: '2026-11-20' });

describe('validateRows (legacy handleBulkCreateSave)', () => {
  it('lists every missing required field per row first', () => {
    expect(validateRows([full, row({ name: 'x' })])).toEqual({
      title: 'Lütfen aşağıdaki zorunlu alanları doldurun:',
      messages: ['Satır 2: İş No', 'Satır 2: Adet', 'Satır 2: Bitiş Tarihi'],
    });
  });

  it('then refuses a non-positive Adet', () => {
    expect(validateRows([{ ...full, quantity: '0' }])).toEqual({
      title: 'Lütfen aşağıdaki hataları düzeltin:',
      messages: ["Satır 1: Adet 0'dan büyük olmalıdır"],
    });
    expect(validateRows([full])).toBeNull();
  });
});

it('toPayload: optional fields become null, Adet an integer', () => {
  expect(toPayload([{ ...full, image_no: '', description: 'not' }])).toEqual([
    {
      name: 'Flanş',
      job_no: '254-01',
      image_no: null,
      position_no: null,
      quantity: 4,
      finish_time: '2026-11-20',
      description: 'not',
    },
  ]);
});

describe('taskQuery (legacy buildTaskQuery)', () => {
  it('always scopes to the creator; a bare number is a TI key', () => {
    expect(
      taskQuery({ ...FILTER_DEFAULTS, key: ' 42 ', has_timer: true }, 7, {
        sortBy: 'key',
        sortDir: 'asc',
      }),
    ).toMatchObject({
      created_by: 7,
      key: 'TI-42',
      has_timer: 'true',
      exceeded_estimated_hours: undefined,
      ordering: 'key',
      page: '1',
      page_size: '20',
    });
    expect(taskQuery(FILTER_DEFAULTS, 7, { sortBy: 'name', sortDir: 'desc' }).ordering).toBe(
      '-name',
    );
    expect(
      taskQuery({ ...FILTER_DEFAULTS, key: 'TI-9' }, 7, { sortBy: 'key', sortDir: 'asc' }).key,
    ).toBe('TI-9');
  });
});

it('taskStatus', () => {
  expect(taskStatus({ completion_date: '2026-01-01' }).label).toBe('Tamamlandı');
  expect(taskStatus({ total_hours_spent: '1.5' }).label).toBe('Çalışıldı');
  expect(taskStatus({}).label).toBe('Bekliyor');
});
