import { ACTION_SUGGESTIONS, actionSuggestionsFor } from './NeoChat';

vi.mock('@/auth/authService', () => ({ authedFetch: vi.fn() }));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));

it('offers everyone the common openers, and planning / purchasing ones only to those sections', () => {
  expect(actionSuggestionsFor(() => false)).toEqual(ACTION_SUGGESTIONS);
  const planner = actionSuggestionsFor((section) => section === 'planning');
  expect(planner).toContain('Planlama talebi oluşturmak istiyorum');
  expect(planner).not.toContain('Hazır planlama talebinden satın alma talebi aç');
  const buyer = actionSuggestionsFor((section) => section === 'procurement');
  expect(buyer).toContain('Hazır planlama talebinden satın alma talebi aç');
});
