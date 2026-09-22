import assert from 'node:assert/strict';
import test from 'node:test';

import { canRederiveForecast, forecastRemainingWd } from './forecastLayout.js';

test('a measured row costs what its own tempo says', () => {
    // 009-37's 825 kg team: started 30.08, 17 working days to today, %50.
    // The engine says 17 wd left (-> 15.10); the board must say the same.
    assert.equal(forecastRemainingWd(50, 17, 10), 17);
});

test('LESS progress means MORE work left, never less', () => {
    const at50 = forecastRemainingWd(50, 17, 10);
    const at40 = forecastRemainingWd(40, 17, 10);
    assert.ok(at40 > at50, `${at40} should exceed ${at50}`);
    assert.equal(at40, 25.5);
});

test('an overdue row is not declared finished today', () => {
    // The old rule took the earlier of the entered budget (10 g from 30.08,
    // long past) and the share from today, then floored at today — so a row
    // 40 % done reported "bitti bugün".
    assert.ok(forecastRemainingWd(40, 17, 10) > 1);
});

test('the entered duration is not a ceiling once there is tempo', () => {
    // 5 wd spent for 10 % of a row budgeted at 4 wd: the measurement wins.
    assert.equal(forecastRemainingWd(10, 5, 4), 45);
});

test('a row that has not started yet falls back to its duration share', () => {
    assert.equal(forecastRemainingWd(25, 0, 8), 6);
});

test('a row ahead of its budget finishes sooner', () => {
    assert.ok(forecastRemainingWd(90, 2, 10) < 1);
});

test('only a tempo-driven row may be re-derived on the board', () => {
    assert.equal(canRederiveForecast('rate'), true);
    assert.equal(canRederiveForecast(null), true);      // no engine opinion
    // Material wait, gate, floor, predecessor, ancestor share: the board
    // cannot see what decided these, so it must keep the engine's date.
    for (const kind of ['duration', 'start', 'gate', 'floored', 'push',
                        'subtasks', 'parent_duration', 'weight', 'chained',
                        'coupled', 'plan', 'parent_window', 'actual']) {
        assert.equal(canRederiveForecast(kind), false, kind);
    }
});

test('a window is never zero-length', () => {
    assert.equal(forecastRemainingWd(99.9, 0.01, 0), 0.1);
    assert.equal(forecastRemainingWd(100, 10, 10), 0.1);
});
