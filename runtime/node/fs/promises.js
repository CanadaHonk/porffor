import { promises } from '../fs.js';

export const {
  access, appendFile, chmod, chown, constants, copyFile, cp, link, lstat, mkdir, mkdtemp, open, opendir, readFile, readdir, readlink, realpath, rename, rm,
  rmdir, stat, symlink, unlink, utimes, writeFile
} = promises;

export default promises;
