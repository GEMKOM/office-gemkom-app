// ISO 3166-1 alpha-2 country codes (plus XK, Kosovo), named in Turkish by the
// browser's Intl data. The backend stores the two-letter code; '' = unknown.

const CODES = (
  'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ ' +
  'BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM ' +
  'DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS ' +
  'GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN ' +
  'KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ ' +
  'MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM ' +
  'PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV ' +
  'SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI ' +
  'VN VU WF WS XK YE YT ZA ZM ZW'
).split(' ');

let names: Intl.DisplayNames | null | undefined;

/** Turkish name of a country code ("DE" → "Almanya"); the code itself if unknown. */
export function countryName(code: string | null | undefined): string {
  if (!code) return '';
  if (names === undefined) {
    try {
      names = new Intl.DisplayNames(['tr'], { type: 'region' });
    } catch {
      names = null;
    }
  }
  try {
    return names?.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

let options: { value: string; label: string }[] | null = null;

/** Select options, Türkiye first, the rest by Turkish name. */
export function countryOptions(): { value: string; label: string }[] {
  if (!options) {
    const rest = CODES.filter((c) => c !== 'TR')
      .map((value) => ({ value, label: countryName(value) }))
      .sort((a, b) => a.label.localeCompare(b.label, 'tr'));
    options = [{ value: 'TR', label: countryName('TR') }, ...rest];
  }
  return options;
}
