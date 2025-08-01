import { backendBase } from "../base.js";
import { authedFetch } from "../authService.js";

export async function fetchTaskById(taskKey) {
    const res = await authedFetch(`${backendBase}/machining/tasks/${taskKey}/`);
    if (!res.ok) return null;
    const task = await res.json();
    return task;
}