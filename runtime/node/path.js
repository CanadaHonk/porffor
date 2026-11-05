import { cwd as processCwd } from './internal/host.js';
import { validateString } from './internal/validators.js';

const CHAR_UPPERCASE_A = 65, CHAR_LOWERCASE_A = 97, CHAR_UPPERCASE_Z = 90, CHAR_LOWERCASE_Z = 122;
const CHAR_DOT = 46, CHAR_FORWARD_SLASH = 47, CHAR_BACKWARD_SLASH = 92, CHAR_COLON = 58;

function isPathSeparator(code) {
  return code === CHAR_FORWARD_SLASH || code === CHAR_BACKWARD_SLASH;
}

function isPosixPathSeparator(code) {
  return code === CHAR_FORWARD_SLASH;
}

function isWindowsDeviceRoot(code) {
  return (code >= CHAR_UPPERCASE_A && code <= CHAR_UPPERCASE_Z) || (code >= CHAR_LOWERCASE_A && code <= CHAR_LOWERCASE_Z);
}

// resolves . and .. segments and drops empty ones
function normalizeString(path, allowAboveRoot, separator = '/', isSep = isPosixPathSeparator) {
  let res = '';
  let lastSegmentLength = 0;
  let lastSlash = -1;
  let dots = 0;
  let code = 0;
  for (let i = 0; i <= path.length; ++i) {
    if (i < path.length) code = path.charCodeAt(i);
      else if (isSep(code)) break;
      else code = CHAR_FORWARD_SLASH;

    if (isSep(code)) {
      if (dots === 2) {
        if (res.length !== 0 && (lastSegmentLength !== 2 || !res.endsWith('..'))) {
          const lastSlashIndex = res.length - lastSegmentLength - 1;
          if (res.length > 2 && lastSlashIndex !== -1) {
            res = res.slice(0, lastSlashIndex);
            lastSegmentLength = res.length - 1 - res.lastIndexOf(separator);
          } else {
            res = '';
            lastSegmentLength = 0;
          }
        } else if (allowAboveRoot) {
          res += res.length > 0 ? `${separator}..` : '..';
          lastSegmentLength = 2;
        }
      } else if (lastSlash !== i - 1 && dots !== 1) {
        if (res.length > 0) res += `${separator}${path.slice(lastSlash + 1, i)}`;
          else res = path.slice(lastSlash + 1, i);
        lastSegmentLength = i - lastSlash - 1;
      }
      lastSlash = i;
      dots = 0;
    } else if (code === CHAR_DOT && dots !== -1) {
      ++dots;
    } else {
      dots = -1;
    }
  }
  return res;
}

// \\server\share: [ server end, share start, share end ], null when the path has no such root
const uncRoot = path => {
  const len = path.length;
  let j = 2;
  while (j < len && !isPathSeparator(path.charCodeAt(j))) j++;
  const serverEnd = j;
  if (j === len || j === 2) return null;
  while (j < len && isPathSeparator(path.charCodeAt(j))) j++;
  const shareStart = j;
  if (j === len) return null;
  while (j < len && !isPathSeparator(path.charCodeAt(j))) j++;
  return [ serverEnd, shareStart, j ];
};

// win32 starts past a drive letter and splits on both separators
const baseOf = (path, suffix, from = 0, isSep = isPosixPathSeparator) => {
  let start = from, end = -1;
  let matchedSlash = true;
  if (suffix !== undefined && suffix.length > 0 && suffix.length <= path.length) {
    if (suffix === path) return '';
    let extIdx = suffix.length - 1;
    let firstNonSlashEnd = -1;
    for (let i = path.length - 1; i >= from; --i) {
      const code = path.charCodeAt(i);
      if (isSep(code)) {
        if (!matchedSlash) {
          start = i + 1;
          break;
        }
      } else {
        if (firstNonSlashEnd === -1) {
          matchedSlash = false;
          firstNonSlashEnd = i + 1;
        }
        if (extIdx >= 0) {
          if (code === suffix.charCodeAt(extIdx)) {
            if (--extIdx === -1) end = i;
          } else {
            extIdx = -1;
            end = firstNonSlashEnd;
          }
        }
      }
    }

    if (start === end) end = firstNonSlashEnd;
      else if (end === -1) end = path.length;
    return path.slice(start, end);
  }

  for (let i = path.length - 1; i >= from; --i) {
    if (isSep(path.charCodeAt(i))) {
      if (!matchedSlash) {
        start = i + 1;
        break;
      }
    } else if (end === -1) {
      matchedSlash = false;
      end = i + 1;
    }
  }
  return end === -1 ? '' : path.slice(start, end);
};

// the last segment: [ start, extension dot (-1 for none), end (-1 for none) ]
const scanName = (path, start, startPart, isSep) => {
  let startDot = -1;
  let end = -1;
  let matchedSlash = true;
  let preDotState = 0;
  for (let i = path.length - 1; i >= start; --i) {
    const code = path.charCodeAt(i);
    if (isSep(code)) {
      if (!matchedSlash) {
        startPart = i + 1;
        break;
      }
      continue;
    }
    if (end === -1) {
      matchedSlash = false;
      end = i + 1;
    }
    if (code === CHAR_DOT) {
      if (startDot === -1) startDot = i;
        else if (preDotState !== 1) preDotState = 1;
    } else if (startDot !== -1) {
      preDotState = -1;
    }
  }

  // a leading dot or .. is no extension
  if (preDotState === 0 || (preDotState === 1 && startDot === end - 1 && startDot === startPart + 1)) startDot = -1;
  return [ startPart, startDot, end ];
};

const parseName = (ret, path, start, startDot, end) => {
  ret.base = path.slice(start, end);
  if (startDot === -1) {
    ret.name = ret.base;
  } else {
    ret.name = path.slice(start, startDot);
    ret.ext = path.slice(startDot, end);
  }
};

const formatPath = (pathObject, sep) => {
  const dir = pathObject.dir || pathObject.root;
  const ext = pathObject.ext ? `${pathObject.ext[0] === '.' ? '' : '.'}${pathObject.ext}` : '';
  const base = pathObject.base || `${pathObject.name || ''}${ext}`;
  if (!dir) return base;
  return dir === pathObject.root ? `${dir}${base}` : `${dir}${sep}${base}`;
};

// past a leading drive letter, which basename and extname skip
const driveEnd = path => path.length >= 2 && isWindowsDeviceRoot(path.charCodeAt(0)) && path.charCodeAt(1) === CHAR_COLON ? 2 : 0;

// win32 without resolving against a cwd (resolve, relative, toNamespacedPath)
const win32 = {
  normalize(path) {
    validateString(path, 'path');
    const len = path.length;
    if (len === 0) return '.';
    const code = path.charCodeAt(0);
    if (len === 1) return isPathSeparator(code) ? '\\' : path;

    let rootEnd = 0, device, isAbsolute = false;
    if (isPathSeparator(code)) {
      isAbsolute = true;
      rootEnd = 1;
      const unc = isPathSeparator(path.charCodeAt(1)) ? uncRoot(path) : null;
      if (unc !== null) {
        if (unc[2] === len) return `\\\\${path.slice(2, unc[0])}\\${path.slice(unc[1])}\\`;
        device = `\\\\${path.slice(2, unc[0])}\\${path.slice(unc[1], unc[2])}`;
        rootEnd = unc[2];
      }
    } else if (isWindowsDeviceRoot(code) && path.charCodeAt(1) === CHAR_COLON) {
      device = path.slice(0, 2);
      rootEnd = 2;
      if (len > 2 && isPathSeparator(path.charCodeAt(2))) {
        isAbsolute = true;
        rootEnd = 3;
      }
    }

    let tail = rootEnd < len ? normalizeString(path.slice(rootEnd), !isAbsolute, '\\', isPathSeparator) : '';
    if (tail.length === 0 && !isAbsolute) tail = '.';
    if (tail.length > 0 && isPathSeparator(path.charCodeAt(len - 1))) tail += '\\';
    return `${device ?? ''}${isAbsolute ? '\\' : ''}${tail}`;
  },

  join(...args) {
    for (const arg of args) validateString(arg, 'path');
    const parts = args.filter(arg => arg.length > 0);
    if (parts.length === 0) return '.';
    const joined = parts.join('\\');
    // leading separators collapse to one, unless the first part starts a unc root
    return win32.normalize(/^[\\/]{2}[^\\/]/.test(parts[0]) ? joined : joined.replace(/^[\\/]{2,}/, '\\'));
  },

  dirname(path) {
    return win32.parse(path).dir || '.';
  },

  basename(path, suffix) {
    if (suffix !== undefined) validateString(suffix, 'suffix');
    validateString(path, 'path');
    return baseOf(path, suffix, driveEnd(path), isPathSeparator);
  },

  extname(path) {
    validateString(path, 'path');
    const [ , startDot, end ] = scanName(path, driveEnd(path), driveEnd(path), isPathSeparator);
    return startDot === -1 ? '' : path.slice(startDot, end);
  },

  format(pathObject) {
    return formatPath(pathObject, '\\');
  },

  isAbsolute(path) {
    validateString(path, 'path');
    const code = path.charCodeAt(0);
    return isPathSeparator(code) || (path.length > 2 && isWindowsDeviceRoot(code) && path.charCodeAt(1) === CHAR_COLON && isPathSeparator(path.charCodeAt(2)));
  },

  parse(path) {
    validateString(path, 'path');
    const ret = { root: '', dir: '', base: '', ext: '', name: '' };
    const len = path.length;
    if (len === 0) return ret;

    const code = path.charCodeAt(0);
    if (len === 1) {
      if (isPathSeparator(code)) ret.root = ret.dir = path;
        else ret.base = ret.name = path;
      return ret;
    }

    let rootEnd = 0;
    if (isPathSeparator(code)) {
      rootEnd = 1;
      if (isPathSeparator(path.charCodeAt(1))) {
        const unc = uncRoot(path);
        if (unc !== null) rootEnd = unc[2] === len ? len : unc[2] + 1;
      }
    } else if (isWindowsDeviceRoot(code) && path.charCodeAt(1) === CHAR_COLON) {
      if (len === 2 || (len === 3 && isPathSeparator(path.charCodeAt(2)))) {
        ret.root = ret.dir = path;
        return ret;
      }
      rootEnd = isPathSeparator(path.charCodeAt(2)) ? 3 : 2;
    }
    if (rootEnd > 0) ret.root = path.slice(0, rootEnd);

    const [ startPart, startDot, end ] = scanName(path, rootEnd, rootEnd, isPathSeparator);
    if (end !== -1) parseName(ret, path, startPart, startDot, end);
    ret.dir = startPart > 0 && startPart !== rootEnd ? path.slice(0, startPart - 1) : ret.root;
    return ret;
  },

  sep: '\\',
  delimiter: ';',
  win32: null,
  posix: null
};

const posix = {
  resolve(...args) {
    if (args.length === 0 || (args.length === 1 && (args[0] === '' || args[0] === '.'))) {
      const cwd = processCwd();
      if (cwd.charCodeAt(0) === CHAR_FORWARD_SLASH) return cwd;
    }

    let resolvedPath = '';
    let resolvedAbsolute = false;
    for (let i = args.length - 1; i >= 0 && !resolvedAbsolute; i--) {
      const path = args[i];
      validateString(path, `paths[${i}]`);
      if (path.length === 0) continue;
      resolvedPath = `${path}/${resolvedPath}`;
      resolvedAbsolute = path[0] === '/';
    }

    if (!resolvedAbsolute) {
      const cwd = processCwd();
      resolvedPath = `${cwd}/${resolvedPath}`;
      resolvedAbsolute = cwd.charCodeAt(0) === CHAR_FORWARD_SLASH;
    }

    resolvedPath = normalizeString(resolvedPath, !resolvedAbsolute);
    return resolvedAbsolute ? `/${resolvedPath}` : resolvedPath || '.';
  },

  normalize(path) {
    validateString(path, 'path');
    if (path.length === 0) return '.';

    const isAbsolute = path[0] === '/';
    const trailingSeparator = path[path.length - 1] === '/';
    path = normalizeString(path, !isAbsolute);
    if (path.length === 0) return isAbsolute ? '/' : trailingSeparator ? './' : '.';
    if (trailingSeparator) path += '/';
    return isAbsolute ? `/${path}` : path;
  },

  isAbsolute(path) {
    validateString(path, 'path');
    return path.charCodeAt(0) === CHAR_FORWARD_SLASH;
  },

  join(...args) {
    for (const arg of args) validateString(arg, 'path');
    const joined = args.filter(arg => arg.length > 0).join('/');
    return joined.length === 0 ? '.' : posix.normalize(joined);
  },

  relative(from, to) {
    validateString(from, 'from');
    validateString(to, 'to');
    if (from === to) return '';

    from = posix.resolve(from);
    to = posix.resolve(to);
    if (from === to) return '';

    // both are absolute, so compare after the leading /
    const fromStart = 1, fromEnd = from.length, fromLen = fromEnd - fromStart;
    const toStart = 1, toLen = to.length - toStart;
    const length = fromLen < toLen ? fromLen : toLen;
    let lastCommonSep = -1;
    let i = 0;
    for (; i < length; i++) {
      const fromCode = from.charCodeAt(fromStart + i);
      if (fromCode !== to.charCodeAt(toStart + i)) break;
        else if (fromCode === CHAR_FORWARD_SLASH) lastCommonSep = i;
    }
    if (i === length) {
      if (toLen > length) {
        if (to.charCodeAt(toStart + i) === CHAR_FORWARD_SLASH) return to.slice(toStart + i + 1);
        if (i === 0) return to.slice(toStart + i);
      } else if (fromLen > length) {
        if (from.charCodeAt(fromStart + i) === CHAR_FORWARD_SLASH) lastCommonSep = i;
          else if (i === 0) lastCommonSep = 0;
      }
    }

    let out = '';
    for (i = fromStart + lastCommonSep + 1; i <= fromEnd; ++i) {
      if (i === fromEnd || from.charCodeAt(i) === CHAR_FORWARD_SLASH) out += out.length === 0 ? '..' : '/..';
    }
    return `${out}${to.slice(toStart + lastCommonSep)}`;
  },

  toNamespacedPath(path) {
    return path;
  },

  dirname(path) {
    validateString(path, 'path');
    if (path.length === 0) return '.';
    const hasRoot = path.charCodeAt(0) === CHAR_FORWARD_SLASH;
    // the separator before the last segment, ignoring trailing ones
    let end = -1, matchedSlash = true;
    for (let i = path.length - 1; i >= 1 && end === -1; --i) {
      if (path.charCodeAt(i) !== CHAR_FORWARD_SLASH) matchedSlash = false;
        else if (!matchedSlash) end = i;
    }
    if (end === -1) return hasRoot ? '/' : '.';
    if (hasRoot && end === 1) return '//';
    return path.slice(0, end);
  },

  basename(path, suffix) {
    if (suffix !== undefined) validateString(suffix, 'suffix');
    validateString(path, 'path');
    return baseOf(path, suffix);
  },

  extname(path) {
    validateString(path, 'path');
    const [ , startDot, end ] = scanName(path, 0, 0, isPosixPathSeparator);
    return startDot === -1 ? '' : path.slice(startDot, end);
  },

  format(pathObject) {
    return formatPath(pathObject, '/');
  },

  parse(path) {
    validateString(path, 'path');
    const ret = { root: '', dir: '', base: '', ext: '', name: '' };
    if (path.length === 0) return ret;

    const isAbsolute = path.charCodeAt(0) === CHAR_FORWARD_SLASH;
    if (isAbsolute) ret.root = '/';
    const [ startPart, startDot, end ] = scanName(path, isAbsolute ? 1 : 0, 0, isPosixPathSeparator);
    if (end !== -1) parseName(ret, path, startPart === 0 && isAbsolute ? 1 : startPart, startDot, end);
    if (startPart > 0) ret.dir = path.slice(0, startPart - 1);
      else if (isAbsolute) ret.dir = '/';
    return ret;
  },

  sep: '/',
  delimiter: ':',
  win32: null,
  posix: null
};

posix.win32 = win32.win32 = win32;
posix.posix = win32.posix = posix;

export const { resolve, normalize, isAbsolute, join, relative, toNamespacedPath, dirname, basename, extname, format, parse, sep, delimiter } = posix;
export { win32, posix };
export default posix;
