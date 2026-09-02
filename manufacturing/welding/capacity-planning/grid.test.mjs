import { optionsWithCurrentValue } from './grid.js';
import assert from 'node:assert/strict';

const editable = [
    { value: 'pending', label: 'Başlamadı' },
    { value: 'in_progress', label: 'Devam Ediyor' },
    { value: 'completed', label: 'Tamamlandı' },
];

{
    const opts = optionsWithCurrentValue(editable, 'blocked');
    assert.equal(opts[0].value, 'blocked');
    assert.equal(opts.length, editable.length + 1);
    assert.equal(opts[1].value, 'pending');
}

{
    const opts = optionsWithCurrentValue(editable, 'pending');
    assert.equal(opts.length, editable.length);
    assert.equal(opts[0].value, 'pending');
}

{
    const opts = optionsWithCurrentValue(editable, '');
    assert.equal(opts.length, editable.length);
}

{
    const opts = optionsWithCurrentValue(undefined, 'skipped');
    assert.equal(opts.length, 1);
    assert.equal(opts[0].value, 'skipped');
}

console.log('grid.test.mjs: ok');
