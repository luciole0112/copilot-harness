import {execFileSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {install, prepare, safePath, sha256, stat} from './files.mjs';

export function lockAt(root) {
  const lock = JSON.parse(readFileSync(join(root, 'skills-lock.json'), 'utf8'));
  if (lock.version !== 1) throw new Error('Unsupported skills lock version');
  return lock.sources;
}

function checkedBytes(root, path, expected) {
  const absolute = safePath(root, path);
  const info = stat(absolute);
  if (!info?.isFile()) throw new Error('Missing file: ' + path);
  const data = readFileSync(absolute);
  if (sha256(data) !== expected) throw new Error('Digest mismatch: ' + path);
  return data;
}

export function checkSkills(root, groups = ['core']) {
  for (const source of lockAt(root).filter(item => groups.includes(item.group))) {
    for (const skill of source.skills) {
      for (const file of skill.files) {
        checkedBytes(root, `.github/skills/${skill.name}/${file.path}`, file.sha256);
      }
    }
  }
}

export function fetchSkills(root, group) {
  const temporary = mkdtempSync(join(tmpdir(), 'copilot-harness-'));
  const cache = new Map();
  const git = (cwd, args) => execFileSync('git', ['-c', 'core.autocrlf=false', '-c', 'core.hooksPath=' + join(temporary, 'disabled-hooks'), '-C', cwd, ...args], {encoding: 'utf8', timeout: 120000});
  try {
    const files = [];
    for (const source of lockAt(root).filter(item => item.group === group)) {
      const {repo, commit} = source;
      if (!/^[\w-]+\/[\w-]+$/.test(repo) || !/^[0-9a-f]{40}$/.test(commit)) throw new Error('Invalid source pin');
      const key = repo + '@' + commit;
      if (!cache.has(key)) {
        const checkout = mkdtempSync(join(temporary, 'source-'));
        git(checkout, ['init', '--quiet']);
        git(checkout, ['fetch', '--depth=1', '--no-tags', 'https://github.com/' + repo + '.git', commit]);
        if (git(checkout, ['rev-parse', 'FETCH_HEAD']).trim() !== commit) throw new Error('Commit mismatch');
        git(checkout, ['checkout', '--quiet', '--detach', commit]);
        cache.set(key, checkout);
      }
      for (const skill of source.skills) {
        for (const file of skill.files) {
          files.push([`.github/skills/${skill.name}/${file.path}`, checkedBytes(cache.get(key), file.source, file.sha256)]);
        }
      }
    }
    if (!files.length) throw new Error('No skills selected');
    const {pending} = prepare(root, files);
    install(root, pending);
    console.log(`Installed ${pending.length} files from pinned ${group} skills.`);
  } finally {
    rmSync(temporary, {recursive: true, force: true});
  }
}
