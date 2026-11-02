/**
 * The plan sheet's output language — Turkish everywhere in the app, English
 * on a plan-sheet page opened with lang=en (a PDF or a link for a foreign
 * customer). One switch for the whole module graph: the stand-alone page
 * sets it once before drawing; the meeting slide never touches it.
 *
 * Only what WE write is translated: labels, sentences, department names and
 * the standard task names below. Free text (job titles, subcontractor and
 * crew names, anything the sales team types) stays as entered.
 */

export const SHEET_LANGS = ['tr', 'en'];

let current = 'tr';

export function setSheetLang(lang) {
    current = lang === 'en' ? 'en' : 'tr';
}

export function sheetLang() {
    return current;
}

/** The Turkish text, or its English twin on an English sheet. */
export function tr(turkish, english) {
    return current === 'en' ? english : turkish;
}

const DEPARTMENTS_EN = {
    design: 'Design',
    planning: 'Planning',
    procurement: 'Procurement',
    manufacturing: 'Manufacturing',
    painting: 'Painting',
    logistics: 'Logistics',
};

/** A department's name from its key, falling back to what the API sent. */
export function departmentName(key, display) {
    if (current === 'en' && DEPARTMENTS_EN[key]) return DEPARTMENTS_EN[key];
    return display || key || '';
}

// Task names the templates create (and the department names as the API
// spells them): anything else is someone's own wording and stays as is.
const TITLES_EN = new Map(Object.entries({
    'dizayn': 'Design',
    'planlama': 'Planning',
    'satın alma': 'Procurement',
    'üretim': 'Manufacturing',
    'boya': 'Painting',
    'lojistik': 'Logistics',
    'talepler': 'Requests',
    'cnc kesim': 'CNC Cutting',
    'kesim': 'Cutting',
    'talaşlı imalat': 'Machining',
    'kaynaklı imalat': 'Welded Fabrication',
    'kaynak': 'Welding',
    'montaj': 'Assembly',
    'sevkiyat': 'Shipment',
    'kalite kontrol': 'Quality Control',
    'test': 'Test',
    'kumlama': 'Sandblasting',
    'galvaniz': 'Galvanizing',
    'paketleme': 'Packing',
    'nakliye': 'Transport',
    'teknik resim': 'Technical Drawings',
    'imalat resimleri': 'Fabrication Drawings',
    'malzeme': 'Materials',
}));

function fold(text) {
    return String(text || '').trim().toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ');
}

/** A standard task name in English; anything else unchanged. */
export function taskTitle(text) {
    if (current !== 'en' || !text) return text || '';
    return TITLES_EN.get(fold(text)) || text;
}

// The material classes the API names in a cause ("plaka", "boru/profil").
const MATERIALS_EN = {
    'plaka': 'plate', 'boru': 'pipe', 'profil': 'profile', 'kritik kalem': 'critical items',
    'satın alma': 'procurement', 'teslim': 'delivery', 'malzeme': 'material',
};

export function materialName(text) {
    if (current !== 'en' || !text) return text || '';
    return String(text).split('/').map(part => MATERIALS_EN[fold(part)] || part).join('/');
}

/** Number with the sheet's decimal mark. */
export function num(value, digits = 1) {
    return Number(value).toLocaleString(current === 'en' ? 'en-GB' : 'tr-TR',
        { minimumFractionDigits: 0, maximumFractionDigits: digits });
}

/** "%38" in Turkish, "38%" in English. */
export function pct(value) {
    return current === 'en' ? `${num(value, 0)}%` : `%${num(value, 0)}`;
}

/** Working days, unsigned: "12 iş günü" / "12 working days". */
export function wdText(value) {
    const n = Math.abs(Number(value));
    if (current !== 'en') return `${num(n)} iş günü`;
    return `${num(n)} working ${n === 1 ? 'day' : 'days'}`;
}

/** Locale for toLocaleDateString on the sheet. */
export function dateLocale() {
    return current === 'en' ? 'en-GB' : 'tr-TR';
}
