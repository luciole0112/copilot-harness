import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {test} from 'node:test';
import {prepare} from '../scripts/files.mjs';
import {basicChecks, commandsFor, route, run} from '../scripts/quality.mjs';
import {checkSkills, lockAt} from '../scripts/skills.mjs';

const root = resolve(import.meta.dirname, '..');
const cli = join(root, 'scripts', 'harness.mjs');
const hook = join(root, 'scripts', 'hook.mjs');
const cases = JSON.parse(readFileSync(join(root, 'evals', 'cases.json'), 'utf8'));
const agentNames = ['architect', 'developer', 'docs', 'orchestrator', 'qa', 'reviewer'];
function node(script, args, input) {
  const result = spawnSync(process.execPath, [script, ...args], {cwd: root, input, encoding: 'utf8', timeout: 15000});
  if (result.error) throw result.error;
  return result;
}

function temporary(t) {
  const path = mkdtempSync(join(tmpdir(), 'harness-test-'));
  t.after(() => rmSync(path, {recursive: true, force: true}));
  return path;
}

for (const scenario of cases) {
  test('router: ' + scenario.id, () => assert.equal(route(scenario.facts), scenario.expected));
}

test('pinned skill names, distinct skill roles and core bytes', () => {
  const sources = lockAt(root);
  const names = sources.flatMap(source => source.skills.map(skill => skill.name));
  assert.equal(new Set(names).size, names.length);
  assert(!names.includes('tdd') && !names.includes('diagnosing-bugs'));
  for (const source of sources) {
    assert.match(source.commit, /^[0-9a-f]{40}$/);
    assert.equal(source.license, source.group === 'office' ? 'Apache-2.0' : 'MIT');
    for (const skill of source.skills) {
      assert(skill.files.some(file => file.path === (source.group === 'office' ? 'LICENSE.txt' : 'UPSTREAM-LICENSE.txt')));
      if (source.group === 'core') assert.match(readFileSync(join(root, '.github/skills', skill.name, 'SKILL.md'), 'utf8'), new RegExp('^name: ' + skill.name + '$', 'm'));
    }
  }
  checkSkills(root);
});

test('configuration and agent least privilege', () => {
  const hooks = JSON.parse(readFileSync(join(root, '.github/hooks/harness.json'), 'utf8'));
  assert.equal(hooks.version, 1);
  for (const entries of Object.values(hooks.hooks)) {
    for (const entry of entries) assert.match(entry.command, /^node scripts\/hook\.mjs \w+$/);
  }
  for (const name of agentNames) {
    const content = readFileSync(join(root, '.github/agents', name + '.agent.md'), 'utf8');
    assert.match(content, new RegExp('^name: ' + name + '$', 'm'));
    if (['architect', 'reviewer'].includes(name)) assert.match(content, /^tools: \[read, search\]$/m);
  }
});

test('current and legacy hook outputs', () => {
  const deny = node(hook, ['guard'], JSON.stringify({toolName: 'bash', toolArgs: JSON.stringify({command: 'git reset --hard'})}));
  assert.equal(deny.status, 0);
  assert.equal(JSON.parse(deny.stdout).permissionDecision, 'deny');
  const legacy = node(hook, ['guard', '--legacy'], JSON.stringify({tool_name: 'edit', tool_input: {filePath: 'nested/.env.local'}}));
  assert.equal(JSON.parse(legacy.stdout).hookSpecificOutput.permissionDecision, 'deny');
  const pass = node(hook, ['guard'], JSON.stringify({toolName: 'edit', toolArgs: {path: '.env.example'}}));
  assert.deepEqual(JSON.parse(pass.stdout), {});
  assert.deepEqual(JSON.parse(node(hook, ['guard'], 'bad data').stdout), {});
});

test('bootstrap previews, refuses collisions and installs without changing existing files', t => {
  const target = temporary(t);
  const agents = join(target, 'AGENTS.md');
  writeFileSync(agents, 'existing instructions');
  const base = ['bootstrap', '--target', target];
  const blocked = node(cli, [...base, '--apply']);
  assert.equal(blocked.status, 1, blocked.stderr);
  assert(!existsSync(join(target, '.github')));
  const preview = node(cli, [...base, '--skip-existing']);
  assert.equal(preview.status, 0, preview.stderr);
  assert(!existsSync(join(target, '.github')));
  const apply = node(cli, [...base, '--skip-existing', '--apply']);
  assert.equal(apply.status, 0, apply.stderr);
  assert.equal(readFileSync(agents, 'utf8'), 'existing instructions');
  assert(!existsSync(join(target, '.github/skills/docx')));
  checkSkills(target);
  assert.match(node(cli, [...base, '--skip-existing', '--apply']).stdout, /Added 0 files/);
});

test('preflight refuses traversal and target links', t => {
  const dir = temporary(t);
  assert.throws(() => prepare(dir, [['../outside', Buffer.alloc(0)]]), /Unsupported path/);
  mkdirSync(join(dir, 'destination'));
  try { symlinkSync(join(dir, 'destination'), join(dir, 'link'), 'junction'); }
  catch (error) {
    if (error.code !== 'EPERM' && error.code !== 'EACCES') throw error;
    t.diagnostic('Link creation requires permission on this runner.');
    return;
  }
  assert.throws(() => prepare(dir, [['link/file', Buffer.alloc(0)]]), /Unsafe path/);
});

test('profile stages accumulate and failing command propagates', t => {
  const dir = temporary(t);
  mkdirSync(join(dir, 'config'));
  writeFileSync(join(dir, 'config/profiles.json'), JSON.stringify({fixture: {quick: [['git', '--version']], standard: [['node', '--version']], deep: [['node', '-e', 'process.exit(7)']]}}));
  writeFileSync(join(dir, 'harness.config.json'), JSON.stringify({version: 1, profiles: ['fixture'], timeoutSeconds: 20}));
  for (const [index, mode] of ['quick', 'standard', 'deep'].entries()) assert.equal(commandsFor(dir, mode).commands.length, index + 1);
  assert.throws(() => run(dir, commandsFor(dir, 'deep').commands.at(-1), 20, true), /failed \(7\)/);
});

test('secret pattern fails without revealing the matched value', t => {
  const dir = temporary(t);
  run(dir, ['git', 'init', '--quiet'], 20, true);
  const fake = 'gh' + 'p_' + 'a'.repeat(36);
  writeFileSync(join(dir, 'fixture.txt'), fake);
  assert.throws(() => basicChecks(dir), error => /fixture\.txt/.test(error.message) && !error.message.includes(fake));
  run(dir, ['git', 'add', 'fixture.txt'], 20, true);
  writeFileSync(join(dir, 'fixture.txt'), 'safe working tree contents');
  assert.throws(() => basicChecks(dir), error => /fixture\.txt \(staged\)/.test(error.message) && !error.message.includes(fake));
});
