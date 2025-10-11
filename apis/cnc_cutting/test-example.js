/**
 * Example usage of CNC Cutting CRUD endpoints
 * This file demonstrates how to use the CNC cutting API functions
 */

import {
    getCncTasks,
    getCncTask,
    createCncTask,
    updateCncTask,
    deleteCncTask,
    createCncPart,
    updateCncPart,
    deleteCncPart,
    formatCncTaskForDisplay,
    validateCncTaskData,
    validateCncPartData
} from './crud.js';

/**
 * Example: Get all CNC tasks
 */
async function exampleGetAllTasks() {
    try {
        console.log('Fetching all CNC tasks...');
        const tasks = await getCncTasks();
        console.log('CNC Tasks:', tasks);
        return tasks;
    } catch (error) {
        console.error('Error fetching tasks:', error);
    }
}

/**
 * Example: Get a specific CNC task
 */
async function exampleGetTask(taskId) {
    try {
        console.log(`Fetching CNC task ${taskId}...`);
        const task = await getCncTask(taskId);
        console.log('CNC Task:', task);
        return task;
    } catch (error) {
        console.error('Error fetching task:', error);
    }
}

/**
 * Example: Create a new CNC task
 */
async function exampleCreateTask() {
    try {
        console.log('Creating new CNC task...');
        
        const taskData = {
            name: 'Sample CNC Task',
            nesting_id: 'NEST-001',
            material: 'Steel',
            dimensions: '100x50x10',
            thickness_mm: 10,
            parts_data: [
                {
                    job_no: 'JOB-001',
                    image_no: 'IMG-001',
                    position_no: 'POS-001',
                    weight_kg: 2.5
                },
                {
                    job_no: 'JOB-002',
                    image_no: 'IMG-002',
                    position_no: 'POS-002',
                    weight_kg: 1.8
                }
            ]
        };
        
        // Validate data before creating
        const validation = validateCncTaskData(taskData);
        if (!validation.isValid) {
            console.error('Validation errors:', validation.errors);
            return;
        }
        
        const newTask = await createCncTask(taskData);
        console.log('Created CNC Task:', newTask);
        return newTask;
    } catch (error) {
        console.error('Error creating task:', error);
    }
}

/**
 * Example: Create a CNC task with file upload
 */
async function exampleCreateTaskWithFile(fileInput) {
    try {
        console.log('Creating CNC task with file upload...');
        
        const file = fileInput.files[0];
        if (!file) {
            console.error('No file selected');
            return;
        }
        
        const taskData = {
            name: 'CNC Task with File',
            nesting_id: 'NEST-002',
            material: 'Aluminum',
            dimensions: '200x100x15',
            thickness_mm: 15,
            nesting_file: file
        };
        
        const newTask = await createCncTask(taskData);
        console.log('Created CNC Task with file:', newTask);
        return newTask;
    } catch (error) {
        console.error('Error creating task with file:', error);
    }
}

/**
 * Example: Update a CNC task
 */
async function exampleUpdateTask(taskId) {
    try {
        console.log(`Updating CNC task ${taskId}...`);
        
        const updateData = {
            name: 'Updated CNC Task Name',
            material: 'Updated Material',
            thickness_mm: 12
        };
        
        const updatedTask = await updateCncTask(taskId, updateData);
        console.log('Updated CNC Task:', updatedTask);
        return updatedTask;
    } catch (error) {
        console.error('Error updating task:', error);
    }
}

/**
 * Example: Create a CNC part for a task
 */
async function exampleCreatePart(taskId) {
    try {
        console.log(`Creating CNC part for task ${taskId}...`);
        
        const partData = {
            job_no: 'JOB-003',
            image_no: 'IMG-003',
            position_no: 'POS-003',
            weight_kg: 3.2
        };
        
        // Validate part data
        const validation = validateCncPartData(partData);
        if (!validation.isValid) {
            console.error('Validation errors:', validation.errors);
            return;
        }
        
        const newPart = await createCncPart(taskId, partData);
        console.log('Created CNC Part:', newPart);
        return newPart;
    } catch (error) {
        console.error('Error creating part:', error);
    }
}

/**
 * Example: Format task data for display
 */
function exampleFormatTask(task) {
    console.log('Original task:', task);
    const formatted = formatCncTaskForDisplay(task);
    console.log('Formatted task:', formatted);
    return formatted;
}

/**
 * Example: Delete a CNC task
 */
async function exampleDeleteTask(taskId) {
    try {
        console.log(`Deleting CNC task ${taskId}...`);
        const success = await deleteCncTask(taskId);
        console.log('Delete successful:', success);
        return success;
    } catch (error) {
        console.error('Error deleting task:', error);
    }
}

// Export examples for use in other files
export {
    exampleGetAllTasks,
    exampleGetTask,
    exampleCreateTask,
    exampleCreateTaskWithFile,
    exampleUpdateTask,
    exampleCreatePart,
    exampleFormatTask,
    exampleDeleteTask
};

// Example usage in HTML:
/*
// In your HTML file, you can use these functions like this:

// Get all tasks when page loads
document.addEventListener('DOMContentLoaded', async () => {
    await exampleGetAllTasks();
});

// Create a new task
document.getElementById('createTaskBtn').addEventListener('click', async () => {
    await exampleCreateTask();
});

// Create task with file upload
document.getElementById('fileInput').addEventListener('change', async (e) => {
    await exampleCreateTaskWithFile(e.target);
});

// Update a task
document.getElementById('updateTaskBtn').addEventListener('click', async () => {
    const taskId = document.getElementById('taskIdInput').value;
    await exampleUpdateTask(taskId);
});

// Delete a task
document.getElementById('deleteTaskBtn').addEventListener('click', async () => {
    const taskId = document.getElementById('taskIdInput').value;
    await exampleDeleteTask(taskId);
});
*/
