import { readFileSync } from 'node:fs';
import { stdout } from 'node:process';

let file = process.argv[1];

let out = readFileSync(file, 'utf8');
stdout.write(out);