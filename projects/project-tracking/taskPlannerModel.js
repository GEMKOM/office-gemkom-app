/**
 * Görev Planlama — plan state for the project-tracking "Görev Ekle" modal.
 *
 * A *plan* is the list of NEW department tasks one job order gets when the
 * modal is saved. The modal keeps one plan per job order in the subtree and
 * sends all of them in a single request (POST /department-tasks/bulk_plan/).
 *
 * Rows point at each other by a stable `key`, never by array position: the
 * old modal stored parents and dependencies as indices and had to re-bind
 * them after every delete. Row shape:
 *
 *   { key, department, title, sequence, weight, task_type, description,
 *     parentKey: key | null, dependsOn: [key], templateId: id | null }
 *
 * No DOM in here, so it runs under node:
 *     node projects/project-tracking/taskPlannerModel.test.mjs
 */

let keyCounter = 0;

export function newRowKey() {
    keyCounter += 1;
    return `r${keyCounter}`;
}

const bySequence = (a, b) => (a.sequence || 0) - (b.sequence || 0);

/** Highest main-task sequence across the job's saved tasks and its plan. */
export function nextSequenceBase(rows, existingTasks = []) {
    let max = 0;
    existingTasks.forEach((t) => { max = Math.max(max, t.sequence || 0); });
    rows.forEach((r) => { if (!r.parentKey) max = Math.max(max, r.sequence || 0); });
    return max;
}

/**
 * Turn a template (GET /task-templates/{id}/ — main items with `children`
 * nested and `depends_on` as item ids) into fresh rows. Main rows are pushed
 * past `sequenceBase` so they line up after what the job already has.
 */
export function rowsFromTemplate(template, { sequenceBase = 0 } = {}) {
    const mains = (template?.items || [])
        .filter((item) => item.parent === null || item.parent === undefined)
        .slice()
        .sort(bySequence);
    const keyByItemId = new Map(mains.map((item) => [item.id, newRowKey()]));
    const rows = [];

    mains.forEach((item, index) => {
        const key = keyByItemId.get(item.id);
        rows.push({
            key,
            department: item.department,
            title: item.title || '',
            sequence: sequenceBase + (item.sequence || index + 1),
            weight: item.weight || 10,
            task_type: item.task_type || null,
            description: item.description || '',
            parentKey: null,
            dependsOn: (item.depends_on || []).map((id) => keyByItemId.get(id)).filter(Boolean),
            templateId: template.id,
        });
        (item.children || []).slice().sort(bySequence).forEach((child, childIndex) => {
            rows.push({
                key: newRowKey(),
                department: item.department,
                title: child.title || '',
                sequence: child.sequence || childIndex + 1,
                weight: child.weight || 10,
                task_type: child.task_type || null,
                description: child.description || '',
                parentKey: key,
                dependsOn: [],
                templateId: template.id,
            });
        });
    });
    return rows;
}

/** Copy rows with fresh keys (parent / dependency links follow along). */
export function cloneRows(rows, { sequenceBase = 0 } = {}) {
    const keyMap = new Map(rows.map((r) => [r.key, newRowKey()]));
    const mainSeqs = rows.filter((r) => !r.parentKey).map((r) => r.sequence || 0);
    const shift = sequenceBase - (mainSeqs.length ? Math.min(...mainSeqs) - 1 : 0);
    return rows.map((r) => ({
        ...r,
        key: keyMap.get(r.key),
        sequence: r.parentKey ? r.sequence : Math.max(1, (r.sequence || 0) + shift),
        parentKey: r.parentKey ? keyMap.get(r.parentKey) || null : null,
        dependsOn: (r.dependsOn || []).map((k) => keyMap.get(k)).filter(Boolean),
    }));
}

export function newMainRow(rows, existingTasks, department, departmentLabel) {
    return {
        key: newRowKey(),
        department,
        title: departmentLabel || '',
        sequence: nextSequenceBase(rows, existingTasks) + 1,
        weight: 10,
        task_type: null,
        description: '',
        parentKey: null,
        dependsOn: [],
        templateId: null,
    };
}

export function newSubRow(rows, parentKey) {
    const parent = rows.find((r) => r.key === parentKey);
    const siblings = rows.filter((r) => r.parentKey === parentKey);
    return {
        key: newRowKey(),
        department: parent ? parent.department : '',
        title: '',
        sequence: siblings.reduce((max, r) => Math.max(max, r.sequence || 0), 0) + 1,
        weight: 10,
        task_type: null,
        description: '',
        parentKey,
        dependsOn: [],
        templateId: parent ? parent.templateId : null,
    };
}

/** Drop a row and everything under it; scrub it from other rows' dependencies. */
export function removeRow(rows, key) {
    const doomed = new Set([key]);
    let grew = true;
    while (grew) {
        grew = false;
        rows.forEach((r) => {
            if (r.parentKey && doomed.has(r.parentKey) && !doomed.has(r.key)) {
                doomed.add(r.key);
                grew = true;
            }
        });
    }
    return rows
        .filter((r) => !doomed.has(r.key))
        .map((r) => {
            const dependsOn = (r.dependsOn || []).filter((k) => !doomed.has(k));
            return dependsOn.length === (r.dependsOn || []).length ? r : { ...r, dependsOn };
        });
}

/** A subtask always belongs to its parent's department (the backend enforces it too). */
export function setRowDepartment(rows, key, department) {
    const descendants = new Set([key]);
    let grew = true;
    while (grew) {
        grew = false;
        rows.forEach((r) => {
            if (r.parentKey && descendants.has(r.parentKey) && !descendants.has(r.key)) {
                descendants.add(r.key);
                grew = true;
            }
        });
    }
    return rows.map((r) => (descendants.has(r.key) ? { ...r, department } : r));
}

/** Mains by sequence, each followed by its subtasks (depth-first). Stable. */
export function displayOrder(rows) {
    const childrenOf = new Map();
    rows.forEach((r, index) => {
        const bucket = r.parentKey || '';
        if (!childrenOf.has(bucket)) childrenOf.set(bucket, []);
        childrenOf.get(bucket).push({ r, index });
    });
    const out = [];
    const walk = (parentKey, depth) => {
        const kids = (childrenOf.get(parentKey) || [])
            .slice()
            .sort((a, b) => bySequence(a.r, b.r) || a.index - b.index);
        kids.forEach(({ r }) => {
            out.push({ row: r, depth });
            walk(r.key, depth + 1);
        });
    };
    walk('', 0);
    return out;
}

export function planHasTemplate(rows, templateId) {
    return rows.some((r) => String(r.templateId) === String(templateId));
}

/** Problems that would make the save fail, phrased for the user. */
export function validatePlan(rows) {
    const problems = [];
    rows.forEach((r) => {
        if (!r.parentKey && !r.department) problems.push({ key: r.key, message: 'Departman seçilmedi' });
        if (r.parentKey && !(r.title || '').trim()) problems.push({ key: r.key, message: 'Alt görev başlığı boş' });
        const weight = Number(r.weight);
        if (!Number.isInteger(weight) || weight < 1) problems.push({ key: r.key, message: 'Ağırlık en az 1 olmalı' });
    });
    return problems;
}

/**
 * Build the bulk_plan request body. `plans` is a Map job_no → rows; `order`
 * is the job list order so the payload (and any error) follows the tree.
 */
export function buildBulkPlanPayload(plans, order) {
    const out = [];
    order.forEach((jobNo) => {
        const rows = plans.get(jobNo) || [];
        if (rows.length === 0) return;
        const tempId = new Map(rows.map((r, i) => [r.key, -(i + 1)]));
        const tasks = rows.map((r) => {
            const task = {
                temp_id: tempId.get(r.key),
                department: r.department,
                title: (r.title || '').trim(),
                sequence: parseInt(r.sequence, 10) || 1,
                weight: parseInt(r.weight, 10) || 10,
            };
            if (r.parentKey && tempId.has(r.parentKey)) task.parent = tempId.get(r.parentKey);
            if (r.task_type) task.task_type = r.task_type;
            if (r.description) task.description = r.description;
            return task;
        });
        const dependencies = rows
            .map((r) => ({
                task: tempId.get(r.key),
                depends_on: (r.dependsOn || []).filter((k) => tempId.has(k) && k !== r.key).map((k) => tempId.get(k)),
            }))
            .filter((d) => d.depends_on.length > 0);
        out.push({ job_order: jobNo, tasks, dependencies });
    });
    return { plans: out };
}

export function summarizePlans(plans) {
    let jobCount = 0;
    let taskCount = 0;
    plans.forEach((rows) => {
        if (rows.length > 0) {
            jobCount += 1;
            taskCount += rows.length;
        }
    });
    return { jobCount, taskCount };
}

/** temp_id from a bulk_plan error → the row key it came from. */
export function rowKeyForTempId(rows, tempId) {
    const index = -tempId - 1;
    return rows[index] ? rows[index].key : null;
}
