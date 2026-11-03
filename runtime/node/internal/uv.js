// libuv i/o backend: c callbacks only queue events, the loop dispatches them to js after each uv_run
import '../c-helpers.js';
import { setBackend, invoke, drain } from './loop.js';
import { adoptBytes, adoptString } from './bytes.js';

Porffor.link`static libuv`;

Porffor.c`
#include <uv.h>

enum { PORF_UV_READ = 1, PORF_UV_CONNECTION, PORF_UV_CONNECT, PORF_UV_WRITE, PORF_UV_SHUTDOWN, PORF_UV_CLOSE, PORF_UV_DNS, PORF_UV_EXIT, PORF_UV_WORK };

typedef struct { i32 kind, id; i64 status; char *data; size_t len; } porf_uv_event;
static porf_uv_event *porf_uv_events;
static u32 porf_uv_count, porf_uv_next, porf_uv_cap;

static void porf_uv_push(i32 kind, i32 id, i64 status, char *data, size_t len) {
  if (porf_uv_count == porf_uv_cap) {
    porf_uv_cap = porf_uv_cap ? porf_uv_cap * 2 : 64;
    porf_uv_events = realloc(porf_uv_events, porf_uv_cap * sizeof(porf_uv_event));
  }
  porf_uv_events[porf_uv_count++] = (porf_uv_event){ kind, id, status, data, len };
}

typedef struct {
  union { uv_handle_t handle; uv_stream_t stream; uv_tcp_t tcp; uv_pipe_t pipe; uv_process_t process; } h;
  i32 id;
} porf_uv_handle;

typedef struct { uv_write_t req; char data[]; } porf_uv_write;
typedef struct { uv_getaddrinfo_t req; i32 id; } porf_uv_dns;
typedef struct { uv_work_t req; i32 id; void (*run)(void*); void *arg; } porf_uv_work;

static uv_loop_t *porf_uv_loop;
static uv_timer_t porf_uv_wake;
static char *porf_uv_buf;

#define PORF_UV_ID(x) ((porf_uv_handle*)(x))->id
#define PORF_UV_H(v) ((porf_uv_handle*)(u64)porf_jv_val((v)))

static porf_uv_handle *porf_uv_new(f64 id) {
  porf_uv_handle *h = calloc(1, sizeof(porf_uv_handle));
  h->id = (i32)id;
  return h;
}

static void porf_uv_noop(uv_timer_t *t) {}
// a wait that ran its whole second: the loop was idle
static int porf_uv_idled = 0;
static void porf_uv_idle(uv_timer_t *t) { porf_uv_idled = 1; }

static void porf_uv_alloc(uv_handle_t *h, size_t suggested, uv_buf_t *buf) {
  *buf = uv_buf_init(porf_uv_buf, 65536);
}

static void porf_uv_read_cb(uv_stream_t *s, ssize_t n, const uv_buf_t *buf) {
  if (n == 0) return;
  char *data = NULL;
  if (n > 0) memcpy(data = malloc(n), buf->base, n);
  porf_uv_push(PORF_UV_READ, PORF_UV_ID(s), n, data, n > 0 ? n : 0);
}

static void porf_uv_connection_cb(uv_stream_t *s, i32 status) {
  porf_uv_push(PORF_UV_CONNECTION, PORF_UV_ID(s), status, NULL, 0);
}

static void porf_uv_connect_cb(uv_connect_t *req, i32 status) {
  porf_uv_push(PORF_UV_CONNECT, PORF_UV_ID(req->handle), status, NULL, 0);
  free(req);
}

static void porf_uv_write_cb(uv_write_t *req, i32 status) {
  porf_uv_push(PORF_UV_WRITE, PORF_UV_ID(req->handle), status, NULL, 0);
  free(req);
}

static void porf_uv_shutdown_cb(uv_shutdown_t *req, i32 status) {
  porf_uv_push(PORF_UV_SHUTDOWN, PORF_UV_ID(req->handle), status, NULL, 0);
  free(req);
}

static void porf_uv_close_cb(uv_handle_t *h) {
  porf_uv_push(PORF_UV_CLOSE, PORF_UV_ID(h), 0, NULL, 0);
  free(h);
}

// ip text into s, returns the port and sets *family to 4 or 6
static i32 porf_uv_name(const struct sockaddr *addr, char *s, i32 *family) {
  if (addr->sa_family == AF_INET6) {
    const struct sockaddr_in6 *a6 = (const struct sockaddr_in6*)addr;
    uv_ip6_name(a6, s, 64);
    // a scoped (link-local) address keeps its interface, like "fe80::1%en0"
    if (a6->sin6_scope_id) {
      const size_t n = strlen(s);
      size_t len = 63 - n;
      s[n] = '%';
      if (uv_if_indextoname(a6->sin6_scope_id, s + n + 1, &len) != 0) s[n] = 0;
    }
    *family = 6;
    return ntohs(((const struct sockaddr_in6*)addr)->sin6_port);
  }
  uv_ip4_name((const struct sockaddr_in*)addr, s, 64);
  *family = 4;
  return ntohs(((const struct sockaddr_in*)addr)->sin_port);
}

static void porf_uv_exit_cb(uv_process_t *p, i64 status, i32 signal) {
  porf_uv_push(PORF_UV_EXIT, PORF_UV_ID(p), status, NULL, signal);
}

// addresses as "<family> <ip>\n" lines
static void porf_uv_dns_cb(uv_getaddrinfo_t *req, i32 status, struct addrinfo *res) {
  size_t cap = 256, len = 0;
  char *out = malloc(cap);
  for (struct addrinfo *a = res; a; a = a->ai_next) {
    char ip[64];
    if (a->ai_family == AF_INET) uv_ip4_name((struct sockaddr_in*)a->ai_addr, ip, sizeof(ip));
      else if (a->ai_family == AF_INET6) uv_ip6_name((struct sockaddr_in6*)a->ai_addr, ip, sizeof(ip));
      else continue;
    if (len + 72 > cap) out = realloc(out, cap *= 2);
    len += snprintf(out + len, 72, "%d %s\n", a->ai_family == AF_INET ? 4 : 6, ip);
  }
  if (res) uv_freeaddrinfo(res);
  porf_uv_push(PORF_UV_DNS, ((porf_uv_dns*)req)->id, status, out, len);
  free(req);
}

static void porf_uv_work_run(uv_work_t *req) {
  porf_uv_work *w = (porf_uv_work*)req;
  w->run(w->arg);
}

static void porf_uv_work_cb(uv_work_t *req, i32 status) {
  porf_uv_push(PORF_UV_WORK, ((porf_uv_work*)req)->id, status, NULL, 0);
  free(req);
}

// threadpool work for other builtins: run(arg) off the main thread, then a WORK event
static i32 porf_uv_queue(i32 id, void (*run)(void*), void *arg) {
  porf_uv_work *w = malloc(sizeof(porf_uv_work));
  w->id = id;
  w->run = run;
  w->arg = arg;
  return uv_queue_work(porf_uv_loop, &w->req, porf_uv_work_run, porf_uv_work_cb);
}

// stdio modes: -1 a new pipe (pipes[i]), -2 ignored, -3 a new ipc pipe, -4 pipes[i]'s own fd, else that fd inherited, uid/gid -1 keep ours
static i32 porf_uv_spawn(porf_uv_handle *h, const char *file, char **args, char **env, const char *cwd, i32 count, const i32 *modes, porf_uv_handle **pipes, i32 detached, i32 uid, i32 gid, i32 *pid) {
  uv_stdio_container_t *stdio = calloc(count, sizeof(uv_stdio_container_t));
  for (i32 i = 0; i < count; i++) {
    if (modes[i] == -1 || modes[i] == -3) {
      stdio[i].flags = UV_CREATE_PIPE | (modes[i] == -3 || i > 2 ? UV_READABLE_PIPE | UV_WRITABLE_PIPE : i == 0 ? UV_READABLE_PIPE : UV_WRITABLE_PIPE);
      stdio[i].data.stream = &pipes[i]->h.stream;
    } else if (modes[i] == -2) stdio[i].flags = UV_IGNORE;
    else if (modes[i] == -4) {
      stdio[i].flags = UV_INHERIT_STREAM;
      stdio[i].data.stream = &pipes[i]->h.stream;
    } else {
      stdio[i].flags = UV_INHERIT_FD;
      stdio[i].data.fd = modes[i];
    }
  }
  uv_process_options_t o;
  memset(&o, 0, sizeof(o));
  o.exit_cb = porf_uv_exit_cb;
  o.file = file;
  o.args = args;
  o.env = env;
  o.cwd = *cwd ? cwd : NULL;
  o.stdio_count = count;
  o.stdio = stdio;
  o.flags = (detached ? UV_PROCESS_DETACHED : 0) | (uid >= 0 ? UV_PROCESS_SETUID : 0) | (gid >= 0 ? UV_PROCESS_SETGID : 0);
  o.uid = uid;
  o.gid = gid;
  // output written before the spawn comes before the child's
  fflush(stdout);
  fflush(stderr);
  const i32 err = uv_spawn(porf_uv_loop, &h->h.process, &o);
  *pid = err ? 0 : uv_process_get_pid(&h->h.process);
  free(stdio);
  return err;
}

static i32 porf_uv_sockaddr(jsval host, f64 port, struct sockaddr_storage *addr) {
  char *ip = porf_node_bytes(host, NULL);
  i32 err = strchr(ip, ':') ? uv_ip6_addr(ip, (i32)port, (struct sockaddr_in6*)addr) : uv_ip4_addr(ip, (i32)port, (struct sockaddr_in*)addr);
  free(ip);
  return err;
}
`;

const init = () => {
  Porffor.c`porf_uv_loop = uv_default_loop();
porf_uv_buf = malloc(65536);
uv_timer_init(porf_uv_loop, &porf_uv_wake);
uv_unref((uv_handle_t*)&porf_uv_wake);`;
};
init();

export const READ = 1, CONNECTION = 2, CONNECT = 3, WRITE = 4, SHUTDOWN = 5, CLOSE = 6, DNS = 7, EXIT = 8, WORK = 9;
export const EOF = -4095;
export const [ ETIMEDOUT, EADDRINUSE ] = (() => {
  let timedOut = 0, inUse = 0;
  Porffor.c`timedOut = UV_ETIMEDOUT;
inUse = UV_EADDRINUSE;`;
  return [ timedOut, inUse ];
})();

// event targets by id: a handle's or request's callback(kind, status, data, extra) and its async context
const callbacks = [], contexts = [], freeIds = [];

export const register = callback => {
  const id = freeIds.length > 0 ? freeIds.pop() : callbacks.length;
  callbacks[id] = callback;
  contexts[id] = __Porffor_promise_getContext();
  return id;
};

export const release = id => {
  callbacks[id] = null;
  contexts[id] = null;
  freeIds.push(id);
};

const dispatch = (kind, id, status, p, n) => {
  const callback = callbacks[id], context = contexts[id];
  let data = null;
  if (kind === READ && status > 0) data = adoptBytes(p, n);
    else if (kind === DNS) data = adoptString(p, n);
  if (kind === CLOSE || kind === DNS || kind === WORK) release(id);
  invoke(callback, undefined, [ kind, status, data, n ], context);
  drain();
};

const pollEvents = () => {
  let kind = 0, id = 0, status = 0, p = 0, n = 0;
  for (;;) {
    Porffor.c`if (porf_uv_next < porf_uv_count) {
  porf_uv_event *e = &porf_uv_events[porf_uv_next++];
  kind = e->kind;
  id = e->id;
  status = (f64)e->status;
  p = (f64)(u64)e->data;
  n = (f64)e->len;
} else {
  porf_uv_next = porf_uv_count = 0;
  kind = 0;
}`;
    if (kind === 0) return;
    dispatch(kind, id, status, p, n);
  }
};

// wait for i/o, at most timeout ms (-1 forever)
const poll = timeout => {
  Porffor.c`if (!uv_loop_alive(porf_uv_loop)) {
  if (porf_jv_val(timeout) > 0) porf_idle_sleep(porf_jv_val(timeout));
} else if (porf_jv_val(timeout) == 0) {
  porf_scrub_stack();
  uv_run(porf_uv_loop, UV_RUN_NOWAIT);
}
else {
  // idle gc once a second passes without minor gcs, waking for it if the wait runs past
  i64 idle_in = porf_gc_idle_due();
  if (idle_in == 0) {
    porf_gc_idle();
    idle_in = -1;
  }
  const int idle = idle_in > 0 && (porf_jv_val(timeout) < 0 || porf_jv_val(timeout) > idle_in);
  if (porf_jv_val(timeout) > 0 || idle) {
    uv_update_time(porf_uv_loop);
    uv_timer_start(&porf_uv_wake, idle ? porf_uv_idle : porf_uv_noop, idle ? (u64)idle_in : (u64)ceil(porf_jv_val(timeout)), 0);
  }
  porf_uv_idled = 0;
  porf_scrub_stack();
  uv_run(porf_uv_loop, UV_RUN_ONCE);
  uv_timer_stop(&porf_uv_wake);
  if (porf_uv_idled && porf_gc_idle_due() == 0) porf_gc_idle();
}`;
  pollEvents();
};

const alive = () => {
  let out = 0;
  Porffor.c`out = uv_loop_alive(porf_uv_loop) || porf_uv_next < porf_uv_count;`;
  return out !== 0;
};

const queueWork = (run, arg, callback) => {
  const id = register((kind, status) => callback(status));
  let err = 0;
  Porffor.c`err = porf_uv_queue((i32)porf_jv_val(id), (void (*)(void*))(u64)porf_jv_val(run), (void*)(u64)porf_jv_val(arg));`;
  if (err) {
    release(id);
    return false;
  }
  return true;
};

setBackend({ poll, alive, queueWork });

export const errName = err => {
  let out;
  Porffor.c`out = porf_bstr_of(uv_err_name((i32)porf_jv_val(err)), strlen(uv_err_name((i32)porf_jv_val(err))));`;
  return out;
};

export const errMessage = err => {
  let out;
  Porffor.c`out = porf_bstr_of(uv_strerror((i32)porf_jv_val(err)), strlen(uv_strerror((i32)porf_jv_val(err))));`;
  return out;
};

export const uvException = (err, syscall, address, port) => {
  const code = errName(err);
  let message = `${syscall} ${code}`;
  if (address) message += port ? ` ${address}:${port}` : ` ${address}`;
  const error = new Error(message);
  error.errno = err;
  error.code = code;
  error.syscall = syscall;
  if (address) error.address = address;
  if (port) error.port = port;
  return error;
};

export const tcpNew = id => {
  let p = 0;
  Porffor.c`{
  porf_uv_handle *h = porf_uv_new(porf_jv_val(id));
  uv_tcp_init(porf_uv_loop, &h->h.tcp);
  p = (f64)(u64)h;
}`;
  return p;
};

export const pipeNew = (id, ipc) => {
  let p = 0;
  Porffor.c`{
  porf_uv_handle *h = porf_uv_new(porf_jv_val(id));
  uv_pipe_init(porf_uv_loop, &h->h.pipe, (i32)porf_jv_val(ipc));
  p = (f64)(u64)h;
}`;
  return p;
};

// a process handle, initialized by spawn
export const processNew = id => {
  let p = 0;
  Porffor.c`p = (f64)(u64)porf_uv_new(porf_jv_val(id));`;
  return p;
};

const setStdio = (modes, handles, i, mode, handle) => {
  Porffor.c`((i32*)(u64)porf_jv_val(modes))[(size_t)porf_jv_val(i)] = (i32)porf_jv_val(mode);
((porf_uv_handle**)(u64)porf_jv_val(handles))[(size_t)porf_jv_val(i)] = PORF_UV_H(handle);`;
};

// argv/envp: malloc'd nul-terminated char* arrays, modes/pipes: one per stdio fd. { err, pid }
export const spawn = (handle, file, argv, envp, cwd, modes, pipes, detached, uid, gid) => {
  let err = 0, pid = 0, cModes = 0, cPipes = 0;
  const count = modes.length;
  Porffor.c`cModes = (f64)(u64)malloc((size_t)porf_jv_val(count) * sizeof(i32));
cPipes = (f64)(u64)malloc((size_t)porf_jv_val(count) * sizeof(porf_uv_handle*));`;
  for (let i = 0; i < count; i++) setStdio(cModes, cPipes, i, modes[i], pipes[i]);
  Porffor.c`{
  char *path = porf_node_bytes(file, NULL), *dir = porf_node_bytes(cwd, NULL);
  i32 child = 0;
  err = porf_uv_spawn(PORF_UV_H(handle), path, (char**)(u64)porf_jv_val(argv), (char**)(u64)porf_jv_val(envp), dir, (i32)porf_jv_val(count), (i32*)(u64)cModes, (porf_uv_handle**)(u64)cPipes, (i32)porf_jv_val(detached), (i32)porf_jv_val(uid), (i32)porf_jv_val(gid), &child);
  pid = child;
  free(path);
  free(dir);
  free((void*)(u64)cModes);
  free((void*)(u64)cPipes);
}`;
  return { err, pid };
};

// a tty gets its own open file like libuv's tty handles, so libuv's nonblocking mode stays off stdout's
export const pipeOpen = (handle, fd) => {
  let err = 0;
  Porffor.c`{
  i32 f = (i32)porf_jv_val(fd);
  char path[256];
  if (isatty(f) && ttyname_r(f, path, sizeof(path)) == 0) {
    const i32 own = open(path, O_RDWR | O_CLOEXEC | O_NOCTTY);
    if (own >= 0) f = own;
  }
  err = uv_pipe_open(&PORF_UV_H(handle)->h.pipe, f);
}`;
  return err;
};

// a handle gets its event target once js wraps it
export const setId = (handle, id) => {
  Porffor.c`PORF_UV_H(handle)->id = (i32)porf_jv_val(id);`;
};

export const processKill = (handle, signum) => {
  let err = 0;
  Porffor.c`err = uv_process_kill(&PORF_UV_H(handle)->h.process, (i32)porf_jv_val(signum));`;
  return err;
};

// flags: 1 ipv6Only, 2 reusePort
export const tcpBind = (handle, host, port, flags) => {
  let err = 0;
  Porffor.c`{
  struct sockaddr_storage addr;
  const i32 f = (i32)porf_jv_val(flags);
  err = porf_uv_sockaddr(host, porf_jv_val(port), &addr);
  if (err == 0) err = uv_tcp_bind(&PORF_UV_H(handle)->h.tcp, (struct sockaddr*)&addr, (f & 1 ? UV_TCP_IPV6ONLY : 0) | (f & 2 ? UV_TCP_REUSEPORT : 0));
}`;
  return err;
};

export const pipeBind = (handle, path) => {
  let err = 0;
  Porffor.c`{
  size_t len;
  char *s = porf_node_bytes(path, &len);
  err = uv_pipe_bind2(&PORF_UV_H(handle)->h.pipe, s, len, UV_PIPE_NO_TRUNCATE);
  free(s);
}`;
  return err;
};

export const listen = (handle, backlog) => {
  let err = 0;
  Porffor.c`err = uv_listen(&PORF_UV_H(handle)->h.stream, (i32)porf_jv_val(backlog), porf_uv_connection_cb);`;
  return err;
};

export const accept = (server, client) => {
  let err = 0;
  Porffor.c`err = uv_accept(&PORF_UV_H(server)->h.stream, &PORF_UV_H(client)->h.stream);`;
  return err;
};

export const tcpConnect = (handle, host, port) => {
  let err = 0;
  Porffor.c`{
  struct sockaddr_storage addr;
  err = porf_uv_sockaddr(host, porf_jv_val(port), &addr);
  if (err == 0) {
    uv_connect_t *req = malloc(sizeof(uv_connect_t));
    err = uv_tcp_connect(req, &PORF_UV_H(handle)->h.tcp, (struct sockaddr*)&addr, porf_uv_connect_cb);
    if (err) free(req);
  }
}`;
  return err;
};

// errors come as a CONNECT event
export const pipeConnect = (handle, path) => {
  Porffor.c`{
  size_t len;
  char *s = porf_node_bytes(path, &len);
  uv_pipe_t *p = &PORF_UV_H(handle)->h.pipe;
  uv_connect_t *req = malloc(sizeof(uv_connect_t));
  const i32 err = uv_pipe_connect2(req, p, s, len, UV_PIPE_NO_TRUNCATE, porf_uv_connect_cb);
  if (err) {
    porf_uv_push(PORF_UV_CONNECT, PORF_UV_ID(p), err, NULL, 0);
    free(req);
  }
  free(s);
}`;
};

export const readStart = handle => {
  let err = 0;
  Porffor.c`err = uv_read_start(&PORF_UV_H(handle)->h.stream, porf_uv_alloc, porf_uv_read_cb);`;
  return err;
};

export const readStop = handle => {
  Porffor.c`uv_read_stop(&PORF_UV_H(handle)->h.stream);`;
};

// 0 written now, 1 queued (a WRITE event follows), else an error
export const write = (handle, bytes, start, end) => {
  let status = 0;
  Porffor.c`{
  uv_stream_t *s = &PORF_UV_H(handle)->h.stream;
  char *data = porf_node_u8(bytes) + (size_t)porf_jv_val(start);
  size_t n = (size_t)(porf_jv_val(end) - porf_jv_val(start));
  uv_buf_t buf = uv_buf_init(data, n);
  i32 done = uv_try_write(s, &buf, 1);
  if (done == (i32)n) status = 0;
  else if (done < 0 && done != UV_EAGAIN) status = done;
  else {
    if (done < 0) done = 0;
    porf_uv_write *w = malloc(sizeof(porf_uv_write) + n - done);
    memcpy(w->data, data + done, n - done);
    buf = uv_buf_init(w->data, n - done);
    i32 err = uv_write(&w->req, s, &buf, 1, porf_uv_write_cb);
    if (err) free(w);
    status = err ? err : 1;
  }
}`;
  return status;
};

export const shutdown = handle => {
  let err = 0;
  Porffor.c`{
  uv_shutdown_t *req = malloc(sizeof(uv_shutdown_t));
  err = uv_shutdown(req, &PORF_UV_H(handle)->h.stream, porf_uv_shutdown_cb);
  if (err) free(req);
}`;
  return err;
};

export const close = handle => {
  Porffor.c`uv_close(&PORF_UV_H(handle)->h.handle, porf_uv_close_cb);`;
};

export const ref = handle => {
  Porffor.c`uv_ref(&PORF_UV_H(handle)->h.handle);`;
};

export const unref = handle => {
  Porffor.c`uv_unref(&PORF_UV_H(handle)->h.handle);`;
};

export const setNoDelay = (handle, enable) => {
  Porffor.c`uv_tcp_nodelay(&PORF_UV_H(handle)->h.tcp, porf_jv_val(enable) != 0);`;
};

export const setKeepAlive = (handle, enable, delay) => {
  Porffor.c`uv_tcp_keepalive(&PORF_UV_H(handle)->h.tcp, porf_jv_val(enable) != 0, porf_jv_ptr(delay));`;
};

// IP_TOS, or IPV6_TCLASS on an ipv6 socket
export const setTypeOfService = (handle, tos) => {
  let err = 0;
  Porffor.c`{
  uv_os_fd_t fd;
  struct sockaddr_storage addr;
  socklen_t len = sizeof(addr);
  const i32 v = (i32)porf_jv_val(tos);
  err = uv_fileno(&PORF_UV_H(handle)->h.handle, &fd);
  if (err == 0 && getsockname(fd, (struct sockaddr*)&addr, &len) == 0) {
    if (addr.ss_family == AF_INET6) err = setsockopt(fd, IPPROTO_IPV6, IPV6_TCLASS, &v, sizeof(v));
      else err = setsockopt(fd, IPPROTO_IP, IP_TOS, &v, sizeof(v));
    if (err) err = -errno;
  }
}`;
  return err;
};

// { address, family, port } of either end of a tcp handle, undefined if not connected/bound
export const address = (handle, peer) => {
  let ip, family = 0, port = 0, err = 0;
  Porffor.c`{
  struct sockaddr_storage addr;
  struct sockaddr *a = (struct sockaddr*)&addr;
  i32 len = sizeof(addr);
  porf_uv_handle *h = PORF_UV_H(handle);
  err = porf_jv_val(peer) ? uv_tcp_getpeername(&h->h.tcp, a, &len) : uv_tcp_getsockname(&h->h.tcp, a, &len);
  if (err == 0) {
    char s[64];
    i32 f;
    port = porf_uv_name(a, s, &f);
    family = f;
    ip = porf_bstr_of(s, strlen(s));
  }
}`;
  if (err) return undefined;
  return { address: ip, family: family === 4 ? 'IPv4' : 'IPv6', port };
};

// flags: node's ADDRCONFIG bit
export const getaddrinfo = (id, host, family, flags) => {
  let err = 0;
  Porffor.c`{
  porf_uv_dns *d = malloc(sizeof(porf_uv_dns));
  d->id = (i32)porf_jv_val(id);
  struct addrinfo hints = { 0 };
  hints.ai_family = porf_jv_val(family) == 4 ? AF_INET : porf_jv_val(family) == 6 ? AF_INET6 : AF_UNSPEC;
  hints.ai_socktype = SOCK_STREAM;
  hints.ai_flags = porf_jv_val(flags) == 1024 ? AI_ADDRCONFIG : 0;
  char *s = porf_node_bytes(host, NULL);
  err = uv_getaddrinfo(porf_uv_loop, &d->req, porf_uv_dns_cb, s, NULL, &hints);
  free(s);
  if (err) free(d);
}`;
  return err;
};

export const tcpOpen = (handle, fd) => {
  let err = 0;
  Porffor.c`err = uv_tcp_open(&PORF_UV_H(handle)->h.tcp, (uv_os_sock_t)porf_jv_val(fd));`;
  return err;
};

// node's guessHandleType names
export const guessHandle = fd => {
  let out;
  Porffor.c`{
  const uv_handle_type t = uv_guess_handle((uv_file)porf_jv_val(fd));
  const char *name = t == UV_TCP ? "TCP" : t == UV_TTY ? "TTY" : t == UV_UDP ? "UDP" : t == UV_NAMED_PIPE ? "PIPE" : t == UV_FILE ? "FILE" : "UNKNOWN";
  out = porf_bstr_of(name, strlen(name));
}`;
  return out;
};

// node's UVExceptionWithHostPort: "<syscall> <code>: <message> <address>:<port>"
export const uvExceptionWithHostPort = (err, syscall, address, port) => {
  const code = errName(err);
  let details = '';
  if (port && port > 0) details = ` ${address}:${port}`;
    else if (address) details = ` ${address}`;
  const error = new Error(`${syscall} ${code}: ${errMessage(err)}${details}`);
  error.code = code;
  error.errno = err;
  error.syscall = syscall;
  error.address = address;
  if (port) error.port = port;
  return error;
};
