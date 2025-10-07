const fs = require('fs');
const path = require('path');

// Read the file
const filePath = path.join(__dirname, 'manufacturing', 'machining', 'capacity', 'planning', 'planning.js');
let content = fs.readFileSync(filePath, 'utf8');

// Remove all console statements (including multi-line ones)
content = content.replace(/^\s*console\.(log|warn|error|info|debug)\([^)]*\);?\s*$/gm, '');

// Write back to file
fs.writeFileSync(filePath, content);

console.log('Console statements removed successfully');