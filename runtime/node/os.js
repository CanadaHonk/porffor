import process from './process.js';
import { Buffer } from './buffer.js';
import { signalNumber, signalNames } from './internal/bytes.js';
import { systemError } from './internal/errors.js';

Porffor.link`static libuv`;

Porffor.c`
#include <uv.h>
`;

const checkError = (err, syscall) => {
  if (err === 0) return;
  let code, message;
  Porffor.c`code = porf_node_cstr(uv_err_name((i32)porf_jv_val(err)));
message = porf_node_cstr(uv_strerror((i32)porf_jv_val(err)));`;
  throw systemError('ERR_SYSTEM_ERROR', 'A system error occurred', { errno: err, code, message, syscall });
};

// 0 sysname, 1 release
const uname = field => {
  let out;
  Porffor.c`{
  uv_utsname_t u;
  uv_os_uname(&u);
  out = porf_node_cstr((i32)porf_jv_val(field) == 0 ? u.sysname : u.release);
}`;
  return out;
};

// 0 hostname, 1 homedir
const nativePath = which => {
  let out;
  Porffor.c`{
  char buf[4096];
  size_t size = sizeof(buf);
  if ((i32)porf_jv_val(which) == 0) uv_os_gethostname(buf, &size);
    else uv_os_homedir(buf, &size);
  out = porf_node_str(buf, size);
}`;
  return out;
};

export const hostname = () => nativePath(0);
export const homedir = () => nativePath(1);
export const type = () => uname(0);
export const release = () => uname(1);
export const arch = () => process.arch;
export const platform = () => process.platform;
export const endianness = () => 'LE';

export const availableParallelism = () => {
  let out = 0;
  Porffor.c`out = uv_available_parallelism();`;
  return out;
};

export const totalmem = () => {
  let out = 0;
  Porffor.c`out = (f64)uv_get_total_memory();`;
  return out;
};

export const tmpdir = () => {
  const dir = process.env.TMPDIR || process.env.TMP || process.env.TEMP || '/tmp';
  return dir.length > 1 && dir.endsWith('/') ? dir.slice(0, -1) : dir;
};

const cpuAt = (infos, i) => {
  let model, speed = 0, user = 0, niceTime = 0, sys = 0, idle = 0, irq = 0;
  Porffor.c`{
  const uv_cpu_info_t *c = (const uv_cpu_info_t*)(u64)porf_jv_val(infos) + (i32)porf_jv_val(i);
  model = porf_node_cstr(c->model);
  speed = c->speed;
  user = c->cpu_times.user;
  niceTime = c->cpu_times.nice;
  sys = c->cpu_times.sys;
  idle = c->cpu_times.idle;
  irq = c->cpu_times.irq;
}`;
  return { model, speed, times: { user, nice: niceTime, sys, idle, irq } };
};

export const cpus = () => {
  let infos = 0, count = 0;
  Porffor.c`{
  uv_cpu_info_t *c;
  int n;
  if (uv_cpu_info(&c, &n) == 0) {
    infos = (f64)(u64)c;
    count = n;
  }
}`;
  const out = [];
  for (let i = 0; i < count; i++) out.push(cpuAt(infos, i));
  Porffor.c`if (infos) uv_free_cpu_info((uv_cpu_info_t*)(u64)infos, (int)count);`;
  return out;
};

// [ name, entry ]
const interfaceAt = (addrs, i) => {
  let name, address, netmask, mac, internal = 0, v6 = 0, scopeid = 0;
  Porffor.c`{
  const uv_interface_address_t *a = (const uv_interface_address_t*)(u64)porf_jv_val(addrs) + (i32)porf_jv_val(i);
  const unsigned char *m = (const unsigned char*)a->phys_addr;
  char buf[INET6_ADDRSTRLEN];
  v6 = a->address.address4.sin_family == AF_INET6;
  name = porf_node_cstr(a->name);
  if (v6) uv_ip6_name(&a->address.address6, buf, sizeof(buf)); else uv_ip4_name(&a->address.address4, buf, sizeof(buf));
  address = porf_node_cstr(buf);
  if (v6) uv_ip6_name(&a->netmask.netmask6, buf, sizeof(buf)); else uv_ip4_name(&a->netmask.netmask4, buf, sizeof(buf));
  netmask = porf_node_cstr(buf);
  snprintf(buf, sizeof(buf), "%02x:%02x:%02x:%02x:%02x:%02x", m[0], m[1], m[2], m[3], m[4], m[5]);
  mac = porf_node_cstr(buf);
  internal = a->is_internal;
  if (v6) scopeid = a->address.address6.sin6_scope_id;
}`;
  // the netmask's one bits
  let bits = 0;
  for (const part of netmask.split(v6 ? ':' : '.')) if (part) bits += parseInt(part, v6 ? 16 : 10).toString(2).replaceAll('0', '').length;
  const entry = { address, netmask, family: v6 ? 'IPv6' : 'IPv4', mac, internal: internal === 1, cidr: `${address}/${bits}` };
  if (v6) entry.scopeid = scopeid;
  return [ name, entry ];
};

export const networkInterfaces = () => {
  let addrs = 0, count = 0, err = 0;
  Porffor.c`{
  uv_interface_address_t *a;
  int n;
  err = uv_interface_addresses(&a, &n);
  if (err == 0) {
    addrs = (f64)(u64)a;
    count = n;
  }
}`;
  checkError(err, 'uv_interface_addresses');
  const out = {};
  for (let i = 0; i < count; i++) {
    const [ name, entry ] = interfaceAt(addrs, i);
    (out[name] ??= []).push(entry);
  }
  Porffor.c`if (addrs) uv_free_interface_addresses((uv_interface_address_t*)(u64)addrs, (int)count);`;
  return out;
};

export const userInfo = options => {
  let err = 0, uid = 0, gid = 0, username, homedir, shell = null;
  Porffor.c`{
  uv_passwd_t pwd;
  err = uv_os_get_passwd(&pwd);
  if (err == 0) {
    uid = (f64)pwd.uid;
    gid = (f64)pwd.gid;
    username = porf_node_cstr(pwd.username);
    homedir = porf_node_cstr(pwd.homedir);
    if (pwd.shell) shell = porf_node_cstr(pwd.shell);
    uv_os_free_passwd(&pwd);
  }
}`;
  checkError(err, 'uv_os_get_passwd');
  if (options?.encoding === 'buffer') return { uid, gid, username: Buffer.from(username), homedir: Buffer.from(homedir), shell: shell === null ? null : Buffer.from(shell) };
  return { uid, gid, username, homedir, shell };
};

const errnoCount = () => {
  let out = 0;
  Porffor.c`out = sizeof(porf_node_errors) / sizeof(porf_node_errors[0]);`;
  return out;
};

const errnoAt = i => {
  let name, value = 0;
  Porffor.c`name = porf_node_cstr(porf_node_errors[(i32)porf_jv_val(i)].name);
value = porf_node_errors[(i32)porf_jv_val(i)].err;`;
  return [ name, value ];
};

const errno = {};
for (let i = 0; i < errnoCount(); i++) {
  const [ name, value ] = errnoAt(i);
  errno[name] = value;
}

const signals = {};
for (const name of signalNames) signals[name] = signalNumber(name);

export const constants = {
  errno,
  signals,
  priority: { PRIORITY_LOW: 19, PRIORITY_BELOW_NORMAL: 10, PRIORITY_NORMAL: 0, PRIORITY_ABOVE_NORMAL: -7, PRIORITY_HIGH: -14, PRIORITY_HIGHEST: -20 }
};

export const EOL = '\n';
export const devNull = '/dev/null';

export default {
  arch, availableParallelism, constants, cpus, devNull, endianness, EOL, homedir, hostname, networkInterfaces, platform, release, tmpdir, totalmem, type, userInfo
};
