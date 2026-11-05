import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { hashId } from './modules.js';
// embedded, the selfhosted compiler has no source tree to read them from
import removeDefault404 from './uwebsockets/0001-remove-default-404.patch' with { type: 'text' };
import shortenErrors from './uwebsockets/0002-shorten-uws-errors.patch' with { type: 'text' };
import nodeHttpServer from './uwebsockets/0003-node-http-server.patch' with { type: 'text' };
import sslWriteInsideRead from './uwebsockets/0004-ssl-write-inside-read.patch' with { type: 'text' };
import uwsShim from './uwebsockets/porf_uws.cpp' with { type: 'text' };

export { uwsShim };

export const UWS_REPO_URL = 'https://github.com/uNetworking/uWebSockets';
export const UWS_COMMIT = '360c276d609d59af56ae6932adb95154ace9f15f';

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, {
  stdio: 'pipe',
  encoding: 'utf8',
  ...opts
});

const patches = [ removeDefault404, shortenErrors, nodeHttpServer, sslWriteInsideRead ];

const cacheRoot = path.join(os.homedir(), '.cache', 'porffor', 'deps');

// fetched once into the cache: filled aside, then moved in
export const cachedDep = (name, files, fill) => {
  const dir = path.join(cacheRoot, name);
  if (files.every(x => fs.existsSync(path.join(dir, x)))) return dir;

  fs.mkdirSync(cacheRoot, { recursive: true });
  const tempDir = `${dir}.${process.pid}`;
  fs.rmSync(tempDir, { recursive: true, force: true });
  fs.mkdirSync(tempDir, { recursive: true });
  try {
    fill(tempDir);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.renameSync(tempDir, dir);
  } catch (error) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    throw new Error(error?.stderr?.toString?.().trim?.() || error?.stdout?.toString?.().trim?.() || `failed to fetch ${name}`);
  }
  return dir;
};

// the pinned uWebSockets checkout (with uSockets), fetched once into the cache per set of patches
export const ensureUWebSockets = () => {
  return cachedDep(`uWebSockets-${UWS_COMMIT}-${hashId(patches.join(''))}${Prefs.musl ? '-musl' : ''}`, [ 'src/App.h', 'uSockets/src' ], dir => {
    run('git', [ 'init' ], { cwd: dir });
    run('git', [ 'remote', 'add', 'origin', UWS_REPO_URL ], { cwd: dir });
    run('git', [ 'fetch', '--depth', '1', 'origin', UWS_COMMIT ], { cwd: dir });
    run('git', [ 'checkout', '--detach', 'FETCH_HEAD' ], { cwd: dir });
    run('git', [ 'submodule', 'update', '--init', '--depth', '1', 'uSockets' ], { cwd: dir });
    for (const patch of patches) run('git', [ 'apply' ], { cwd: dir, input: patch });
  });
};

// uSockets on libuv (openssl for https), built once per compiler and flags into the checkout
const ensureUSockets = (uwsDir, cc, cxx, cflags, ssl) => {
  const srcDir = path.join(uwsDir, 'uSockets', 'src');
  const buildDir = path.join(uwsDir, 'uSockets', `build-libuv${ssl ? '-ssl' : ''}-${hashId(`${cc} ${cxx} ${cflags.join(' ')}`)}`);
  const archive = path.join(buildDir, 'uSockets.a');
  if (fs.existsSync(archive)) return archive;

  // built aside, then moved in: parallel builds race otherwise
  const tempDir = `${buildDir}.${process.pid}`;
  fs.mkdirSync(tempDir, { recursive: true });
  const defines = [ '-DLIBUS_USE_LIBUV', ssl ? '-DLIBUS_USE_OPENSSL' : '-DLIBUS_NO_SSL' ];
  const sources = [ '', 'eventing', 'crypto' ].flatMap(dir => fs.readdirSync(path.join(srcDir, dir)).filter(x => x.endsWith('.c') || (ssl && x.endsWith('.cpp'))).map(x => path.join(srcDir, dir, x)));
  const objects = [];
  for (const source of sources) {
    const object = path.join(tempDir, path.basename(source).replace(/\.c(pp)?$/, '.o'));
    const [ command, ...args ] = source.endsWith('.cpp') ? [ ...cxx.split(' '), '-std=c++17' ] : [ ...cc.split(' '), '-std=c11' ];
    execFileSync(command, [ ...args, '-c', '-O3', ...defines, `-I${srcDir}`, ...cflags, source, '-o', object ], { stdio: [ 'ignore', 'inherit', 'inherit' ] });
    objects.push(object);
  }
  execFileSync('ar', [ 'rcs', path.join(tempDir, 'uSockets.a'), ...objects ]);
  try {
    fs.renameSync(tempDir, buildDir);
  } catch {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  return archive;
};

// what a program using runtime/node/internal/uws.js builds and links, ssl for internal/uws-ssl.js
export const uwsBuild = (cc, cxx, cflags, ssl) => {
  const uwsDir = ensureUWebSockets();
  return {
    unit: { name: 'porf_uws.cpp', c: uwsShim },
    cxxflags: [
      '-std=c++20', '-fno-rtti', '-DUWS_NO_ZLIB', '-DUWS_HTTPRESPONSE_NO_WRITEMARK', '-DLIBUS_USE_LIBUV', ssl ? '-DLIBUS_USE_OPENSSL -DPORF_UWS_SSL' : '-DLIBUS_NO_SSL',
      `-I${path.join(uwsDir, 'src')}`, `-I${path.join(uwsDir, 'uSockets', 'src')}`, ...cflags
    ],
    archive: ensureUSockets(uwsDir, cc, cxx, cflags, ssl)
  };
};
