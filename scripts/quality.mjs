import {spawnSync} from 'node:child_process';
import {existsSync, readFileSync} from 'node:fs';
import {delimiter, dirname, join} from 'node:path';
import {stat} from './files.mjs';

export const modes = ['quick', 'standard', 'deep'];

export function route({highRisk = false, uncertainImpact = false, small = false, behaviorChange = false}) {
  if ([highRisk, uncertainImpact, small, behaviorChange].some(value => typeof value !== 'boolean')) throw new Error('Router expects boolean facts');
  if (highRisk || uncertainImpact) return 'deep';
  return small && !behaviorChange ? 'quick' : 'standard';
}

export function commandsFor(root, mode) {
  if (!modes.includes(mode)) throw new Error('Use quick, standard, or deep');
  const config = JSON.parse(readFileSync(join(root, 'harness.config.json'), 'utf8'));
  const profiles = JSON.parse(readFileSync(join(root, 'config/profiles.json'), 'utf8'));
  const {profiles: selected, timeoutSeconds} = config;
  if (config.version !== 1 || !Array.isArray(selected) || !selected.length || new Set(selected).size !== selected.length || !Number.isInteger(timeoutSeconds) || timeoutSeconds < 1 || timeoutSeconds > 1800) {
    throw new Error('Invalid harness.config.json');
  }
  const commands = selected.flatMap(name => {
    if (typeof name !== 'string' || !Object.hasOwn(profiles, name)) throw new Error('Unknown profile: ' + name);
    return modes.slice(0, modes.indexOf(mode) + 1).flatMap(stage => profiles[name][stage]);
  });
  if (commands.some(argv => !Array.isArray(argv) || !argv.length || argv.some(value => typeof value !== 'string' || value.includes('\0')) || !/^[\w.-]+$/.test(argv[0]))) {
    throw new Error('Profile commands must be executable names with argument arrays');
  }
  return {commands, timeoutSeconds};
}

function portableCommand(executable, args) {
  if (process.platform !== 'win32' || !['npm', 'mvn'].includes(executable)) return [executable, args];
  if (executable === 'npm') {
    const paths = [dirname(process.execPath), ...(process.env.PATH ?? '').split(delimiter)];
    const npm = paths.map(path => join(path, 'node_modules', 'npm', 'bin', 'npm-cli.js')).find(existsSync);
    if (!npm) throw new Error('npm-cli.js not found beside Node.js or a PATH entry');
    return [process.execPath, [npm, ...args]];
  }
  if (args.some(arg => !/^[\w./:=,+-]+$/.test(arg))) throw new Error('Unsupported character in Windows Maven arguments');
  return [process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'mvn.cmd ' + args.join(' ')]];
}

export function run(root, argv, timeoutSeconds = 300, capture = false) {
  const [executable, ...args] = argv;
  const [command, commandArgs] = portableCommand(executable, args);
  if (!capture) console.log('+ ' + argv.join(' '));
  const result = spawnSync(command, commandArgs, {
    cwd: root, timeout: timeoutSeconds * 1000, encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit', maxBuffer: 16_000_000,
    windowsVerbatimArguments: process.platform === 'win32' && executable === 'mvn',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${executable} failed (${result.status ?? result.signal})`);
  return result.stdout;
}

export function basicChecks(root) {
  run(root, ['git', 'diff', '--check']);
  run(root, ['git', 'diff', '--cached', '--check']);
  const names = run(root, ['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], 30, true);
  const suspicious = /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----|(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|AKIA[A-Z0-9]{16})/;
  const findings = [];
  for (const name of new Set(names.split('\0').filter(Boolean))) {
    const parts = name.split('/');
    if (parts.some(part => part === '.' || part === '..' || !part)) continue;
    let path = root;
    for (const part of parts.slice(0, -1)) {
      path = join(path, part);
      if (!stat(path)?.isDirectory()) break;
    }
    if (!stat(path)?.isDirectory()) continue;
    path = join(path, parts.at(-1));
    const info = stat(path);
    if (!info?.isFile() || info.size > 1_000_000) continue;
    const bytes = readFileSync(path);
    if (!bytes.includes(0) && suspicious.test(bytes.toString('utf8'))) findings.push(name);
  }
  const index = run(root, ['git', 'ls-files', '--stage', '-z'], 30, true);
  const blobs = new Map();
  for (const entry of index.split('\0')) {
    const match = /^100(?:644|755) ([0-9a-f]+) 0\t([\s\S]+)$/.exec(entry);
    if (match) blobs.set(match[2], match[1]);
  }
  const staged = run(root, ['git', 'diff', '--cached', '--name-only', '--diff-filter=ACMRT', '-z'], 30, true);
  for (const name of staged.split('\0').filter(Boolean)) {
    const object = blobs.get(name);
    if (!object || Number(run(root, ['git', 'cat-file', '-s', object], 30, true)) > 1_000_000) continue;
    const content = run(root, ['git', 'cat-file', 'blob', object], 30, true);
    if (!content.includes('\0') && suspicious.test(content)) findings.push(name + ' (staged)');
  }
  if (findings.length) throw new Error('Possible credential pattern in: ' + findings.join(', '));
}
