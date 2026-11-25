import {execFileSync} from 'node:child_process';
import {appendFileSync, mkdirSync, readFileSync, constants, openSync, closeSync} from 'node:fs';
import {resolve} from 'node:path';
import {safePath, stat} from './files.mjs';

const [stage, adapter] = process.argv.slice(2);
const root = resolve(import.meta.dirname, '..');
const legacy = adapter === '--legacy';
let event = {};
try { event = JSON.parse(readFileSync(0, 'utf8')); } catch { /* Unknown input uses client defaults. */ }

const allowedStages = ['start', 'guard', 'audit', 'stop', 'checkpoint', 'end', 'error'];
const fields = event?.toolArgs ?? event?.tool_input ?? {};
let args = fields;
if (typeof fields === 'string') {
  try { args = JSON.parse(fields); } catch { args = {}; }
}

function denial() {
  const tool = String(event?.toolName ?? event?.tool_name ?? '').toLowerCase();
  const data = args && typeof args === 'object' ? args : {};
  if (['bash', 'powershell', 'shell', 'execute', 'run_in_terminal'].includes(tool)) {
    const command = data.command;
    if (typeof command === 'string' && /(?:^|[;|&\n])\s*(?:git\s+(?:reset\s+--hard|clean\s+-[a-z]*f|push\s+(?:--force|-f))\b|rm\s+-[a-z]*r[a-z]*f\b|remove-item\b[^\n]*-recurse\b)/i.test(command)) {
      return 'Potentially destructive command. Use the normal human-controlled workflow.';
    }
  }
  if (/edit|write|create|replace|patch|delete/.test(tool)) {
    const path = data.path ?? data.file_path ?? data.filePath;
    if (typeof path === 'string') {
      const normalized = path.replaceAll('\\', '/').toLowerCase();
      if (/(?:^|\/)\.git(?:\/|$)|(?:^|\/)\.env(?:\.(?!example$)[^/]+)?$/.test(normalized) && !normalized.endsWith('/.env.example')) {
        return 'Direct edit of Git metadata or local environment file is restricted.';
      }
    }
  }
}

function audit() {
  if (process.env.HARNESS_AUDIT !== '1') return;
  const path = safePath(root, '.harness-local/events.ndjson');
  mkdirSync(resolve(path, '..'), {recursive: true});
  const info = stat(path);
  if (info && (!info.isFile() || info.nlink !== 1 || info.size >= 1_000_000)) return;
  const fd = openSync(path, constants.O_APPEND | constants.O_CREAT | constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0), 0o600);
  try { appendFileSync(fd, JSON.stringify({at: new Date().toISOString(), stage}) + '\n'); }
  finally { closeSync(fd); }
}

let output = {};
if (allowedStages.includes(stage)) {
  try {
    audit();
    if (stage === 'start') execFileSync('git', ['rev-parse', '--is-inside-work-tree'], {cwd: root, stdio: 'ignore', timeout: 3000});
    if (stage === 'guard') {
      const reason = denial();
      if (reason) output = legacy
        ? {hookSpecificOutput: {hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason}}
        : {permissionDecision: 'deny', permissionDecisionReason: reason};
    }
    if (stage === 'stop') execFileSync('git', ['diff', '--check', 'HEAD', '--'], {cwd: root, stdio: 'ignore', timeout: 4000});
  } catch {
    if (stage === 'start' || stage === 'stop') {
      const message = stage === 'start' ? 'Check Git workspace using harness doctor.' : 'Run git diff --check and harness verify.';
      if (legacy) output = {systemMessage: message};
      else console.error(message);
    } else if (stage === 'guard') {
      const reason = denial();
      if (reason) output = legacy
        ? {hookSpecificOutput: {hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason}}
        : {permissionDecision: 'deny', permissionDecisionReason: reason};
    }
  }
}
console.log(JSON.stringify(output));
