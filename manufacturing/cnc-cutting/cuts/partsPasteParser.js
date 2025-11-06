// Parser for bulk-pasted CNC part data
// Exports a single function: parsePartsFromText(text)

/**
 * Parse bulk-pasted text into structured part objects.
 * Expects Excel copy-paste format with column headers:
 * - First line contains column headers
 * - Subsequent lines contain data rows (tab-separated)
 * - Uses "Part" column (split by space for job_no, image_no, position_no)
 * - Uses "Weight" column for weight
 */
export function parsePartsFromText(rawText) {
    if (!rawText || typeof rawText !== 'string') return [];

    // Split lines but preserve leading/trailing structure for tab-separated data
    const allLines = rawText.split(/\r?\n/g);
    const lines = [];
    
    for (const line of allLines) {
        const trimmed = line.trim();
        if (trimmed.length > 0) {
            // For tab-separated data, preserve the original line structure
            // For space-separated data, use trimmed version
            if (line.includes('\t')) {
                lines.push(line); // Keep original to preserve tab positions
            } else {
                lines.push(trimmed);
            }
        }
    }

    if (lines.length < 2) return []; // Need at least header + 1 data row

    // Parse header row - split by tab (Excel default) or multiple spaces
    const headerLine = lines[0];
    const headers = splitRow(headerLine);
    
    // Find column indices - use exact match for "Weight" (case-insensitive)
    const partColIndex = findColumnIndex(headers, ['part']);
    const weightColIndex = findColumnIndex(headers, ['weight']);
    const nestedColIndex = findColumnIndex(headers, ['nested']);

    if (partColIndex === -1) {
        // If no "Part" column found, return empty array
        return [];
    }

    const parts = [];

    // Process data rows (skip header row)
    for (let i = 1; i < lines.length; i++) {
        const rowLine = lines[i];
        if (!rowLine || rowLine.trim().length === 0) continue;

        // Skip if this row looks like a header row (contains column names)
        const rowLower = rowLine.toLowerCase();
        if (rowLower.includes('geometry') && rowLower.includes('part') && rowLower.includes('weight')) {
            continue; // Skip header-like rows
        }

        let row = splitRow(rowLine);
        if (row.length === 0) continue;

        // Extract Part column value - handle misalignment
        let partValue = (row[partColIndex] || '').trim();
        
        // If Part column is empty at expected index, search all cells for a Part-like value
        // This handles cases where columns are misaligned due to empty leading cells
        if (!partValue || partValue.toLowerCase() === 'part') {
            // Search all cells for a value that looks like a Part (has spaces, pattern: job_no image_no position_no)
            for (let j = 0; j < row.length; j++) {
                const cellValue = (row[j] || '').trim();
                if (cellValue && cellValue.toLowerCase() !== 'part' && cellValue.includes(' ')) {
                    const parts = cellValue.split(/\s+/).filter(p => p.length > 0);
                    // If it has 2+ space-separated parts, it's likely a Part value
                    // Pattern: "114-09 0124 P8-B" or similar
                    if (parts.length >= 2) {
                        partValue = cellValue;
                        // Update the row so Part value is at correct index
                        if (j !== partColIndex) {
                            row[partColIndex] = cellValue;
                        }
                        break;
                    }
                }
            }
        }

        // Skip if we still don't have a Part value
        if (!partValue || partValue.toLowerCase() === 'part') continue;

        // Skip if row doesn't have enough columns (after potential adjustment)
        if (row.length <= partColIndex) continue;

        // Split the Part column value
        const { job_no, image_no, position_no } = splitPartColumn(partValue);

        // Extract Weight column (if available)
        let weight_kg = null;
        if (weightColIndex >= 0 && row.length > weightColIndex) {
            const weightValue = row[weightColIndex] || '';
            if (weightValue && weightValue.toLowerCase() !== 'weight') {
                weight_kg = parseWeight(weightValue);
            }
        }

        // Extract Nested column (quantity) (if available)
        let quantity = null;
        if (nestedColIndex >= 0 && row.length > nestedColIndex) {
            const nestedValue = row[nestedColIndex] || '';
            if (nestedValue && nestedValue.toLowerCase() !== 'nested') {
                const parsed = parseInt(nestedValue, 10);
                quantity = isFinite(parsed) ? parsed : null;
            }
        }

        // Only add if we have at least job_no or position info
        if (job_no || image_no || position_no) {
            parts.push({
                job_no: job_no || '',
                image_no: image_no || '',
                position_no: position_no || '',
                weight_kg: weight_kg,
                quantity: quantity
            });
        }
    }

    return parts;
}

/**
 * Split a row by tab (preferred) or multiple spaces
 */
function splitRow(line) {
    if (!line) return [];
    
    // First try tab-separated (Excel default)
    if (line.includes('\t')) {
        // Split by tab and preserve empty cells (don't filter them out)
        // Important: Don't trim the line first, as it may have leading tabs for empty first columns
        const cells = line.split('\t');
        // Trim each cell but preserve the array structure (including empty cells)
        return cells.map(cell => (cell || '').trim());
    }
    
    // Fall back to splitting by multiple spaces (2+ spaces)
    // This handles cases where tabs were converted to spaces
    const trimmed = line.trim();
    return trimmed.split(/\s{2,}/).map(cell => (cell || '').trim());
}

/**
 * Find column index by name (case-insensitive, exact match preferred, then partial match)
 */
function findColumnIndex(headers, possibleNames) {
    // First try exact match
    for (let i = 0; i < headers.length; i++) {
        const header = headers[i].toLowerCase().trim();
        for (const name of possibleNames) {
            if (header === name.toLowerCase()) {
                return i;
            }
        }
    }
    // Then try partial match
    for (let i = 0; i < headers.length; i++) {
        const header = headers[i].toLowerCase().trim();
        for (const name of possibleNames) {
            if (header.includes(name.toLowerCase())) {
                return i;
            }
        }
    }
    return -1;
}

/**
 * Split Part column value by space into job_no, image_no, position_no
 * Format: "114-09 0124 P8-B" -> job_no: "114-09", image_no: "0124", position_no: "P8-B"
 * Takes first, second, and third space-separated parts respectively
 */
function splitPartColumn(partValue) {
    // Initialize defaults
    let job_no = '';
    let image_no = '';
    let position_no = '';

    if (!partValue || typeof partValue !== 'string') {
        return { job_no, image_no, position_no };
    }

    const normalized = partValue.trim();
    if (!normalized) {
        return { job_no, image_no, position_no };
    }

    // Split by any whitespace (space, tab, etc.) and filter out empty strings
    const parts = normalized.split(/\s+/).filter(p => p && p.length > 0);
    
    if (parts.length === 0) {
        return { job_no, image_no, position_no };
    }

    // First part is job_no
    if (parts.length >= 1) {
        job_no = String(parts[0]).trim();
    }
    
    // Second part is image_no
    if (parts.length >= 2) {
        image_no = String(parts[1]).trim();
    }
    
    // Third part is position_no (only take the third part, not beyond)
    if (parts.length >= 3) {
        position_no = String(parts[2]).trim();
    }

    return { job_no, image_no, position_no };
}

/**
 * Parse weight value - handles formats like "38.33kg", "38.33 kg", "38.33", etc.
 */
function parseWeight(weightText) {
    if (!weightText || typeof weightText !== 'string') return null;
    
    // Remove all whitespace
    const cleaned = String(weightText).replace(/\s+/g, '').trim();
    if (!cleaned) return null;
    
    // Remove "kg" suffix if present (case-insensitive)
    const numberPart = cleaned.replace(/kg$/i, '');
    
    // Replace comma with dot for decimal parsing
    const value = parseFloat(numberPart.replace(',', '.'));
    return isFinite(value) ? value : null;
}

export default {
    parsePartsFromText
};
