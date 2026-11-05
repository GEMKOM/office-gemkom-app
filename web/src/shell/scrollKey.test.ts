import { beforeEach, expect, it } from 'vitest';
import { resetScrollKeys, scrollKey } from './scrollKey';

beforeEach(resetScrollKeys);

it('a query-only change keeps the key, so the scroll position stays', () => {
  const first = scrollKey({ key: 'a', pathname: '/planning/department-requests' });
  expect(scrollKey({ key: 'b', pathname: '/planning/department-requests/' })).toBe(first);
  expect(scrollKey({ key: 'c', pathname: '/planning/department-requests' })).toBe(first);
});

it('another page gets a new key; coming back to the first page by a link does too', () => {
  const list = scrollKey({ key: 'a', pathname: '/sales/offers' });
  const other = scrollKey({ key: 'b', pathname: '/sales/customers' });
  expect(other).not.toBe(list);
  const again = scrollKey({ key: 'c', pathname: '/sales/offers' });
  expect(again).not.toBe(list);
  expect(again).not.toBe(other);
});

it("Back to an earlier entry finds that entry's key", () => {
  const list = scrollKey({ key: 'a', pathname: '/sales/offers' });
  scrollKey({ key: 'b', pathname: '/sales/offers' });
  scrollKey({ key: 'c', pathname: '/sales/customers' });
  expect(scrollKey({ key: 'b', pathname: '/sales/offers' })).toBe(list);
});
