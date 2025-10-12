/**
 * Example usage of CNC Cutting APIs
 * This file demonstrates how to use the new parts and files APIs
 */

import { 
    createCncPart, 
    updateCncPart, 
    deleteCncPart, 
    getCncPart, 
    getCncParts,
    validateCncPartData 
} from './parts.js';

import { 
    deleteCncFile, 
    addFilesToCncTask, 
    getCncFile, 
    getCncTaskFiles,
    downloadCncFile,
    validateFileUpload 
} from './files.js';

import { addFilesToCncTask as addFilesToTask } from './crud.js';

// Example 1: Create a new CNC part
async function exampleCreatePart() {
    try {
        const partData = {
            cnc_task: 1,           // Required: CNC task ID
            job_no: "JB-2024-101", // Required: Job number
            image_no: "IMG-005",   // Optional: Image number
            position_no: "P-03",   // Optional: Position number
            weight_kg: "15.750"    // Optional: Weight in kg
        };
        
        // Validate data before sending
        const validation = validateCncPartData(partData);
        if (!validation.isValid) {
            console.error('Validation errors:', validation.errors);
            return;
        }
        
        const newPart = await createCncPart(partData);
        console.log('Created part:', newPart);
    } catch (error) {
        console.error('Error creating part:', error);
    }
}

// Example 2: Partially update a CNC part
async function exampleUpdatePart(partId) {
    try {
        const updateData = {
            position_no: "P-03-REVISED",
            weight_kg: "16.100"
        };
        
        const updatedPart = await updateCncPart(partId, updateData);
        console.log('Updated part:', updatedPart);
    } catch (error) {
        console.error('Error updating part:', error);
    }
}

// Example 3: Delete a CNC part
async function exampleDeletePart(partId) {
    try {
        const success = await deleteCncPart(partId);
        if (success) {
            console.log('Part deleted successfully');
        }
    } catch (error) {
        console.error('Error deleting part:', error);
    }
}

// Example 4: Delete a file
async function exampleDeleteFile(fileId) {
    try {
        const success = await deleteCncFile(fileId);
        if (success) {
            console.log('File deleted successfully');
        }
    } catch (error) {
        console.error('Error deleting file:', error);
    }
}

// Example 5: Add files to an existing task
async function exampleAddFilesToTask(taskId, fileInput) {
    try {
        const files = fileInput.files; // FileList from input element
        
        // Validate files before upload
        const validation = validateFileUpload(files, {
            maxSize: 5 * 1024 * 1024, // 5MB max
            allowedTypes: ['image/*', 'application/pdf'],
            maxFiles: 5
        });
        
        if (!validation.isValid) {
            console.error('File validation errors:', validation.errors);
            return;
        }
        
        const result = await addFilesToCncTask(taskId, files);
        console.log('Files added successfully:', result);
    } catch (error) {
        console.error('Error adding files:', error);
    }
}

// Example 6: Get all parts for a specific task
async function exampleGetTaskParts(taskId) {
    try {
        const parts = await getCncParts({ cnc_task: taskId });
        console.log('Task parts:', parts);
    } catch (error) {
        console.error('Error fetching parts:', error);
    }
}

// Example 7: Get all files for a specific task
async function exampleGetTaskFiles(taskId) {
    try {
        const files = await getCncTaskFiles(taskId);
        console.log('Task files:', files);
    } catch (error) {
        console.error('Error fetching files:', error);
    }
}

// Example 8: Download a file
async function exampleDownloadFile(fileId, filename) {
    try {
        const blob = await downloadCncFile(fileId, filename);
        console.log('File downloaded:', blob);
    } catch (error) {
        console.error('Error downloading file:', error);
    }
}

// Example 9: Complete workflow - Create task with parts and files
async function exampleCompleteWorkflow() {
    try {
        // Step 1: Create parts for a task
        const part1 = await createCncPart({
            cnc_task: 1,
            job_no: "JB-2024-101",
            image_no: "IMG-001",
            position_no: "P-01",
            weight_kg: "12.500"
        });
        
        const part2 = await createCncPart({
            cnc_task: 1,
            job_no: "JB-2024-102",
            image_no: "IMG-002",
            position_no: "P-02",
            weight_kg: "8.750"
        });
        
        console.log('Created parts:', [part1, part2]);
        
        // Step 2: Add files to the task (assuming fileInput is available)
        // const fileInput = document.getElementById('fileInput');
        // if (fileInput && fileInput.files.length > 0) {
        //     await addFilesToCncTask(1, fileInput.files);
        // }
        
        // Step 3: Get all parts for the task
        const allParts = await getCncParts({ cnc_task: 1 });
        console.log('All parts for task 1:', allParts);
        
        // Step 4: Get all files for the task
        const allFiles = await getCncTaskFiles(1);
        console.log('All files for task 1:', allFiles);
        
    } catch (error) {
        console.error('Error in complete workflow:', error);
    }
}

// Export examples for use in other files
export {
    exampleCreatePart,
    exampleUpdatePart,
    exampleDeletePart,
    exampleDeleteFile,
    exampleAddFilesToTask,
    exampleGetTaskParts,
    exampleGetTaskFiles,
    exampleDownloadFile,
    exampleCompleteWorkflow
};
