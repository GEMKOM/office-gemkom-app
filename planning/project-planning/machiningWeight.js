/**
 * Talaşlı İmalat weight on the planning sheet.
 *
 * A job can carry more than one machining department task. The sheet
 * prints each as its own row (same pattern as Kesim). Edits and the
 * bulk-save payload must key off that row's task_id — the first task
 * is only the weight-share input for İmalat duration / plan windows.
 */

export function machiningVm(machining, jobNo) {
    return {
        task_id: machining.task_id,
        weight: machining.weight ?? null,
        status: machining.status,
        job_no: jobNo,
    };
}

export function indexMachining(jobInfo) {
    const machiningByJob = {};
    const machiningByTask = {};
    Object.entries(jobInfo || {}).forEach(([jobNo, info]) => {
        (info.machining || []).forEach((machining, i) => {
            if (!machining || machining.task_id == null) return;
            const vm = machiningVm(machining, jobNo);
            machiningByTask[machining.task_id] = vm;
            if (i === 0) machiningByJob[jobNo] = vm;
        });
    });
    return { machiningByJob, machiningByTask };
}

export function machiningWeightItems(dirtyMachining, machiningByTask) {
    const items = [];
    dirtyMachining.forEach((fields, taskId) => {
        const vm = machiningByTask[taskId];
        if (!vm || !fields.has('weight') || vm.weight == null) return;
        items.push({ task_id: vm.task_id, weight: vm.weight });
    });
    return items;
}
