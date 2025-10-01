import { backendBase } from "../base.js";
import { authedFetch } from "../authService.js";

export async function fetchTaskById(taskKey) {
    const res = await authedFetch(`${backendBase}/machining/tasks/${taskKey}/`);
    if (!res.ok) return null;
    const task = await res.json();
    return task;
}

export async function fetchTasks(query) {
    const url = `${backendBase}/machining/tasks/${query}`;
    const resp = await authedFetch(url);
    return resp;
}

export async function deleteTask(taskKey) {
    const url = `${backendBase}/machining/tasks/${taskKey}/`;
    const resp = await authedFetch(url, {
        method: 'DELETE',
    });
    return resp;
}

export async function createTask(task) {
    const url = `${backendBase}/machining/tasks/`;
    const resp = await authedFetch(url, {
        method: 'POST',
        body: JSON.stringify(task),
    });
    return resp;
}

export async function updateTask(taskKey, task) {
    const url = `${backendBase}/machining/tasks/${taskKey}/`;
    const resp = await authedFetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(task),
    });
    return resp;
}

export async function markTaskCompleted(taskKey) {
    const url = `${backendBase}/machining/tasks/mark-completed/`;
    const resp = await authedFetch(url, {
        method: 'POST',
        body: JSON.stringify({ key: taskKey }),
    });
    return resp;
}

export async function unmarkTaskCompleted(taskKey) {
    const url = `${backendBase}/machining/tasks/unmark-completed/`;
    const resp = await authedFetch(url, {
        method: 'POST',
        body: JSON.stringify({ key: taskKey }),
    });
    return resp;
}

export async function fetchHoldTasks() {
    const url = `${backendBase}/machining/hold-tasks/`;
    const resp = await authedFetch(url);
    return resp;
}

export async function bulkCreateTasks(tasks) {
    const url = `${backendBase}/machining/tasks/bulk-create/`;
    const resp = await authedFetch(url, {
        method: 'POST',
        body: JSON.stringify(tasks),
    });
    return resp;
}
