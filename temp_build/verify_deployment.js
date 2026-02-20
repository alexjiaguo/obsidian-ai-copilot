const fs = require('fs');
const path = require('path');

const localPath = 'main.js';
const vaultPath = '/Users/boss/Library/Mobile Documents/iCloud~md~obsidian/Documents/Life_OS/.obsidian/plugins/obsidian_ai_copilot/main.js';

const tracer = 'VERIFIED FEB 2026 BUILD';

function check(filePath, label) {
    if (!fs.existsSync(filePath)) {
        console.log(`[${label}] MISSING: ${filePath}`);
        return;
    }
    const content = fs.readFileSync(filePath, 'utf8');
    if (content.includes(tracer)) {
        console.log(`[${label}] FOUND: ${tracer} in ${filePath}`);
    } else {
        console.log(`[${label}] NOT FOUND: ${tracer} in ${filePath}`);
    }
}

check(localPath, 'LOCAL');
check(vaultPath, 'VAULT');
