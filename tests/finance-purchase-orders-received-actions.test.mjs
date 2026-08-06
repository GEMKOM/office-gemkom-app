import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sourcePath = resolve(__dirname, '../finance/purchase-orders/purchase-orders.js');
const source = readFileSync(sourcePath, 'utf8');

const helperMatch = source.match(/function canMutateExpectedReceiptRow\(row\) \{[\s\S]*?\n\}/);
assert.ok(helperMatch, 'canMutateExpectedReceiptRow helper should exist');

const canMutateExpectedReceiptRow = Function(`"use strict"; ${helperMatch[0]}; return canMutateExpectedReceiptRow;`)();

assert.equal(
    canMutateExpectedReceiptRow({ source: 'expected_receipt', editable: true, is_received: false }),
    true,
    'pending editable expected receipts should remain mutable'
);
assert.equal(
    canMutateExpectedReceiptRow({ source: 'expected_receipt', editable: true, is_received: true }),
    false,
    'received expected receipts must not expose mutation actions'
);
assert.equal(
    canMutateExpectedReceiptRow({ source: 'expected_receipt', editable: false, is_received: false }),
    false,
    'non-editable expected receipts should remain immutable'
);
assert.equal(
    canMutateExpectedReceiptRow({ source: 'sales_offer', editable: true, is_received: false }),
    false,
    'sales-offer rows should not use expected-receipt mutation actions'
);

assert.match(
    source,
    /confirmCancelExpectedReceipt\(row\.receipt_id, row\.title, row\)/,
    'cancel action should pass the row state into the guard'
);
assert.match(
    source,
    /function confirmCancelExpectedReceipt\(receiptId, title, row = null\) \{[\s\S]*?row\?\.is_received[\s\S]*?return;/,
    'cancel handler should reject received rows before opening confirmation'
);
assert.match(
    source,
    /function openEditExpectedReceiptInstallmentModal\(row\) \{[\s\S]*?row\?\.is_received[\s\S]*?return;/,
    'installment edit handler should reject received rows'
);

console.log('finance expected-receipt received action guards passed');
