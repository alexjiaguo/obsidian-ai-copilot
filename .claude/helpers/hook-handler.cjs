#!/usr/bin/env node
/**
 * Claude Flow Hook Handler (Cross-Platform)
 * Dispatches hook events to the appropriate helper modules.
 */

const path = require('path');
const fs = require('fs');

const helpersDir = __dirname;

function safeRequire(modulePath) {
  try {
    if (fs.existsSync(modulePath)) {
      const origLog = console.log;
      const origError = console.error;
      console.log = () => {};
      console.error = () => {};
      try {
        return require(modulePath);
      } finally {
        console.log = origLog;
        console.error = origError;
      }
    }
  } catch (e) {
    // silently fail
  }
  return null;
}

const router = safeRequire(path.join(helpersDir, 'router.js'));
const session = safeRequire(path.join(helpersDir, 'session.js'));
const intelligence = safeRequire(path.join(helpersDir, 'intelligence.cjs'));

const [,, command, ...args] = process.argv;

async function readStdin() {
  if (process.stdin.isTTY) return '';
  return new Promise((resolve) => {
    let data = '';
    const timer = setTimeout(() => {
      process.stdin.removeAllListeners();
      process.stdin.pause();
      resolve(data);
    }, 500);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => { clearTimeout(timer); resolve(data); });
    process.stdin.on('error', () => { clearTimeout(timer); resolve(data); });
    process.stdin.resume();
  });
}

function allowCursorHook() {
  console.log(JSON.stringify({ hookEventName: 'PreToolUse', permissionDecision: 'allow' }));
}

async function main() {
  let stdinData = '';
  try { stdinData = await readStdin(); } catch (e) { /* ignore */ }

  let hookInput = {};
  if (stdinData.trim()) {
    try { hookInput = JSON.parse(stdinData); } catch (e) { /* ignore */ }
  }

  const prompt = hookInput.prompt || hookInput.command || hookInput.toolInput
    || process.env.PROMPT || process.env.TOOL_INPUT_command || args.join(' ') || '';

  const handlers = {
    'pre-edit': () => {
      allowCursorHook();
    },

    'pre-bash': () => {
      const cmd = (hookInput.command || prompt).toLowerCase();
      const dangerous = ['rm -rf /', 'format c:', 'del /s /q c:\\', ':(){:|:&};:'];
      for (const d of dangerous) {
        if (cmd.includes(d)) {
          console.log(JSON.stringify({ hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: `Dangerous command: ${d}` }));
          return;
        }
      }
      allowCursorHook();
    },

    'post-edit': () => {
      if (session && session.metric) {
        try { session.metric('edits'); } catch (e) { /* no active session */ }
      }
      if (intelligence && intelligence.recordEdit) {
        try {
          const file = hookInput.file_path || (hookInput.toolInput && hookInput.toolInput.file_path)
            || process.env.TOOL_INPUT_file_path || args[0] || '';
          intelligence.recordEdit(file);
        } catch (e) { /* non-fatal */ }
      }
      console.log('[OK] Edit recorded');
    },

    'route': () => {
      if (router && router.routeTask) {
        const result = router.routeTask(prompt);
        console.log(`[INFO] Routing task to: ${result.agent}`);
      } else {
        console.log('[INFO] Router not available, using default routing');
      }
    },

    'session-restore': () => {
      if (session && session.restore) {
        session.restore() || (session.start && session.start());
      }
      if (intelligence && intelligence.init) {
        try { intelligence.init(); } catch (e) { /* non-fatal */ }
      }
    },

    'session-end': () => {
      if (intelligence && intelligence.consolidate) {
        try { intelligence.consolidate(); } catch (e) { /* non-fatal */ }
      }
      if (session && session.end) {
        session.end();
      } else {
        console.log('[OK] Session ended');
      }
    },

    'pre-task': () => {
      if (session && session.metric) {
        try { session.metric('tasks'); } catch (e) { /* no active session */ }
      }
      console.log('[OK] Task started');
    },

    'post-task': () => {
      if (intelligence && intelligence.feedback) {
        try { intelligence.feedback(true); } catch (e) { /* non-fatal */ }
      }
      console.log('[OK] Task completed');
    },

    'stats': () => {
      if (intelligence && intelligence.stats) {
        intelligence.stats(args.includes('--json'));
      } else {
        console.log('[WARN] Intelligence module not available.');
      }
    },
  };

  if (command && handlers[command]) {
    try {
      handlers[command]();
    } catch (e) {
      console.log(`[WARN] Hook ${command} encountered an error: ${e.message}`);
    }
  } else if (command === 'pre-edit' || command === 'pre-bash') {
    allowCursorHook();
  } else if (command) {
    console.log(`[OK] Hook: ${command}`);
  }
}

process.exitCode = 0;
main().catch((e) => {
  try { console.log(`[WARN] Hook handler error: ${e.message}`); } catch (_) {}
}).finally(() => {
  process.exit(0);
});
