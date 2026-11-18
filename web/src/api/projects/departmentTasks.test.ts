import { QueryClient } from '@tanstack/react-query';
import { expect, it } from 'vitest';
import {
  departmentTaskKeys,
  patchTaskInCache,
  replaceTaskInCache,
  type DepartmentTask,
} from './departmentTasks';

// A hub's task count (a plain number) shares the ['departmentTasks', 'list']
// prefix with the task pages; editing a task after visiting the hub threw
// "Cannot read properties of undefined (reading 'some')".
function seeded() {
  const client = new QueryClient();
  const countKey = [...departmentTaskKeys.lists, 'count', { department: 'manufacturing' }];
  const pageKey = [...departmentTaskKeys.lists, { department: 'manufacturing' }];
  const task = { id: 7, title: 'LADLE', assigned_to: null } as unknown as DepartmentTask;
  client.setQueryData(countKey, 12);
  client.setQueryData(pageKey, { count: 1, next: null, previous: null, results: [task] });
  client.setQueryData([...departmentTaskKeys.subtasks, 'manufacturing', 1], [task]);
  return { client, countKey, pageKey };
}

it('patchTaskInCache updates task pages and leaves hub counts alone', () => {
  const { client, countKey, pageKey } = seeded();
  patchTaskInCache(client, 7, { assigned_to: 148, assigned_to_name: 'Gürol Özden' });
  expect(client.getQueryData(countKey)).toBe(12);
  expect(
    client.getQueryData<{ results: DepartmentTask[] }>(pageKey)?.results[0]?.assigned_to_name,
  ).toBe('Gürol Özden');
});

it('replaceTaskInCache skips hub counts too', () => {
  const { client, countKey } = seeded();
  const fresh = { id: 7, title: 'LADLE 2' } as unknown as DepartmentTask;
  expect(replaceTaskInCache(client, fresh)).toBe(true);
  expect(client.getQueryData(countKey)).toBe(12);
});
