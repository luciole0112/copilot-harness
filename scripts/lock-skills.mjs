import {createHash} from 'node:crypto';
import {readFileSync, readdirSync, writeFileSync} from 'node:fs';
import {join, relative} from 'node:path';
import {execFileSync} from 'node:child_process';

const [superRoot, mattRoot, officeRoot] = process.argv.slice(2);
const sources = [
  ['superpowers', superRoot, 'obra/superpowers', 'MIT', 'core', 'LICENSE', 'skills',
    ['test-driven-development', 'systematic-debugging', 'verification-before-completion']],
  ['matt-engineering', mattRoot, 'mattpocock/skills', 'MIT', 'core', 'LICENSE', 'skills/engineering',
    ['grill-with-docs', 'domain-modeling', 'improve-codebase-architecture', 'codebase-design', 'to-spec', 'to-tickets', 'retro']],
  ['matt-productivity', mattRoot, 'mattpocock/skills', 'MIT', 'core', 'LICENSE', 'skills/productivity',
    ['grilling', 'handoff']],
  ['anthropic-office', officeRoot, 'anthropics/skills', 'Apache-2.0', 'office', null, 'skills',
    ['docx', 'pdf', 'pptx', 'xlsx']],
];

function walk(dir) {
  return readdirSync(dir, {withFileTypes: true}).sort((a, b) => a.name.localeCompare(b.name)).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path);
    if (entry.isFile()) return [path];
    throw new Error('Unsupported file type: ' + path);
  });
}

function digest(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

const lock = sources.map(([id, root, repo, license, group, rootLicense, prefix, names]) => ({
  id, repo, license, group,
  commit: execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], {encoding: 'utf8'}).trim(),
  skills: names.map(name => {
    const upstream = prefix + '/' + name;
    const dir = join(root, upstream);
    const body = readFileSync(join(dir, 'SKILL.md'), 'utf8');
    if (!body.split(/\r?\n/).includes('name: ' + name)) throw new Error('Invalid upstream name: ' + name);
    const files = walk(dir).map(path => {
      const suffix = relative(dir, path).replaceAll('\\', '/');
      return {source: upstream + '/' + suffix, path: suffix, sha256: digest(path)};
    });
    if (rootLicense) files.push({source: rootLicense, path: 'UPSTREAM-LICENSE.txt', sha256: digest(join(root, rootLicense))});
    if (!rootLicense && !files.some(file => file.path === 'LICENSE.txt')) throw new Error('Missing license: ' + name);
    return {name, files};
  }),
}));
writeFileSync(new URL('../skills-lock.json', import.meta.url), JSON.stringify({version: 1, sources: lock}, null, 2) + '\n');
