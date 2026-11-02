import { asJobNos, resolveSaveJobNos } from './laborPricingSelection';

// Ported from laborPricingSelection.test.mjs (which jobs Parametreleri Kaydet persists onto).

describe('laborPricingSelection', () => {
  it('multi-select dropdown value is the job list', () => {
    expect(asJobNos(['240-01', '240-02'])).toEqual(['240-01', '240-02']);
  });

  it('empty dropdown is empty, not a leftover string', () => {
    expect(asJobNos([])).toEqual([]);
    expect(asJobNos('')).toEqual([]);
    expect(asJobNos(null)).toEqual([]);
    expect(asJobNos(undefined)).toEqual([]);
  });

  it('save follows the live dropdown, not the last Hesapla selection', () => {
    expect(
      resolveSaveJobNos({ filterJobNos: ['240-02'], computedJobNos: ['240-01', '240-02'] }),
    ).toEqual(['240-02']);
  });

  it('clearing the dropdown does not fall back to the last compute', () => {
    expect(resolveSaveJobNos({ filterJobNos: [], computedJobNos: ['240-01'] })).toEqual([]);
  });

  it('save after adding a job without Hesapla includes the new job', () => {
    expect(
      resolveSaveJobNos({ filterJobNos: ['240-01', '240-02'], computedJobNos: ['240-01'] }),
    ).toEqual(['240-01', '240-02']);
  });
});
