import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { cachedDep } from './uwebsockets.js';

export const ADA_VERSION = '4.0.0';

// ada's single-file release (ada.cpp, ada.h, ada_c.h), fetched once into the cache
const ensureAda = () => cachedDep(`ada-${ADA_VERSION}`, [ 'ada.cpp' ], dir => {
  execFileSync('curl', [ '-fsSL', '-o', 'singleheader.zip', `https://github.com/ada-url/ada/releases/download/v${ADA_VERSION}/singleheader.zip` ], { cwd: dir, stdio: 'pipe' });
  execFileSync('unzip', [ '-q', 'singleheader.zip' ], { cwd: dir, stdio: 'pipe' });
});

// what a program using ada (runtime/node/url.js) compiles against and links: ada built once per c++ compiler
export const adaBuild = cxx => {
  const dir = ensureAda();
  const archive = path.join(dir, `ada-${cxx.split(' ')[0].split('/').at(-1)}.a`);
  if (!fs.existsSync(archive)) {
    // built aside, then moved in: parallel builds race otherwise
    const temp = `${archive}.${process.pid}`;
    const [ command, ...args ] = cxx.split(' ');
    execFileSync(command, [ ...args, '-std=c++20', '-O3', '-fno-exceptions', '-fno-rtti', '-ffunction-sections', '-fdata-sections', '-c', path.join(dir, 'ada.cpp'), '-o', `${temp}.o` ], { stdio: [ 'ignore', 'inherit', 'inherit' ] });
    execFileSync('ar', [ 'rcs', temp, `${temp}.o` ]);
    fs.rmSync(`${temp}.o`, { force: true });
    fs.renameSync(temp, archive);
  }
  return { cflags: [ `-I${dir}` ], archive };
};
