import {createHash} from 'node:crypto';
import {lstatSync, mkdirSync, readFileSync, unlinkSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';

export function stat(path) {
  try { return lstatSync(path); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}

export function safePath(root, relative) {
  const parts = relative.split('/');
  if (parts.some(part => !/^[\w.@+() -]+$/u.test(part) || part === '.' || part === '..' || /[. ]$/.test(part) || /^\.git$/i.test(part) || /^(?:con|aux|nul|prn|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) {
    throw new Error('Unsupported path: ' + relative);
  }
  let path = root;
  for (const [index, part] of parts.entries()) {
    path = join(path, part);
    const entry = stat(path);
    if (entry && (entry.isSymbolicLink() || (index < parts.length - 1 && !entry.isDirectory()))) {
      throw new Error('Unsafe path: ' + relative);
    }
  }
  return path;
}

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function prepare(root, files, {skipExisting = false} = {}) {
  const seen = new Set();
  const pending = [];
  const skipped = [];
  for (const [name, bytes] of files) {
    const key = name.toLowerCase();
    if (seen.has(key)) throw new Error('Duplicate destination: ' + name);
    seen.add(key);
    const path = safePath(root, name);
    const entry = stat(path);
    if (!entry) pending.push([name, bytes]);
    else if (entry.isFile() && readFileSync(path).equals(bytes)) continue;
    else if (entry.isFile() && skipExisting) skipped.push(name);
    else throw new Error('Existing path differs; no files written: ' + name);
  }
  return {pending, skipped};
}

export function install(root, files) {
  const written = [];
  try {
    for (const [name, bytes] of files) {
      const path = safePath(root, name);
      mkdirSync(join(path, '..'), {recursive: true});
      writeFileSync(path, bytes, {flag: 'wx'});
      written.push(path);
    }
  } catch (error) {
    for (const path of written.reverse()) unlinkSync(path);
    throw error;
  }
}
