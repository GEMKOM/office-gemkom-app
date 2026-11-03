import { detectColumnMapping, parseCsv, processRows } from './importItems';

describe('bulk import', () => {
  it('detects the sa_raporu columns and the job number', () => {
    const headers = ['STOK KODU', 'STOK İSMİ', 'İŞ KODU', 'TALEP MİKTARI', 'BİRİM', 'AÇIKLAMA-1'];
    const m = detectColumnMapping(headers, [['A1', 'Flanş', '254-01', '5', 'adet', 'x']]);
    expect(m).toMatchObject({ code: 0, name: 1, job_no: 2, quantity: 3, unit: 4 });
  });

  it('does not fail on a missing job number column (legacy ReferenceError)', () => {
    expect(() => detectColumnMapping(['Kod', 'İsim', 'Miktar', 'Birim'], [])).not.toThrow();
  });

  it('parses CSV with either separator', () => {
    expect(parseCsv('a;b\n"c";d\n\n')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
    expect(parseCsv('a,b')).toEqual([['a', 'b']]);
  });

  it('builds items, joins açıklama columns into specs and skips bad rows', () => {
    const headers = ['Kod', 'Ad', 'İş No', 'Miktar', 'Birim', 'Açıklama-1', 'Açıklama-2'];
    const rows = [
      ['A1', 'Flanş', '254-01', '2,5', 'kg', 'dövme', 'S235'],
      ['', 'Mil', '254-01', '1', 'adet', '', ''],
      ['B2', 'Pul', '254-02', '0', 'adet', '', ''],
    ];
    const result = processRows(rows, { code: 0, name: 1, job_no: 2, quantity: 3, unit: 4 }, headers);
    expect(result.items).toEqual([
      {
        code: 'A1',
        name: 'Flanş',
        job_no: '254-01',
        quantity: 2.5,
        unit: 'kg',
        specs: 'dövme | S235',
        specifications: 'dövme | S235',
        item_description: '',
      },
    ]);
    expect(result.errors).toEqual([
      'Satır 3: Stok kodu eksik - satır atlandı',
      'Satır 4: Geçersiz miktar değeri - satır atlandı',
    ]);
  });
});
