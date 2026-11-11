import {
  TEMPLATE_PLACEHOLDERS,
  isValidMonthDay,
  nextOccurrence,
  renderTemplate,
  unknownPlaceholders,
  whenLabel,
} from './specialDayText';

describe('renderTemplate, like the backend render()', () => {
  const ctx = { first_name: 'Ayşe', years: 5 };

  it('fills plain placeholders and empties unknown ones', () => {
    expect(renderTemplate('{years}. yılınız kutlu olsun, {first_name}', ctx)).toBe(
      '5. yılınız kutlu olsun, Ayşe',
    );
    expect(renderTemplate('Merhaba {nickname}', ctx)).toBe('Merhaba ');
  });

  it('keeps doubled braces as literal braces', () => {
    expect(renderTemplate('{{first_name}} = {first_name}', ctx)).toBe('{first_name} = Ayşe');
  });

  it.each([
    'Açık { parantez',
    'Kapalı } parantez',
    'Boş {}',
    'Sıra {0}',
    'Alan {a.b}',
    'Biçim {years:>3}',
    'Dönüşüm {years!r}',
  ])('shows %s as written', (text) => {
    expect(renderTemplate(`${text} {first_name}`, ctx)).toBe(`${text} {first_name}`);
  });
});

it('names the placeholders a kind does not fill', () => {
  expect(
    unknownPlaceholders(
      '{first_name} {holiday_name} {{years}}',
      TEMPLATE_PLACEHOLDERS.work_anniversary,
    ),
  ).toEqual(['{holiday_name}']);
  expect(unknownPlaceholders('{years}', TEMPLATE_PLACEHOLDERS.work_anniversary)).toEqual([]);
});

it('checks a yearly day against a leap year', () => {
  expect(isValidMonthDay(2, 29)).toBe(true);
  expect(isValidMonthDay(2, 30)).toBe(false);
  expect(isValidMonthDay(4, 31)).toBe(false);
  expect(isValidMonthDay(13, 1)).toBe(false);
});

it('previews a yearly day on its next occurrence, a one-off on its date', () => {
  const today = '2026-11-11';
  expect(nextOccurrence({ month: 12, day: 31, date: null }, today)).toBe('2026-12-31');
  expect(nextOccurrence({ month: 11, day: 11, date: null }, today)).toBe('2026-11-11');
  expect(nextOccurrence({ month: 3, day: 1, date: null }, today)).toBe('2027-03-01');
  expect(nextOccurrence({ month: 2, day: 29, date: null }, today)).toBe('2028-02-29');
  expect(nextOccurrence({ month: null, day: null, date: '2027-05-04' }, today)).toBe('2027-05-04');
});

it('describes when a day falls', () => {
  expect(whenLabel({ month: 10, day: 29, date: null })).toBe('Her yıl 29 Ekim');
  expect(whenLabel({ month: null, day: null, date: '2026-12-15' })).toBe('15 Aralık 2026');
});
