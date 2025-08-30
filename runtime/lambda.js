#!/usr/bin/env node
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import compile from '../compiler/wrap.js';

// Parse arguments
const args = process.argv.slice(2);
const sourceFile = args.find(x => x[0] !== '-' && !x.includes('='));
const outputZip = args.find(x => x[0] !== '-' && !x.includes('=') && x !== sourceFile);

console.log(`Compiling ${sourceFile} to AWS Lambda function...`);

// Read source file
const source = `${fs.readFileSync(sourceFile, 'utf8').replace('handler = async', 'handler =')}

export const __Porffor_handler = () => {
  const res = handler();
  if (Porffor.type(res) == Porffor.TYPES.bytestring) return res;
  return JSON.stringify(res);
};`;

const binaryPath = 'bootstrap';
const cPath = 'bootstrap.c';

Prefs.allocator = 'oneshot'; // oneshot is faster for lambda
Prefs.target = 'c';
Prefs.o = cPath;
Prefs.lambda = true;

compile(source, true);

if (Prefs.d) execSync(`gcc -lm -O0 -g -flto -march=x86-64-v3 -o ${binaryPath} ${cPath}`, { stdio: 'inherit' });
  else execSync(`gcc -lm -Os -s -flto -march=x86-64-v3 -o ${binaryPath} ${cPath}`, { stdio: 'inherit' });

try {
  execSync(`zip -r "${outputZip}" ${binaryPath}`, { stdio: 'inherit' });
  console.log(`Lambda function packaged to ${outputZip}`);
} catch (e) {
  console.error('Error creating zip file:', e.message);
  process.exit(1);
} finally {
  if (!Prefs.d) {
    fs.rmSync(binaryPath, { force: true });
    fs.rmSync(cPath, { force: true });
  }
}