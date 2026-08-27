Porffor.c`
static char *__porffor_node_cstr(char *memory, jsval value, i32 type, char **owned) {
  *owned = NULL;
  u32 ptr = value.val < 0 ? (u32)(i32)value.val : (u32)value.val;
  i32 len = *((i32*)(memory + ptr));
  if (type == 195) {
    char *out = malloc((size_t)len + 1);
    memcpy(out, memory + ptr + 4, (size_t)len);
    out[len] = 0;
    *owned = out;
    return out;
  }

  if (type == 67) {
    char *out = malloc((size_t)len + 1);
    for (i32 i = 0; i < len; i++) out[i] = (char)(*((u16*)(memory + ptr + 4 + i * 2)) & 0xff);
    out[len] = 0;
    *owned = out;
    return out;
  }

  return memory + ptr + 4;
}

static int __porffor_rm_rf(const char *path) {
  struct stat st;
  if (lstat(path, &st) != 0) return -1;

  if (S_ISDIR(st.st_mode)) {
    DIR *dir = opendir(path);
    if (!dir) return -1;

    struct dirent *entry;
    char child[4096];
    while ((entry = readdir(dir))) {
      if (!strcmp(entry->d_name, ".") || !strcmp(entry->d_name, "..")) continue;
      snprintf(child, sizeof(child), "%s/%s", path, entry->d_name);
      __porffor_rm_rf(child);
    }

    closedir(dir);
    return rmdir(path);
  }

  return unlink(path);
}

static u32 __porffor_utf8_next(u8 *data, i32 len, i32 *i) {
  u8 b0 = data[(*i)++];
  if (b0 < 0x80) return b0;
  if (b0 >= 0xc2 && b0 <= 0xdf) {
    if (*i < len && (data[*i] & 0xc0) == 0x80) return ((u32)(b0 & 0x1f) << 6) | (data[(*i)++] & 0x3f);
  } else if (b0 == 0xe0) {
    if (*i + 1 < len && data[*i] >= 0xa0 && data[*i] <= 0xbf && (data[*i + 1] & 0xc0) == 0x80) {
      u32 cp = ((u32)(b0 & 0x0f) << 12) | ((u32)(data[*i] & 0x3f) << 6) | (data[*i + 1] & 0x3f);
      *i += 2;
      return cp;
    }
  } else if ((b0 >= 0xe1 && b0 <= 0xec) || (b0 >= 0xee && b0 <= 0xef)) {
    if (*i + 1 < len && (data[*i] & 0xc0) == 0x80 && (data[*i + 1] & 0xc0) == 0x80) {
      u32 cp = ((u32)(b0 & 0x0f) << 12) | ((u32)(data[*i] & 0x3f) << 6) | (data[*i + 1] & 0x3f);
      *i += 2;
      return cp;
    }
  } else if (b0 == 0xed) {
    if (*i + 1 < len && data[*i] >= 0x80 && data[*i] <= 0x9f && (data[*i + 1] & 0xc0) == 0x80) {
      u32 cp = ((u32)(b0 & 0x0f) << 12) | ((u32)(data[*i] & 0x3f) << 6) | (data[*i + 1] & 0x3f);
      *i += 2;
      return cp;
    }
  } else if (b0 == 0xf0) {
    if (*i + 2 < len && data[*i] >= 0x90 && data[*i] <= 0xbf && (data[*i + 1] & 0xc0) == 0x80 && (data[*i + 2] & 0xc0) == 0x80) {
      u32 cp = ((u32)(b0 & 0x07) << 18) | ((u32)(data[*i] & 0x3f) << 12) | ((u32)(data[*i + 1] & 0x3f) << 6) | (data[*i + 2] & 0x3f);
      *i += 3;
      return cp;
    }
  } else if (b0 >= 0xf1 && b0 <= 0xf3) {
    if (*i + 2 < len && (data[*i] & 0xc0) == 0x80 && (data[*i + 1] & 0xc0) == 0x80 && (data[*i + 2] & 0xc0) == 0x80) {
      u32 cp = ((u32)(b0 & 0x07) << 18) | ((u32)(data[*i] & 0x3f) << 12) | ((u32)(data[*i + 1] & 0x3f) << 6) | (data[*i + 2] & 0x3f);
      *i += 3;
      return cp;
    }
  } else if (b0 == 0xf4) {
    if (*i + 2 < len && data[*i] >= 0x80 && data[*i] <= 0x8f && (data[*i + 1] & 0xc0) == 0x80 && (data[*i + 2] & 0xc0) == 0x80) {
      u32 cp = ((u32)(b0 & 0x07) << 18) | ((u32)(data[*i] & 0x3f) << 12) | ((u32)(data[*i + 1] & 0x3f) << 6) | (data[*i + 2] & 0x3f);
      *i += 3;
      return cp;
    }
  }
  return 0xfffd;
}

static i32 __porffor_utf8_units(char *memory, jsval value, i32 type) {
  (void)type;
  u32 ptr = value.val < 0 ? (u32)(i32)value.val : (u32)value.val;
  i32 len = *((i32*)(memory + ptr));
  u8 *data = (u8*)(memory + ptr + 4);
  i32 units = 0;
  i32 ascii = 1;
  for (i32 i = 0; i < len;) {
    if (data[i] >= 0x80) ascii = 0;
    u32 cp = __porffor_utf8_next(data, len, &i);
    units += cp > 0xffff ? 2 : 1;
  }
  return ascii ? -1 : units;
}

static void __porffor_utf8_decode(char *memory, jsval value, i32 type, jsval out) {
  (void)type;
  u32 ptr = value.val < 0 ? (u32)(i32)value.val : (u32)value.val;
  u32 out_ptr = out.val < 0 ? (u32)(i32)out.val : (u32)out.val;
  i32 len = *((i32*)(memory + ptr));
  u8 *data = (u8*)(memory + ptr + 4);
  u16 *dst = (u16*)(memory + out_ptr + 4);
  i32 j = 0;
  for (i32 i = 0; i < len;) {
    u32 cp = __porffor_utf8_next(data, len, &i);
    if (cp <= 0xffff) {
      dst[j++] = (u16)cp;
    } else {
      cp -= 0x10000;
      dst[j++] = 0xd800 | (cp >> 10);
      dst[j++] = 0xdc00 | (cp & 0x3ff);
    }
  }
  dst[j] = 0;
}

static void __porffor_write_utf8(FILE *file, char *memory, u32 ptr) {
  i32 len = *((i32*)(memory + ptr));
  for (i32 i = 0; i < len; i++) {
    u32 cp = *((u16*)(memory + ptr + 4 + i * 2));
    if (cp >= 0xd800 && cp <= 0xdbff && i + 1 < len) {
      u32 lo = *((u16*)(memory + ptr + 4 + (i + 1) * 2));
      if (lo >= 0xdc00 && lo <= 0xdfff) {
        cp = 0x10000 + ((cp - 0xd800) << 10) + (lo - 0xdc00);
        i++;
      }
    }
    if (cp >= 0xd800 && cp <= 0xdfff) cp = 0xfffd;

    if (cp < 0x80) {
      fputc((int)cp, file);
    } else if (cp < 0x800) {
      fputc((int)(0xc0 | (cp >> 6)), file);
      fputc((int)(0x80 | (cp & 0x3f)), file);
    } else if (cp < 0x10000) {
      fputc((int)(0xe0 | (cp >> 12)), file);
      fputc((int)(0x80 | ((cp >> 6) & 0x3f)), file);
      fputc((int)(0x80 | (cp & 0x3f)), file);
    } else {
      fputc((int)(0xf0 | (cp >> 18)), file);
      fputc((int)(0x80 | ((cp >> 12) & 0x3f)), file);
      fputc((int)(0x80 | ((cp >> 6) & 0x3f)), file);
      fputc((int)(0x80 | (cp & 0x3f)), file);
    }
  }
}
`;

const nativeIsTTY = fd => {
  let out = 0;
  Porffor.c`out = isatty((int)fd.val);`;
  return out !== 0;
};

const nativeArgc = () => {
  let out = 0;
  Porffor.c`out = porf_argc;`;
  return out;
};

const nativeArgv = argIndex => {
  let len = 0;
  Porffor.c`len = strlen(porf_argv[(i32)argIndex.val]);`;

  const out = Porffor.malloc(len + 6);
  Porffor.c`u32 out_ptr = out.val < 0 ? (u32)(i32)out.val : (u32)out.val; *((i32*)(MEM + out_ptr)) = (i32)len; memcpy(MEM + out_ptr + 4, porf_argv[(i32)argIndex.val], (size_t)len); *(MEM + out_ptr + 4 + (i32)len) = 0;`;
  return Porffor.as(out, Porffor.TYPES.bytestring);
};

const nativePlatform = () => {
  let len = 5;
  Porffor.c`
#ifdef __APPLE__
  len = 6;
#elif defined(_WIN32)
  len = 5;
#else
  len = 5;
#endif
`;

  const out = Porffor.malloc(len + 6);
  Porffor.c`
u32 out_ptr = out.val < 0 ? (u32)(i32)out.val : (u32)out.val;
#ifdef __APPLE__
  *((i32*)(MEM + out_ptr)) = 6; memcpy(MEM + out_ptr + 4, "darwin", 6); *(MEM + out_ptr + 10) = 0;
#elif defined(_WIN32)
  *((i32*)(MEM + out_ptr)) = 5; memcpy(MEM + out_ptr + 4, "win32", 5); *(MEM + out_ptr + 9) = 0;
#else
  *((i32*)(MEM + out_ptr)) = 5; memcpy(MEM + out_ptr + 4, "linux", 5); *(MEM + out_ptr + 9) = 0;
#endif
`;
  return Porffor.as(out, Porffor.TYPES.bytestring);
};

const nativeReadLine = () => {
  let len = -1;
  Porffor.c`
char line[8192];
if (fgets(line, sizeof(line), stdin) != NULL) len = strlen(line);
`;
  if (len < 0) return undefined;

  const out = Porffor.malloc(len + 6);
  Porffor.c`
u32 out_ptr = out.val < 0 ? (u32)(i32)out.val : (u32)out.val;
*((i32*)(MEM + out_ptr)) = (i32)len;
memcpy(MEM + out_ptr + 4, line, (size_t)len);
*(MEM + out_ptr + 4 + (i32)len) = 0;
`;
  return Porffor.as(out, Porffor.TYPES.bytestring);
};

const readFileSync = (path, encoding = undefined) => {
  const pathType = Porffor.type(path);
  let len = -1;
  let buf = 0;
  Porffor.c`
{
char *path_owned;
char *path_ptr = __porffor_node_cstr(MEM, path, (i32)pathType.val, &path_owned);
FILE *file = fopen(path_ptr, "rb");
if (file) {
  fseek(file, 0, SEEK_END);
  len = ftell(file);
  fseek(file, 0, SEEK_SET);
  if ((i32)len > 0) {
    void *tmp = malloc((size_t)len);
    if (!tmp || fread(tmp, 1, (size_t)len, file) != (size_t)len) {
      if (tmp) free(tmp);
      len = -1;
    } else {
      buf = (f64)(u64)tmp;
    }
  }
  fclose(file);
}
if (path_owned) free(path_owned);
}
`;

  if (len < 0) {
    Porffor.printString('fs.readFileSync failed\n');
    throw new Error('readFileSync failed');
  }

const out = Porffor.malloc(len + 6);
Porffor.c`
u32 out_ptr = out.val < 0 ? (u32)(i32)out.val : (u32)out.val;
*((i32*)(MEM + out_ptr)) = (i32)len;
if ((i32)len > 0) {
  memcpy(MEM + out_ptr + 4, (void*)(u64)buf, (size_t)len);
  free((void*)(u64)buf);
}
*(MEM + out_ptr + 4 + (i32)len) = 0;
  `;
  if (encoding !== undefined) {
    let units = 0;
    Porffor.c`units = __porffor_utf8_units(MEM, out, 195);`;
    if (units < 0) return Porffor.as(out, Porffor.TYPES.bytestring);

    const str = Porffor.malloc(units * 2 + 6);
    Porffor.c`
u32 str_ptr = str.val < 0 ? (u32)(i32)str.val : (u32)str.val;
*((i32*)(MEM + str_ptr)) = (i32)units;
__porffor_utf8_decode(MEM, out, 195, str);
`;
    return Porffor.as(str, Porffor.TYPES.string);
  }

  return Porffor.as(out, Porffor.TYPES.bytestring);
};

const writeFileSync = (path, nodeFileData) => {
  const pathType = Porffor.type(path);
  const dataType = Porffor.type(nodeFileData);
  let status = 0;
  Porffor.c`
char *path_owned;
char *path_ptr = __porffor_node_cstr(MEM, path, (i32)pathType.val, &path_owned);
FILE *file = fopen(path_ptr, "wb");
u32 data_ptr = nodeFileData.val < 0 ? (u32)(i32)nodeFileData.val : (u32)nodeFileData.val;
if (!file) {
  status = 1;
} else if ((i32)dataType.val == 195) {
  i32 len = *((i32*)(MEM + data_ptr));
  fwrite(MEM + data_ptr + 4, 1, (size_t)len, file);
} else if ((i32)dataType.val == 67) {
  __porffor_write_utf8(file, MEM, data_ptr);
} else if ((i32)dataType.val >= 80 && (i32)dataType.val <= 90) {
  i32 len = *((i32*)(MEM + data_ptr));
  u32 buffer = *((u32*)(MEM + data_ptr + 4));
  i32 bytes = 1;
  if ((i32)dataType.val == 83 || (i32)dataType.val == 84) bytes = 2;
  if ((i32)dataType.val == 85 || (i32)dataType.val == 86 || (i32)dataType.val == 89) bytes = 4;
  if ((i32)dataType.val == 87 || (i32)dataType.val == 88 || (i32)dataType.val == 90) bytes = 8;
  fwrite(MEM + buffer + 4, 1, (size_t)len * (size_t)bytes, file);
} else {
  i32 len = *((i32*)(MEM + data_ptr));
  i32 buffer = *((i32*)(MEM + data_ptr + 4));
  fwrite(MEM + (u32)buffer, 1, (size_t)len, file);
}
if (file) fclose(file);
if (path_owned) free(path_owned);
`;
  if (status !== 0) throw new Error('writeFileSync failed');
};

const statSync = path => {
  const pathType = Porffor.type(path);
  let size = -1;
  let isDir = 0;
  Porffor.c`
char *path_owned;
char *path_ptr = __porffor_node_cstr(MEM, path, (i32)pathType.val, &path_owned);
struct stat st;
if (stat(path_ptr, &st) == 0) {
  size = st.st_size;
  isDir = S_ISDIR(st.st_mode) ? 1 : 0;
}
if (path_owned) free(path_owned);
`;
  if (size < 0) throw new Error('statSync failed');
  const dir = isDir != 0;
  return { size, isDirectory: () => dir };
};

const existsSync = path => {
  const pathType = Porffor.type(path);
  let ok = 0;
  Porffor.c`
char *path_owned;
char *path_ptr = __porffor_node_cstr(MEM, path, (i32)pathType.val, &path_owned);
struct stat st;
ok = stat(path_ptr, &st) == 0;
if (path_owned) free(path_owned);
`;
  return ok !== 0;
};

const mkdtempSync = prefix => {
  const prefixType = Porffor.type(prefix);
  const out = Porffor.malloc(prefix.length + 12);
  let status = 0;
  Porffor.c`
char *prefix_owned;
char *prefix_ptr = __porffor_node_cstr(MEM, prefix, (i32)prefixType.val, &prefix_owned);
u32 out_ptr = out.val < 0 ? (u32)(i32)out.val : (u32)out.val;
i32 len = strlen(prefix_ptr);
*((i32*)(MEM + out_ptr)) = len + 6;
memcpy(MEM + out_ptr + 4, prefix_ptr, (size_t)len);
memcpy(MEM + out_ptr + 4 + len, "XXXXXX", 7);
if (!mkdtemp(MEM + out_ptr + 4)) status = 1;
if (prefix_owned) free(prefix_owned);
`;
  if (status !== 0) throw new Error('mkdtempSync failed');
  return Porffor.as(out, Porffor.TYPES.bytestring);
};

const rmSync = path => {
  const pathType = Porffor.type(path);
  Porffor.c`
char *path_owned;
char *path_ptr = __porffor_node_cstr(MEM, path, (i32)pathType.val, &path_owned);
__porffor_rm_rf(path_ptr);
if (path_owned) free(path_owned);
`;
};

const execSync = (cmd, options = {}) => {
  const cmdType = Porffor.type(cmd);
  const input = options.input;
  const inputType = Porffor.type(input);
  let status = 0;
  if (input === undefined) {
    Porffor.c`
char *cmd_owned;
char *cmd_ptr = __porffor_node_cstr(MEM, cmd, (i32)cmdType.val, &cmd_owned);
status = system(cmd_ptr);
if (cmd_owned) free(cmd_owned);
`;
  } else {
    Porffor.c`
char *cmd_owned;
char *cmd_ptr = __porffor_node_cstr(MEM, cmd, (i32)cmdType.val, &cmd_owned);
FILE *pipe = popen(cmd_ptr, "w");
if (!pipe) {
  status = 1;
} else {
  u32 input_ptr = input.val < 0 ? (u32)(i32)input.val : (u32)input.val;
  if ((i32)inputType.val == 195) {
    i32 len = *((i32*)(MEM + input_ptr));
    fwrite(MEM + input_ptr + 4, 1, (size_t)len, pipe);
  } else if ((i32)inputType.val == 67) {
    i32 len = *((i32*)(MEM + input_ptr));
    for (i32 i = 0; i < len; i++) fputc((char)(*((u16*)(MEM + input_ptr + 4 + i * 2)) & 0xff), pipe);
  }
  status = pclose(pipe);
}
if (cmd_owned) free(cmd_owned);
`;
  }

  if (status !== 0) throw new Error('execSync failed');
};

const mkdirSync = (path, options = undefined) => {
  const doOne = p => {
    const pType = Porffor.type(p);
    Porffor.c`
char *p_owned;
char *p_ptr = __porffor_node_cstr(MEM, p, (i32)pType.val, &p_owned);
mkdir(p_ptr, 0777);
if (p_owned) free(p_owned);
`;
  };

  if (!(options != null && options.recursive)) {
    doOne(path);
    return;
  }

  const parts = path.split('/');
  let acc = '';
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part === '') continue;
    if (i == 0 && path[0] != '/') acc = part;
      else acc = acc + '/' + part;
    doOne(acc);
  }
};

const readdirSync = path => {
  const pathType = Porffor.type(path);
  let len = -1;
  let buf = 0;
  Porffor.c`
{
char *path_owned;
char *path_ptr = __porffor_node_cstr(MEM, path, (i32)pathType.val, &path_owned);
DIR *dir = opendir(path_ptr);
if (dir) {
  size_t cap = 4096, used = 0;
  char *tmp = malloc(cap);
  struct dirent *entry;
  while (tmp && (entry = readdir(dir))) {
    if (!strcmp(entry->d_name, ".") || !strcmp(entry->d_name, "..")) continue;
    const size_t nl = strlen(entry->d_name);
    if (used + nl + 2 > cap) {
      cap = cap * 2 + nl;
      char *next = realloc(tmp, cap);
      if (!next) { free(tmp); tmp = NULL; break; }
      tmp = next;
    }
    if (used > 0) tmp[used++] = '\n';
    memcpy(tmp + used, entry->d_name, nl);
    used += nl;
  }
  closedir(dir);
  if (tmp) {
    len = (i32)used;
    buf = (f64)(u64)tmp;
  }
}
if (path_owned) free(path_owned);
}
`;
  if (len < 0) throw new Error('readdirSync failed');

  const out = Porffor.malloc(len + 6);
  Porffor.c`
u32 out_ptr = out.val < 0 ? (u32)(i32)out.val : (u32)out.val;
*((i32*)(MEM + out_ptr)) = (i32)len;
if ((i32)len > 0) {
  memcpy(MEM + out_ptr + 4, (void*)(u64)buf, (size_t)len);
  free((void*)(u64)buf);
}
*(MEM + out_ptr + 4 + (i32)len) = 0;
`;
  const joined = Porffor.as(out, Porffor.TYPES.bytestring);
  if (joined.length == 0) return [];
  return joined.split('\n');
};

const renameSync = (from, to) => {
  const fromType = Porffor.type(from);
  const toType = Porffor.type(to);
  let status = 0;
  Porffor.c`
char *from_owned, *to_owned;
char *from_ptr = __porffor_node_cstr(MEM, from, (i32)fromType.val, &from_owned);
char *to_ptr = __porffor_node_cstr(MEM, to, (i32)toType.val, &to_owned);
status = rename(from_ptr, to_ptr);
if (from_owned) free(from_owned);
if (to_owned) free(to_owned);
`;
  if (status != 0) throw new Error('renameSync failed');
};

const symlinkSync = (target, path) => {
  const targetType = Porffor.type(target);
  const pathType = Porffor.type(path);
  let status = 0;
  Porffor.c`
char *target_owned, *path_owned;
char *target_ptr = __porffor_node_cstr(MEM, target, (i32)targetType.val, &target_owned);
char *path_ptr = __porffor_node_cstr(MEM, path, (i32)pathType.val, &path_owned);
status = symlink(target_ptr, path_ptr);
if (target_owned) free(target_owned);
if (path_owned) free(path_owned);
`;
  if (status != 0) throw new Error('symlinkSync failed');
};

const cpSync = (src, dest) => {
  const st = statSync(src);
  if (st.isDirectory()) {
    mkdirSync(dest, { recursive: true });
    const entries = readdirSync(src);
    for (let i = 0; i < entries.length; i++) {
      cpSync(src + '/' + entries[i], dest + '/' + entries[i]);
    }
    return;
  }
  writeFileSync(dest, readFileSync(src));
};

const __porffor_execFile = (cmd, args, envArr, cwd, input, mode) => {
  const cmdType = Porffor.type(cmd);
  const envType = Porffor.type(envArr);
  const cwdType = Porffor.type(cwd);
  const inputType = Porffor.type(input);
  let status = 0;
  let outLen = 0, outBuf = 0, errLen = 0, errBuf = 0;

  Porffor.c`
{
  signal(SIGPIPE, SIG_IGN);
  char *cmd_owned;
  char *cmd_ptr = __porffor_node_cstr(MEM, cmd, (i32)cmdType.val, &cmd_owned);

  const u32 arr = args.val < 0 ? (u32)(i32)args.val : (u32)args.val;
  const i32 argn = *((i32*)(MEM + arr));
  const u32 ent = *((u32*)(MEM + arr + 4));
  char **cargv = calloc((size_t)argn + 2, sizeof(char*));
  char **argown = calloc((size_t)argn + 2, sizeof(char*));
  cargv[0] = cmd_ptr;
  for (i32 i = 0; i < argn; i++) {
    const jsval av = porf_unpack(*(jsbits*)(MEM + ent + (u64)i * 8));
    cargv[i + 1] = __porffor_node_cstr(MEM, av, porf_jv_type(av), &argown[i + 1]);
  }

  char **cenv = NULL;
  char **envown = NULL;
  i32 envn = 0;
  if ((i32)envType.val == 72) {
    const u32 earr = envArr.val < 0 ? (u32)(i32)envArr.val : (u32)envArr.val;
    envn = *((i32*)(MEM + earr));
    const u32 eent = *((u32*)(MEM + earr + 4));
    cenv = calloc((size_t)envn + 1, sizeof(char*));
    envown = calloc((size_t)envn + 1, sizeof(char*));
    for (i32 i = 0; i < envn; i++) {
      const jsval ev = porf_unpack(*(jsbits*)(MEM + eent + (u64)i * 8));
      cenv[i] = __porffor_node_cstr(MEM, ev, porf_jv_type(ev), &envown[i]);
    }
  }

  char *cwd_owned = NULL;
  char *cwd_ptr = NULL;
  if ((i32)cwdType.val != 0) cwd_ptr = __porffor_node_cstr(MEM, cwd, (i32)cwdType.val, &cwd_owned);

  // stdout/stderr go via temp files (no pipe deadlock); stdin via a pipe
  const int capture = (i32)mode.val == 0;
  char outtmp[] = "/tmp/porffor-exec-out-XXXXXX";
  char errtmp[] = "/tmp/porffor-exec-err-XXXXXX";
  int outfd = -1, errfd = -1;
  if (capture) {
    outfd = mkstemp(outtmp);
    errfd = mkstemp(errtmp);
  }
  int inpipe[2];
  if (pipe(inpipe) != 0) {
    status = -1;
  } else {
    const pid_t pid = fork();
    if (pid == 0) {
      if (cwd_ptr && chdir(cwd_ptr) != 0) _exit(127);
      dup2(inpipe[0], 0);
      close(inpipe[0]);
      close(inpipe[1]);
      if (capture) {
        dup2(outfd, 1);
        dup2(errfd, 2);
      } else if ((i32)mode.val == 2) {
        freopen("/dev/null", "w", stdout);
        freopen("/dev/null", "w", stderr);
      }
      if (cenv) {
        extern char **environ;
        environ = cenv;
      }
      execvp(cmd_ptr, cargv);
      _exit(127);
    }
    close(inpipe[0]);
    if (pid < 0) {
      close(inpipe[1]);
      status = -1;
    } else {
      if ((i32)inputType.val != 0) {
        FILE *inf = fdopen(inpipe[1], "w");
        if (inf) {
          const u32 input_ptr = input.val < 0 ? (u32)(i32)input.val : (u32)input.val;
          if ((i32)inputType.val == 195) fwrite(MEM + input_ptr + 4, 1, (size_t)*((i32*)(MEM + input_ptr)), inf);
            else if ((i32)inputType.val == 67) __porffor_write_utf8(inf, MEM, input_ptr);
          fclose(inf);
        } else close(inpipe[1]);
      } else close(inpipe[1]);

      int child_status = 0;
      if (waitpid(pid, &child_status, 0) < 0) status = -1;
        else if (WIFEXITED(child_status)) status = WEXITSTATUS(child_status);
        else status = 128 + (WIFSIGNALED(child_status) ? WTERMSIG(child_status) : 0);
    }
  }

  if (capture) {
    for (int which = 0; which < 2; which++) {
      const int fd = which == 0 ? outfd : errfd;
      if (fd < 0) continue;
      const off_t sz = lseek(fd, 0, SEEK_END);
      lseek(fd, 0, SEEK_SET);
      char *tmp = malloc(sz > 0 ? (size_t)sz : 1);
      i32 got = 0;
      if (tmp && sz > 0) {
        ssize_t n;
        while (got < (i32)sz && (n = read(fd, tmp + got, (size_t)sz - (size_t)got)) > 0) got += (i32)n;
      }
      if (which == 0) { outBuf = (f64)(u64)tmp; outLen = got; }
        else { errBuf = (f64)(u64)tmp; errLen = got; }
      close(fd);
    }
    unlink(outtmp);
    unlink(errtmp);
  }

  for (i32 i = 0; i < argn + 2; i++) if (argown && argown[i]) free(argown[i]);
  if (envown) for (i32 i = 0; i < envn; i++) if (envown[i]) free(envown[i]);
  free(cargv);
  free(argown);
  if (cenv) free(cenv);
  if (envown) free(envown);
  if (cwd_owned) free(cwd_owned);
  if (cmd_owned) free(cmd_owned);
}
`;

  const takeBuf = (len, buf) => {
    const out = Porffor.malloc(len + 6);
    Porffor.c`
u32 out_ptr = out.val < 0 ? (u32)(i32)out.val : (u32)out.val;
*((i32*)(MEM + out_ptr)) = (i32)len.val;
if ((i32)len.val > 0) memcpy(MEM + out_ptr + 4, (void*)(u64)buf.val, (size_t)len.val);
if (buf.val != 0) free((void*)(u64)buf.val);
*(MEM + out_ptr + 4 + (i32)len.val) = 0;
`;
    return Porffor.as(out, Porffor.TYPES.bytestring);
  };

  return { status, stdout: takeBuf(outLen, outBuf), stderr: takeBuf(errLen, errBuf) };
};

const __porffor_utf8OrBytes = data => {
  let units = 0;
  Porffor.c`units = __porffor_utf8_units(MEM, data, 195);`;
  if (units < 0) return data;

  const str = Porffor.malloc(units * 2 + 6);
  Porffor.c`
u32 str_ptr = str.val < 0 ? (u32)(i32)str.val : (u32)str.val;
*((i32*)(MEM + str_ptr)) = (i32)units;
__porffor_utf8_decode(MEM, data, 195, str);
`;
  return Porffor.as(str, Porffor.TYPES.string);
};

const execFileSync = (cmd, args = [], options = {}) => {
  let mode = 0; // 0 capture, 1 inherit, 2 ignore
  const stdio = options.stdio;
  if (stdio === 'inherit') mode = 1;
    else if (stdio === 'ignore') mode = 2;
    else if (Porffor.type(stdio) == Porffor.TYPES.array) {
      if (stdio[1] === 'inherit') mode = 1;
        else if (stdio[1] === 'ignore') mode = 2;
    }

  let envArr = undefined;
  if (options.env != null) {
    envArr = [];
    const keys = Object.keys(options.env);
    for (let i = 0; i < keys.length; i++) {
      envArr.push(keys[i] + '=' + options.env[keys[i]]);
    }
  }

  const res = __porffor_execFile(cmd, args, envArr, options.cwd, options.input, mode);

  let stdout = res.stdout;
  let stderr = res.stderr;
  if (options.encoding !== undefined) {
    stdout = __porffor_utf8OrBytes(stdout);
    stderr = __porffor_utf8OrBytes(stderr);
  }

  if (res.status != 0) {
    const e = new Error('Command failed: ' + cmd + ' (status ' + res.status + ')');
    e.status = res.status;
    e.stdout = stdout;
    e.stderr = stderr;
    if (res.status == 127) e.code = 'ENOENT';
    throw e;
  }

  return stdout;
};

const nativeCwd = () => {
  const out = Porffor.malloc(4102);
  Porffor.c`
u32 out_ptr = out.val < 0 ? (u32)(i32)out.val : (u32)out.val;
if (getcwd((char*)(MEM + out_ptr + 4), 4096)) *((i32*)(MEM + out_ptr)) = (i32)strlen((char*)(MEM + out_ptr + 4));
  else *((i32*)(MEM + out_ptr)) = 0;
`;
  return Porffor.as(out, Porffor.TYPES.bytestring);
};

const nativeEnvCount = () => {
  let out = 0;
  Porffor.c`extern char **environ; i32 n = 0; while (environ[n]) n++; out = n;`;
  return out;
};

const nativeEnvEntry = idx => {
  let len = 0;
  Porffor.c`extern char **environ; len = strlen(environ[(i32)idx.val]);`;
  const out = Porffor.malloc(len + 6);
  Porffor.c`
{
extern char **environ;
u32 out_ptr = out.val < 0 ? (u32)(i32)out.val : (u32)out.val;
*((i32*)(MEM + out_ptr)) = (i32)len;
memcpy(MEM + out_ptr + 4, environ[(i32)idx.val], (size_t)len);
*(MEM + out_ptr + 4 + (i32)len) = 0;
}
`;
  return Porffor.as(out, Porffor.TYPES.bytestring);
};

const nativeEnv = () => {
  const env = {};
  const n = nativeEnvCount();
  for (let i = 0; i < n; i++) {
    const entry = nativeEnvEntry(i);
    const eq = entry.indexOf('=');
    if (eq > 0) env[entry.slice(0, eq)] = entry.slice(eq + 1);
  }
  return env;
};

const argv = [];
if (nativeArgc() > 0) argv.push(nativeArgv(0));
argv.push('runtime/index.js');
for (let i = 1; i < nativeArgc(); i++) argv.push(nativeArgv(i));

globalThis.setInterval = () => 0;
globalThis.clearInterval = () => {};

globalThis.process = {
  argv,
  env: nativeEnv(),
  cwd: () => nativeCwd(),
  platform: nativePlatform(),
  version: 'porffor-native',
  stdin: {
    readLine: nativeReadLine
  },
  stdout: {
    isTTY: nativeIsTTY(1),
    write: value => {
      Porffor.printString(value);
      // raw writes are often \r-only progress updates: stdio would hold them until a newline
      Porffor.c`fflush(stdout);`;
    }
  },
  exit: (code = 0) => {
    Porffor.c`exit((int)code.val);`;
  }
};

globalThis.__porfforNode = {
  fs: {
    readFileSync,
    writeFileSync,
    statSync,
    existsSync,
    mkdtempSync,
    rmSync,
    mkdirSync,
    readdirSync,
    renameSync,
    symlinkSync,
    cpSync
  },
  child_process: {
    execSync,
    execFileSync
  }
};
