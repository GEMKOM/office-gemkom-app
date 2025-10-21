// Parser for bulk-pasted CNC part data
// Exports a single function: parsePartsFromText(text)

/**
 * Parse bulk-pasted text into structured part objects.
 * Expected block per part (blank lines may separate parts):
 * 1) First line: "<job_no>  <image_no> <position_no>"
 * 2) width like "373.70mm"
 * 3) height like "2180.00mm"
 * 4) area like "0.8147m²"
 * 5) weight like "51.16kg"
 * 6) material like "ST-37"
 * 7) thickness like "8.00mm"
 * 8) project or <none>
 * 9) requested_by (person) or <none>
 * 10) note or <none>
 * Some data may include copy indices like "(1)" which will be trimmed from position.
 */
export function parsePartsFromText(rawText) {
    if (!rawText || typeof rawText !== 'string') return [];

    const lines = rawText
        .split(/\r?\n/g)
        .map(l => l.trim())
        .filter(l => l.length > 0); // ignore blank lines entirely

    const parts = [];
    let i = 0;

    while (i < lines.length) {
        const header = lines[i];
        if (!header) { i++; continue; }

        const { job_no, image_no, position_no } = splitHeader(header);
        // If header could not be parsed, skip this line
        if (!job_no && !image_no && !position_no) { i++; continue; }

        const width = safeAt(lines, i + 1);
        const height = safeAt(lines, i + 2);
        const area = safeAt(lines, i + 3);
        const weight = safeAt(lines, i + 4);
        const material = safeAt(lines, i + 5);
        const thickness = safeAt(lines, i + 6);
        const project = safeAt(lines, i + 7);
        const requested_by = safeAt(lines, i + 8);
        const note = safeAt(lines, i + 9);

        parts.push({
            job_no,
            image_no,
            position_no,
            width_mm: parseNumberWithUnit(width, /mm$/i),
            height_mm: parseNumberWithUnit(height, /mm$/i),
            area_m2: parseNumberWithUnit(area, /m²|m2/i),
            weight_kg: parseNumberWithUnit(weight, /kg$/i),
            material: normalizeNone(material),
            thickness_mm: parseNumberWithUnit(thickness, /mm$/i),
            project: normalizeNone(project),
            requested_by: normalizeNone(requested_by),
            note: normalizeNone(note)
        });

        // Advance by 10 lines for the next block
        i += 10;
    }

    return parts;
}

function safeAt(arr, idx) {
    return idx < arr.length ? arr[idx] : '';
}

function normalizeNone(value) {
    if (!value) return '';
    const v = String(value).trim();
    if (v.toLowerCase() === '<none>' || v === '-') return '';
    return v;
}

function parseNumberWithUnit(text, unitRegex) {
    if (!text) return null;
    const cleaned = String(text).replace(/\s+/g, '');
    const numberPart = cleaned.replace(unitRegex, '');
    const value = parseFloat(numberPart.replace(',', '.'));
    return isFinite(value) ? value : null;
}

function splitHeader(headerLine) {
    if (!headerLine) return { job_no: '', image_no: '', position_no: '' };
    // Collapse multiple spaces to single
    const normalized = headerLine.replace(/\s+/g, ' ').trim();

    // Typical format: "RM262-01-01  2048 P102-04A" or "077-06 090001 P3 (1)"
    // Try to capture three main tokens: job, image, position (with optional copy index)
    const headerMatch = normalized.match(/^(\S+)\s+(\S+)\s+(.+)$/);
    if (!headerMatch) return { job_no: '', image_no: '', position_no: '' };

    const job_no = headerMatch[1] || '';
    const image_no = headerMatch[2] || '';
    let position_no = headerMatch[3] || '';

    // Remove copy index like "(1)" at the end and trim
    position_no = position_no.replace(/\(\d+\)$/, '').trim();

    return { job_no, image_no, position_no };
}

export default {
    parsePartsFromText
};



