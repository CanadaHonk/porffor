// http server on uWebSockets (compiler/uwebsockets/porf_uws.cpp) on the libuv loop
import '../c-helpers.js';
import './uv.js';
import { drain, reportUncaught } from './loop.js';

Porffor.link`uws`;

Porffor.c`
int porf_uws_app_new(void *uv_loop, int buffer_bodies, int ssl);
void porf_uws_max_header_size(double size);
int porf_uws_listen(int app, const char *host, int port, const char *path);
void porf_uws_close(int app);
void porf_uws_ref(int app, int ref);
void porf_uws_release(int slot);
void porf_uws_end(int slot, const char *status, size_t status_len, const char **headers, const size_t *header_lens, int header_count, const char *body, size_t body_len, int no_body, double reported, int close);
void porf_uws_write_head(int slot, const char *status, size_t status_len, const char **headers, const size_t *header_lens, int header_count);
int porf_uws_write(int slot, const char *data, size_t len, double total);
void porf_uws_finish(int slot, const char *data, size_t len, double total, int close);
void porf_uws_write_continue(int slot);
void porf_uws_pause(int slot, int pause);
void porf_uws_conn_write(int conn, const char *data, size_t len);
void porf_uws_conn_close(int conn, int end);
int porf_uws_detach(int slot, const char **head, size_t *head_len);
double porf_uws_receiving(int conn);
size_t porf_uws_remote(int conn, char *buf, size_t cap, int *port);

jsval porf_uws_request_fn;
jsval porf_uws_event_fn;

// headers as one "name\\0value\\0..." bytestring split only if read, plus the host on its own
void porf_uws_on_request(int app, int conn, int slot, const char *method, size_t method_len, const char *url, size_t url_len,
  const char **headers, const size_t *header_lens, int header_count, int flags, const char *body, size_t body_len) {
  size_t total = 0;
  for (int i = 0; i < header_count; i++) total += header_lens[i] + 1;
  const u32 blob = porf_bstr_new((u32)total);
  char *out = (char*)(MEM + blob + 4);
  jsbits host = JV_UNDEFINED_BITS;
  for (int i = 0; i < header_count; i++) {
    if ((i & 1) == 0 && header_lens[i] == 4 && memcmp(headers[i], "host", 4) == 0 && host == JV_UNDEFINED_BITS)
      host = porf_pack(porf_bstr_of(headers[i + 1], (u32)header_lens[i + 1]));
    memcpy(out, headers[i], header_lens[i]);
    out += header_lens[i];
    *out++ = 0;
  }
  jsbits argv[10] = {
    porf_pack(porf_box( (f64)app, 1 )), porf_pack(porf_box( (f64)conn, 1 )), porf_pack(porf_box( (f64)slot, 1 )),
    porf_pack(porf_bstr_of(method, (u32)method_len)), porf_pack(porf_bstr_of(url, (u32)url_len)),
    porf_pack(porf_box( (f64)blob, PORF_NODE_BYTESTRING )), porf_pack(porf_box( (f64)flags, 1 )),
    porf_pack(porf_box( (f64)(u64)body, 1 )), porf_pack(porf_box( (f64)body_len, 1 )), host
  };
  porf_call_dynamic(porf_uws_request_fn, JV_UNDEFINED, JV_UNDEFINED, 10, argv);
}

void porf_uws_on_event(int kind, int id, const char *data, size_t len, int extra) {
  jsbits argv[5] = {
    porf_pack(porf_box( (f64)kind, 1 )), porf_pack(porf_box( (f64)id, 1 )),
    porf_pack(porf_box( (f64)(u64)data, 1 )), porf_pack(porf_box( (f64)len, 1 )), porf_pack(porf_box( (f64)extra, 1 ))
  };
  porf_call_dynamic(porf_uws_event_fn, JV_UNDEFINED, JV_UNDEFINED, 5, argv);
}

// js text as bytes: bytestrings as is (latin-1) unless utf8, byte views need *len set to their byteLength
static const char *porf_uws_text(jsval v, size_t *len, char **owned, int utf8) {
  if (porf_jv_type(v) != PORF_NODE_STRING && porf_jv_type(v) != PORF_NODE_BYTESTRING) return porf_node_u8(v);
  const u32 ptr = porf_jv_ptr(v);
  if (porf_jv_type(v) == PORF_NODE_BYTESTRING) {
    *len = *(u32*)(MEM + ptr);
    const u8 *s = MEM + ptr + 4;
    if (utf8) {
      // ascii is its own utf-8, checked a word at a time
      size_t i = 0;
      u64 high = 0;
      for (; i + 8 <= *len; i += 8) {
        u64 w;
        memcpy(&w, s + i, 8);
        high |= w;
      }
      for (; i < *len; i++) high |= s[i];
      if (high & 0x8080808080808080ull) return *owned = porf_node_bytes(v, len);
    }
    return (const char*)s;
  }
  return *owned = porf_node_bytes(v, len);
}

// a flat [ name, value, ... ] array of strings as pointer and length lists, on the stack for the usual few
typedef struct {
  int n;
  const char **ptrs;
  size_t *lens;
  char **owned;
  const char *ptrs_small[32];
  size_t lens_small[32];
  char *owned_small[32];
} porf_uws_pairs;

static void porf_uws_pairs_of(jsval arr, porf_uws_pairs *p) {
  const u32 a = porf_jv_ptr(arr);
  const int n = (int)*(u32*)(MEM + a);
  const jsbits *items = (const jsbits*)(MEM + *(u32*)(MEM + a + 4));
  p->n = n;
  if (n <= 32) {
    p->ptrs = p->ptrs_small;
    p->lens = p->lens_small;
    p->owned = p->owned_small;
  } else {
    p->ptrs = malloc(sizeof(char*) * n);
    p->lens = malloc(sizeof(size_t) * n);
    p->owned = malloc(sizeof(char*) * n);
  }
  for (int i = 0; i < n; i++) {
    p->owned[i] = NULL;
    p->ptrs[i] = porf_uws_text(porf_unpack(items[i]), p->lens + i, p->owned + i, 0);
  }
}

static void porf_uws_pairs_free(porf_uws_pairs *p) {
  for (int i = 0; i < p->n; i++) free(p->owned[i]);
  if (p->ptrs == p->ptrs_small) return;
  free(p->ptrs);
  free(p->lens);
  free(p->owned);
}
`;

const DATA = 1, ABORTED = 2, WRITABLE = 3, OPEN = 4, CLOSE = 5, CLIENT_ERROR = 6;

// per app: the server, with _uwsRequest(socket, slot, method, url, headers, flags, body, host) and _uwsConnection(conn)
const apps = [], contexts = [];
// per slot: the response, with _uwsData(chunk, last), _uwsAborted() and _uwsWritable()
const owners = [];
// per connection: its socket, with _uwsClose() and _uwsClientError(err)
const conns = [];

// js calling in can have uWebSockets call back (a connection closing): the outer js drains after
let nested = 0;

const onRequest = (app, conn, slot, method, url, headers, flags, bodyPtr, bodyLength, host) => {
  const outer = __Porffor_promise_getContext();
  __Porffor_promise_setContext(contexts[app]);
  try {
    apps[app]._uwsRequest(conns[conn], slot, method, url, headers, flags, bodyPtr !== 0 ? copyBytes(bodyPtr, bodyLength) : null, host);
  } catch (err) {
    reportUncaught(err);
  }
  __Porffor_promise_setContext(outer);
  drain();
};

const onEvent = (kind, id, ptr, length, extra) => {
  try {
    if (kind === OPEN) conns[id] = apps[length]._uwsConnection(id);
      else if (kind === CLOSE) {
        const socket = conns[id];
        conns[id] = undefined;
        socket._uwsClose();
      } else if (kind === CLIENT_ERROR) conns[id]._uwsClientError(extra);
      else {
        const owner = owners[id];
        if (!owner) return;
        if (kind === DATA) owner._uwsData(copyBytes(ptr, length), extra === 1);
          else if (kind === ABORTED) owner._uwsAborted();
          else owner._uwsWritable();
      }
  } catch (err) {
    reportUncaught(err);
  }
  if (nested === 0) drain();
};

const copyBytes = (ptr, length) => {
  const out = new Uint8Array(length);
  Porffor.c`memcpy(porf_node_u8(out), (const char*)(u64)porf_jv_val(ptr), (size_t)porf_jv_val(length));`;
  return out;
};

// c holds the only references, so they are roots
const init = () => {
  const request = onRequest, event = onEvent;
  Porffor.c`porf_uws_request_fn = request;
porf_uws_event_fn = event;
porf_gc_native_root_add(porf_jv_val(request), porf_jv_type(request));
porf_gc_native_root_add(porf_jv_val(event), porf_jv_type(event));`;
};

// bufferBodies: whole bodies come with the request, else they stream to the slot's owner
export const createApp = (bufferBodies, server, ssl = false) => {
  if (apps.length === 0) init();
  let id = 0;
  Porffor.c`id = porf_uws_app_new(porf_uv_loop, (int)porf_jv_val(bufferBodies), (int)porf_jv_val(ssl));`;
  adopt(id, server);
  return id;
};

// a closed app lets go of its server once its connections are gone, and takes it back to listen again
export const adopt = (app, server) => {
  apps[app] = server;
  contexts[app] = server === undefined ? undefined : __Porffor_promise_getContext();
};

export const maxHeaderSize = size => {
  Porffor.c`porf_uws_max_header_size(porf_jv_val(size));`;
};

// the bound port (0 for a path), or a uv error
export const listen = (app, host, port, path = '') => {
  let bound = 0;
  Porffor.c`{
  char *h = porf_node_bytes(host, NULL), *p = porf_node_bytes(path, NULL);
  bound = porf_uws_listen((int)porf_jv_val(app), h, (int)porf_jv_val(port), *p ? p : NULL);
#ifdef PORF_PGO_PORT_FILE
  // --pgo training finds the server here
  FILE *o = bound > 0 ? fopen(PORF_PGO_PORT_FILE, "w") : NULL;
  if (o) { fprintf(o, "%d", (int)bound); fclose(o); }
#endif
  free(h);
  free(p);
}`;
  return bound;
};

export const close = app => {
  Porffor.c`porf_uws_close((int)porf_jv_val(app));`;
};

export const ref = (app, on) => {
  Porffor.c`porf_uws_ref((int)porf_jv_val(app), (int)porf_jv_val(on));`;
};

export const own = (slot, owner) => {
  owners[slot] = owner;
};

export const release = slot => {
  owners[slot] = undefined;
  Porffor.c`porf_uws_release((int)porf_jv_val(slot));`;
};

// noBody: none sent (head, 204, 304), with reported as its length unless -1
export const end = (slot, status, headers, body, noBody, reported, closeConnection) => {
  const length = typeof body === 'string' ? 0 : body.byteLength;
  nested++;
  Porffor.c`{
  size_t status_len, body_len = (size_t)porf_jv_val(length);
  char *status_owned = NULL, *body_owned = NULL;
  const char *status_text = porf_uws_text(status, &status_len, &status_owned, 0);
  const char *body_data = porf_uws_text(body, &body_len, &body_owned, 1);
  porf_uws_pairs pairs;
  porf_uws_pairs_of(headers, &pairs);
  porf_uws_end((int)porf_jv_val(slot), status_text, status_len, pairs.ptrs, pairs.lens, pairs.n, body_data, body_len, (int)porf_jv_val(noBody), porf_jv_val(reported), (int)porf_jv_val(closeConnection));
  porf_uws_pairs_free(&pairs);
  free(status_owned);
  free(body_owned);
}`;
  nested--;
};

export const writeHead = (slot, status, headers) => {
  Porffor.c`{
  size_t status_len;
  char *status_owned = NULL;
  const char *status_text = porf_uws_text(status, &status_len, &status_owned, 0);
  porf_uws_pairs pairs;
  porf_uws_pairs_of(headers, &pairs);
  porf_uws_write_head((int)porf_jv_val(slot), status_text, status_len, pairs.ptrs, pairs.lens, pairs.n);
  porf_uws_pairs_free(&pairs);
  free(status_owned);
}`;
};

// total: content-length or -1 for chunked, false on backpressure until a WRITABLE event
export const write = (slot, chunk, total) => {
  const length = typeof chunk === 'string' ? 0 : chunk.byteLength;
  let ok = 1;
  Porffor.c`{
  size_t len = (size_t)porf_jv_val(length);
  char *data_owned = NULL;
  const char *data = porf_uws_text(chunk, &len, &data_owned, 1);
  ok = porf_uws_write((int)porf_jv_val(slot), data, len, porf_jv_val(total));
  free(data_owned);
}`;
  return ok !== 0;
};

export const finish = (slot, chunk, total, closeConnection) => {
  const length = typeof chunk === 'string' ? 0 : chunk.byteLength;
  nested++;
  Porffor.c`{
  size_t len = (size_t)porf_jv_val(length);
  char *data_owned = NULL;
  const char *data = porf_uws_text(chunk, &len, &data_owned, 1);
  porf_uws_finish((int)porf_jv_val(slot), data, len, porf_jv_val(total), (int)porf_jv_val(closeConnection));
  free(data_owned);
}`;
  nested--;
};

export const writeContinue = slot => {
  Porffor.c`porf_uws_write_continue((int)porf_jv_val(slot));`;
};

export const pause = (slot, paused) => {
  Porffor.c`porf_uws_pause((int)porf_jv_val(slot), (int)porf_jv_val(paused));`;
};

export const ownConn = (conn, socket) => {
  conns[conn] = socket;
};

// raw bytes onto a connection
export const connWrite = (conn, chunk) => {
  const length = typeof chunk === 'string' ? 0 : chunk.byteLength;
  Porffor.c`{
  size_t len = (size_t)porf_jv_val(length);
  char *data_owned = NULL;
  const char *data = porf_uws_text(chunk, &len, &data_owned, 1);
  porf_uws_conn_write((int)porf_jv_val(conn), data, len);
  free(data_owned);
}`;
};

// end: send a fin after what was written, else close at once
export const connClose = (conn, end) => {
  nested++;
  Porffor.c`porf_uws_conn_close((int)porf_jv_val(conn), (int)porf_jv_val(end));`;
  nested--;
};

// the connection's fd and what was read past the request, taken from uWebSockets (null for tls)
export const detach = slot => {
  owners[slot] = undefined;
  let fd = 0, ptr = 0, length = 0;
  nested++;
  Porffor.c`{
  const char *head = NULL;
  size_t len = 0;
  fd = porf_uws_detach((int)porf_jv_val(slot), &head, &len);
  ptr = (f64)(u64)head;
  length = len;
}`;
  nested--;
  return fd < 0 ? null : { fd, head: copyBytes(ptr, length) };
};

// ms since the connection's next request started arriving, or -1
export const receiving = conn => {
  let ms = 0;
  Porffor.c`ms = porf_uws_receiving((int)porf_jv_val(conn));`;
  return ms;
};

export const remote = conn => {
  let address, port = 0;
  Porffor.c`{
  char buf[64];
  int p = 0;
  const size_t n = porf_uws_remote((int)porf_jv_val(conn), buf, sizeof(buf), &p);
  address = porf_bstr_of(buf, (u32)n);
  port = p;
}`;
  return { address, port };
};
