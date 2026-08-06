import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../sales/offers/offerList.js', import.meta.url), 'utf8');
const start = source.indexOf('function parsePasteNumber');
const end = source.indexOf('function showPastePricesModal', start);

assert.notEqual(start, -1, 'parsePasteNumber helper should exist');
assert.notEqual(end, -1, 'showPastePricesModal marker should exist');

const sandbox = {};
vm.runInNewContext(`
${source.slice(start, end)}
sandbox.parsePasteNumber = parsePasteNumber;
sandbox.guessPriceColumnRoles = guessPriceColumnRoles;
sandbox.buildPastePricesFromMapping = buildPastePricesFromMapping;
`, { sandbox });

const {
    parsePasteNumber,
    guessPriceColumnRoles,
    buildPastePricesFromMapping
} = sandbox;

assert.equal(parsePasteNumber('1.500,50'), 1500.5);
assert.equal(parsePasteNumber('12.345,67'), 12345.67);
assert.equal(parsePasteNumber('1,500.50'), 1500.5);
assert.equal(parsePasteNumber('1.500'), 1500);
assert.equal(parsePasteNumber('10,5'), 10.5);
assert.equal(parsePasteNumber('TBD'), null);

const roles = guessPriceColumnRoles([
    ['1.500,50', '2,5'],
    ['2.000,00', '3,0']
], 2);
assert.deepEqual(Array.from(roles.slice(0, 2)), ['unit_price', 'weight_kg']);

const mapped = buildPastePricesFromMapping([
    ['10'],
    ['TBD'],
    ['20']
], ['unit_price']);

assert.equal(mapped.rows.length, 3);
assert.equal(mapped.errors.length, 1);
assert.equal(mapped.errors[0].row, 2);
assert.equal(mapped.rows[2].unit_price, 20);

console.log('offerPastePrices tests passed');
