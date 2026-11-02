import { cleanParams, type QueryParams } from './client';

/**
 * Query keys: [resource, scope, params?]. `qk.x.all` is the prefix to pass to
 * invalidateQueries after a mutation. Params go through cleanParams so that
 * `{ search: '' }` and `{}` hit the same cache entry, matching the request.
 */
function resource<R extends string>(name: R) {
  return {
    all: [name] as const,
    list: (params: QueryParams = {}) => [name, 'list', cleanParams(params)] as const,
    detail: (id: string | number) => [name, 'detail', String(id)] as const,
  };
}

export const qk = {
  users: resource('users'),
  teams: resource('teams'),
  customers: resource('customers'),
  machines: resource('machines'),
  jobOrders: {
    ...resource('jobOrders'),
    options: (params: QueryParams = {}) => ['jobOrders', 'options', cleanParams(params)] as const,
  },
} as const;
