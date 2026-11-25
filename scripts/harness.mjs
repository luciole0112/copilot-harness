import {readFileSync, readdirSync, realpathSync} from 'node:fs';
import {isAbsolute, join, resolve} from 'node:path';
import {install, prepare, safePath, stat} from './files.mjs';
import {basicChecks, commandsFor, route, run} from './quality.mjs';
import {checkSkills, fetchSkills} from './skills.mjs';

const root = resolve(import.meta.dirname, '..');
const command = process.argv[2] ?? 'help';
const args = process.argv.slice(3);
const tests = ['test/harness.test.mjs'];
const help = `Usage:
  node scripts/harness.mjs bootstrap [--target EXISTING_DIR] [--apply] [--skip-existing]
  node scripts/harness.mjs doctor [--office]
  node scripts/harness.mjs verify [--mode quick|standard|deep] [--office]
  node scripts/harness.mjs fetch-skills core
  node scripts/harness.mjs fetch-skills office --accept-office-license
  node scripts/harness.mjs route '{"small":true}'`;

function options(flags, values) {
  const parsed = {};
  for (let index = 0; index < args.length; index++) {
    const key = args[index];
    if ((!flags.includes(key) && !values.includes(key)) || Object.hasOwn(parsed, key)) throw new Error('Unexpected option: ' + key);
    const value = flags.includes(key) ? true : args[++index];
    if (!value || (typeof value === 'string' && value.startsWith('--'))) throw new Error('Missing value: ' + key);
    parsed[key] = value;
  }
  return parsed;
}

function overlayFiles() {
  const roots = ['AGENTS.md', 'GLOSSARY.md', 'harness.config.json', 'skills-lock.json', '.gitignore', '.gitattributes',
    '.github', 'config', 'docs', 'examples', 'scripts', 'test', 'evals'];
  const excluded = new Set(['.github/skills/docx', '.github/skills/pdf', '.github/skills/pptx', '.github/skills/xlsx']);
  function visit(name) {
    if (excluded.has(name)) return [];
    const path = safePath(root, name);
    const info = stat(path);
    if (info?.isDirectory()) return readdirSync(path).sort().flatMap(entry => visit(name + '/' + entry));
    if (info?.isFile()) return [[name, readFileSync(path)]];
    throw new Error('Unsupported template file: ' + name);
  }
  return roots.flatMap(visit);
}

function bootstrap() {
  const opts = options(['--apply', '--skip-existing'], ['--target']);
  if (!opts['--target']) {
    if (args.length) throw new Error('--apply and --skip-existing require --target');
    checkSkills(root);
    console.log('Core skills ready. Run doctor and verify from the template root.');
    return;
  }
  const requested = resolve(opts['--target']);
  const target = realpathSync(requested);
  if (!stat(requested)?.isDirectory()) throw new Error('Target must be an existing directory and must not be a link');
  if (!isAbsolute(target) || target === realpathSync(root)) throw new Error('Choose a different target directory');
  checkSkills(root);
  const {pending, skipped} = prepare(target, overlayFiles(), {skipExisting: opts['--skip-existing']});
  for (const name of skipped) console.log('Preserved; reconcile manually: ' + name);
  if (opts['--apply']) install(target, pending);
  console.log(`${opts['--apply'] ? 'Added' : 'Would add'} ${pending.length} files.`);
}

try {
  if (command === 'help' && !args.length) console.log(help);
  else if (command === 'bootstrap') bootstrap();
  else if (command === 'doctor' || command === 'verify') {
    const opts = options(['--office'], command === 'verify' ? ['--mode'] : []);
    const mode = opts['--mode'] ?? 'standard';
    const {commands, timeoutSeconds} = commandsFor(root, mode);
    checkSkills(root, opts['--office'] ? ['core', 'office'] : ['core']);
    run(root, ['git', '--version']);
    const gitRoot = run(root, ['git', 'rev-parse', '--show-toplevel'], 30, true).trim();
    if (realpathSync(gitRoot) !== realpathSync(root)) throw new Error('Initialize Git at the template or target root');
    if (command === 'doctor') {
      console.log(`Node ${process.version}; ${process.platform}; skill digests verified.`);
      console.log('Profile commands (standard): ' + (commands.map(argv => argv.join(' ')).join(' | ') || '(none; harness only)'));
    } else {
      basicChecks(root);
      run(root, [process.execPath, '--test', ...tests], timeoutSeconds);
      for (const argv of commands) run(root, argv, timeoutSeconds);
      console.log(`Verified ${mode}; ran ${commands.length} project commands.`);
    }
  } else if (command === 'fetch-skills' && args.join(' ') === 'core') fetchSkills(root, 'core');
  else if (command === 'fetch-skills' && args.join(' ') === 'office --accept-office-license') fetchSkills(root, 'office');
  else if (command === 'route' && args.length === 1) {
    const facts = JSON.parse(args[0]);
    if (!facts || Array.isArray(facts) || typeof facts !== 'object' || Object.keys(facts).some(key => !['small', 'behaviorChange', 'highRisk', 'uncertainImpact'].includes(key))) throw new Error('Invalid router facts');
    console.log(route(facts));
  } else throw new Error(help);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
