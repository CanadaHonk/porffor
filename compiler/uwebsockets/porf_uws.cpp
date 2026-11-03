// uWebSockets on the program's libuv loop, connections and requests are small int ids (conns, slots) for the js side
#include "App.h"
#include <uv.h>
#include <arpa/inet.h>
#include <unistd.h>
#include <cerrno>
#include <cstring>
#include <string>
#include <unordered_map>
#include <vector>

extern "C" {
// js side (runtime/node/internal/uws.js)
void porf_uws_on_request(int app, int conn, int slot, const char *method, size_t method_len, const char *url, size_t url_len,
  const char **headers, const size_t *header_lens, int header_count, int flags, const char *body, size_t body_len);
void porf_uws_on_event(int kind, int id, const char *data, size_t len, int extra);
void porf_uws_conn_close(int conn, int end);
}

namespace {

enum { DATA = 1, ABORTED = 2, WRITABLE = 3, OPEN = 4, CLOSE = 5, CLIENT_ERROR = 6 };
enum { HAS_BODY = 1, UPGRADE = 2, CLOSE_REQUESTED = 4, HTTP_1_0 = 8, NO_HOST = 16 };

// a connection's own writes, past the http layer
template <bool SSL>
struct Socket : uWS::AsyncSocket<SSL> {
  using uWS::AsyncSocket<SSL>::uncork;
  using uWS::AsyncSocket<SSL>::write;
  using uWS::AsyncSocket<SSL>::getBufferedAmount;
};

// bun's default maxRequestBodySize
const size_t MAX_BUFFERED_BODY = 128 << 20;

struct Slot {
  void *res = nullptr;
  bool ssl = false;
  int conn = -1;
  bool aborted = false;
  bool done = false;
  bool watching = false;
  bool released = false;
  bool paused = false;
  // close the connection once the response is out (its header is the js side's)
  bool close = false;
  // a known-length body tryEnd could not write yet
  std::string pending;
  uintmax_t total = 0;
  std::string body;
};

struct Conn {
  us_socket_t *s = nullptr;
  bool ssl = false;
  int slot = -1;
  // when its next request started arriving (uv_now), 0 once it is in
  uint64_t started = 0;
};

struct App {
  void *app = nullptr;
  bool ssl = false;
  us_listen_socket_t *listen = nullptr;
  bool buffer_bodies = false;
};

// uSockets' libuv poll (internal/eventing/libuv.h)
struct Poll {
  uv_poll_t *uv_p;
};

std::vector<Slot> slots;
std::vector<int> free_slots;
std::vector<Conn> conns;
std::vector<int> free_conns;
std::unordered_map<us_socket_t *, int> conn_ids;
std::vector<App> apps;
uv_loop_t *loop;

// f with the slot's response as its own type
template <typename F>
void with_res(int slot, F &&f) {
#ifdef PORF_UWS_SSL
  if (slots[slot].ssl) return f((uWS::HttpResponse<true> *)slots[slot].res);
#endif
  f((uWS::HttpResponse<false> *)slots[slot].res);
}

template <typename F>
void with_app(int app, F &&f) {
#ifdef PORF_UWS_SSL
  if (apps[app].ssl) return f((uWS::SSLApp *)apps[app].app);
#endif
  f((uWS::App *)apps[app].app);
}

template <bool SSL>
int take_slot(uWS::HttpResponse<SSL> *res, int conn) {
  int slot;
  if (!free_slots.empty()) {
    slot = free_slots.back();
    free_slots.pop_back();
  } else {
    slot = (int)slots.size();
    slots.emplace_back();
  }
  Slot &s = slots[slot];
  s.res = res;
  s.ssl = SSL;
  s.conn = conn;
  s.aborted = false;
  s.done = false;
  s.watching = false;
  s.released = false;
  s.paused = false;
  s.close = false;
  conns[conn].slot = slot;
  return slot;
}

// free once js let go and nothing is left to write
void maybe_free(int slot) {
  Slot &s = slots[slot];
  if (!s.released || (!s.aborted && !s.pending.empty())) return;
  s.res = nullptr;
  s.pending.clear();
  s.body.clear();
  free_slots.push_back(slot);
}

void abort_slot(int slot) {
  Slot &s = slots[slot];
  s.aborted = true;
  s.res = nullptr;
  if (s.released) maybe_free(slot);
    else porf_uws_on_event(ABORTED, slot, nullptr, 0, 0);
}

void watch_abort(int slot) {
  Slot &s = slots[slot];
  if (s.watching) return;
  s.watching = true;
  with_res(slot, [slot](auto *res) {
    res->onAborted([slot]() {
      if (!slots[slot].aborted) abort_slot(slot);
    });
  });
}

void close_after(int slot);

// known-length body: what tryEnd leaves is kept and retried as the socket drains
bool try_end(int slot, auto *res, std::string_view data) {
  Slot &s = slots[slot];
  if (!s.pending.empty()) {
    s.pending.append(data.data(), data.size());
    return false;
  }
  const uintmax_t before = res->getWriteOffset();
  const auto [ok, responded] = res->tryEnd(data, s.total);
  // whole known length out: uWS completed the response and may reuse it
  if (responded) s.done = true;
  if (ok) return true;
  s.pending.assign(data.substr((size_t)(res->getWriteOffset() - before)));
  watch_abort(slot);
  res->onWritable([slot, res](uintmax_t) {
    Slot &s = slots[slot];
    const uintmax_t before = res->getWriteOffset();
    const auto [ok, responded] = res->tryEnd(s.pending, s.total);
    if (responded) s.done = true;
    if (!ok) {
      s.pending.erase(0, (size_t)(res->getWriteOffset() - before));
      return false;
    }
    s.pending.clear();
    if (s.close) close_after(slot);
    if (s.released) maybe_free(slot);
      else porf_uws_on_event(WRITABLE, slot, nullptr, 0, 0);
    return true;
  });
  return false;
}

bool has_token(std::string_view value, std::string_view token) {
  for (size_t i = 0; i + token.size() <= value.size(); i++) {
    if (strncasecmp(value.data() + i, token.data(), token.size()) == 0) return true;
  }
  return false;
}

void dispatch(int app, int conn, int slot, uWS::HttpRequest *req, int flags, std::string_view body) {
  const char *names[UWS_HTTP_MAX_HEADERS_COUNT * 2];
  size_t lens[UWS_HTTP_MAX_HEADERS_COUNT * 2];
  int count = 0;
  for (auto [key, value] : *req) {
    names[count] = key.data();
    lens[count++] = key.size();
    names[count] = value.data();
    lens[count++] = value.size();
  }
  const std::string_view method = req->getCaseSensitiveMethod(), url = req->getFullUrl();
  porf_uws_on_request(app, conn, slot, method.data(), method.size(), url.data(), url.size(), names, lens, count, flags, body.data(), body.size());
  // still answering after the call (and the ticks it ran): watch for the connection going away
  const Slot &s = slots[slot];
  if (s.res && !s.done) watch_abort(slot);
}

template <bool SSL>
void on_request(int app, uWS::HttpResponse<SSL> *res, uWS::HttpRequest *req) {
  const int conn = conn_ids[(us_socket_t *)res];
  const int slot = take_slot(res, conn);
  conns[conn].started = 0;
  const std::string_view content_length = req->getHeader("content-length");
  const bool has_body = !req->getHeader("transfer-encoding").empty() || (!content_length.empty() && content_length != "0");
  const std::string_view connection = req->getHeader("connection");
  const bool upgrade = req->getCaseSensitiveMethod() == "CONNECT" || (!req->getHeader("upgrade").empty() && has_token(connection, "upgrade"));
  // uWebSockets closes after these itself
  const bool close = req->isAncient() || connection.length() == 5;
  const int flags = (has_body ? HAS_BODY : 0) | (upgrade ? UPGRADE : 0) | (close ? CLOSE_REQUESTED : 0) | (req->isAncient() ? HTTP_1_0 : 0) |
    (req->getHeader("host").data() ? 0 : NO_HOST);

  if (!has_body) {
    dispatch(app, conn, slot, req, flags, {});
    return;
  }

  if (apps[app].buffer_bodies) {
    // the request (and its headers) die with this callback: keep what the js side gets once the body is in
    std::vector<std::string> parts;
    parts.emplace_back(req->getCaseSensitiveMethod());
    parts.emplace_back(req->getFullUrl());
    for (auto [key, value] : *req) {
      parts.emplace_back(key);
      parts.emplace_back(value);
    }
    watch_abort(slot);
    res->onData([app, conn, slot, flags, parts = std::move(parts), res](std::string_view chunk, bool last) {
      Slot &s = slots[slot];
      if (s.aborted || s.done) return;
      if (s.body.size() + chunk.size() > MAX_BUFFERED_BODY) {
        // the slot is freed once the connection closes
        s.body = std::string();
        s.done = s.released = true;
        res->writeStatus("413 Payload Too Large")->end({}, true);
        return;
      }
      s.body.append(chunk.data(), chunk.size());
      if (!last) return;
      const char *names[UWS_HTTP_MAX_HEADERS_COUNT * 2];
      size_t lens[UWS_HTTP_MAX_HEADERS_COUNT * 2];
      int count = 0;
      for (size_t i = 2; i < parts.size(); i++) {
        names[count] = parts[i].data();
        lens[count++] = parts[i].size();
      }
      const std::string body = std::move(s.body);
      s.body.clear();
      porf_uws_on_request(app, conn, slot, parts[0].data(), parts[0].size(), parts[1].data(), parts[1].size(), names, lens, count, flags, body.data(), body.size());
    });
    return;
  }

  res->onData([slot](std::string_view chunk, bool last) {
    if (slots[slot].aborted) return;
    porf_uws_on_event(DATA, slot, chunk.data(), chunk.size(), last);
  });
  dispatch(app, conn, slot, req, flags, {});
}

template <bool SSL>
void on_connection(int app, uWS::HttpResponse<SSL> *res, int opened) {
  us_socket_t *s = (us_socket_t *)res;
  if (opened == 1) {
    int conn;
    if (!free_conns.empty()) {
      conn = free_conns.back();
      free_conns.pop_back();
    } else {
      conn = (int)conns.size();
      conns.emplace_back();
    }
    conns[conn].s = s;
    conns[conn].ssl = SSL;
    conns[conn].slot = -1;
    conns[conn].started = uv_now(loop);
    conn_ids[s] = conn;
    porf_uws_on_event(OPEN, conn, nullptr, (size_t)app, 0);
    return;
  }

  // detached connections are gone already
  const auto it = conn_ids.find(s);
  if (it == conn_ids.end()) return;
  const int conn = it->second;
  conn_ids.erase(it);
  // the request still running goes first, then the connection
  const int slot = conns[conn].slot;
  if (slot >= 0 && slots[slot].conn == conn && slots[slot].res && !slots[slot].aborted) abort_slot(slot);
  conns[conn].s = nullptr;
  free_conns.push_back(conn);
  porf_uws_on_event(CLOSE, conn, nullptr, 0, 0);
}

// reads between requests start the next one (headersTimeout)
void on_data(int, void *s) {
  const auto it = conn_ids.find((us_socket_t *)s);
  if (it == conn_ids.end()) return;
  Conn &c = conns[it->second];
  if (c.started == 0 && (c.slot < 0 || slots[c.slot].conn != it->second || slots[c.slot].released)) c.started = uv_now(loop);
}

// parser errors: js can answer (clientError) and close, else uWebSockets does
bool on_client_error(int ssl, void *s, unsigned int err) {
  const auto it = conn_ids.find((us_socket_t *)s);
  if (it == conn_ids.end()) return false;
  porf_uws_on_event(CLIENT_ERROR, it->second, nullptr, 0, (int)err);
  return us_socket_is_closed(ssl, (us_socket_t *)s);
}

// uWebSockets' pause also stops writing, so a response piped from its own request could never drain: reads only
void pause_reading(const Slot &s, bool pause) {
  us_socket_t *socket = conns[s.conn].s;
  us_poll_t *poll = (us_poll_t *)socket;
  const int events = us_poll_events(poll);
  us_poll_change(poll, us_socket_context_loop(s.ssl, us_socket_context(s.ssl, socket)), pause ? events & ~UV_READABLE : events | UV_READABLE);
}

bool live(int slot) {
  const Slot &s = slots[slot];
  return !s.aborted && !s.done && s.res;
}

template <bool SSL>
void conn_write(us_socket_t *s, const char *data, size_t len) {
  Socket<SSL> *socket = (Socket<SSL> *)s;
  socket->uncork();
  socket->write(data, (int)len);
}

template <bool SSL>
void conn_close(us_socket_t *s, bool end) {
  Socket<SSL> *socket = (Socket<SSL> *)s;
  socket->uncork();
  if (!end) {
    us_socket_close(SSL, s, 0, nullptr);
    return;
  }
  // fin once what is buffered drains
  if (socket->getBufferedAmount() > 0) {
    ((uWS::HttpResponse<SSL> *)s)->onWritable([s](uintmax_t) {
      Socket<SSL> *socket = (Socket<SSL> *)s;
      socket->write(nullptr, 0, true, 0);
      if (socket->getBufferedAmount() == 0) conn_close<SSL>(s, true);
      return true;
    });
    return;
  }
  // closed by the client's fin (or the timeout): closing now would reset it over an unread request body
  us_socket_shutdown(SSL, s);
  us_socket_timeout(SSL, s, 10);
}

// not uWS's close (it writes its header mid-body), which still closes requests asking it to
void close_after(int slot) {
  Slot &s = slots[slot];
  if (!s.pending.empty()) return;
  s.close = false;
  porf_uws_conn_close(s.conn, 1);
}

}

extern "C" {

int porf_uws_app_new(void *uv_loop, int buffer_bodies, int ssl) {
  uWS::Loop::get(uv_loop);
  loop = (uv_loop_t *)uv_loop;
  uWS::httpDataHandler = on_data;
  uWS::httpErrorHandler = on_client_error;
  const int id = (int)apps.size();
  apps.emplace_back();
  apps[id].buffer_bodies = buffer_bodies != 0;
#ifdef PORF_UWS_SSL
  // its SSL_CTX is set up by the js side (porf_uws_ssl_ctx)
  apps[id].ssl = ssl != 0;
  if (ssl) apps[id].app = new uWS::SSLApp();
    else apps[id].app = new uWS::App();
#else
  apps[id].app = new uWS::App();
#endif
  with_app(id, [id](auto *app) {
    app->any("/*", [id](auto *res, uWS::HttpRequest *req) {
      on_request(id, res, req);
    });
    app->filter([id](auto *res, int opened) {
      on_connection(id, res, opened);
    });
  });
  return id;
}

#ifdef PORF_UWS_SSL
void *porf_uws_ssl_ctx(int app) {
  return ((uWS::SSLApp *)apps[app].app)->getNativeHandle();
}
#endif

// the header size limit, shared by all servers
void porf_uws_max_header_size(double size) {
  uWS::MAX_FALLBACK_SIZE = (size_t)size;
}

// the bound port (0 for a unix socket path), or -errno if listening failed
int porf_uws_listen(int app, const char *host, int port, const char *path) {
  App &a = apps[app];
  a.listen = nullptr;
  errno = 0;
  auto done = [&a](us_listen_socket_t *socket) {
    a.listen = socket;
  };
  with_app(app, [&](auto *x) {
    if (path) x->listen(done, path);
      else if (*host) x->listen(host, port, LIBUS_LISTEN_EXCLUSIVE_PORT, done);
      else x->listen(port, LIBUS_LISTEN_EXCLUSIVE_PORT, done);
  });
  if (!a.listen) return errno ? -errno : -EADDRINUSE;
  return path ? 0 : us_socket_local_port(a.ssl, (us_socket_t *)a.listen);
}

void porf_uws_close(int app) {
  App &a = apps[app];
  if (!a.listen) return;
  us_listen_socket_close(a.ssl, a.listen);
  a.listen = nullptr;
}

// whether listening keeps the loop alive
void porf_uws_ref(int app, int ref) {
  App &a = apps[app];
  if (!a.listen) return;
  uv_handle_t *handle = (uv_handle_t *)((Poll *)a.listen)->uv_p;
  if (ref) uv_ref(handle);
    else uv_unref(handle);
}

void porf_uws_release(int slot) {
  Slot &s = slots[slot];
  if (s.released) return;
  // the connection carries on with its next request
  if (s.paused && !s.aborted && s.res) pause_reading(s, false);
  s.paused = false;
  s.released = true;
  maybe_free(slot);
}

// whole response: status, header pairs, body; no_body (head, 204, 304) sends none, with reported (>= 0) as its length
void porf_uws_end(int slot, const char *status, size_t status_len, const char **headers, const size_t *header_lens, int header_count,
  const char *body, size_t body_len, int no_body, double reported, int close) {
  if (!live(slot)) return;
  slots[slot].done = true;
  with_res(slot, [=](auto *res) {
    res->cork([=]() {
      res->writeStatus(std::string_view(status, status_len));
      for (int i = 0; i < header_count; i += 2) res->writeHeader(std::string_view(headers[i], header_lens[i]), std::string_view(headers[i + 1], header_lens[i + 1]));
      if (!no_body) res->end(std::string_view(body, body_len));
        else if (reported >= 0) res->endWithoutBody((size_t)reported);
        else res->endWithoutBody(std::nullopt);
    });
  });
  if (close) close_after(slot);
}

void porf_uws_write_head(int slot, const char *status, size_t status_len, const char **headers, const size_t *header_lens, int header_count) {
  if (!live(slot)) return;
  with_res(slot, [=](auto *res) {
    res->cork([=]() {
      res->writeStatus(std::string_view(status, status_len));
      for (int i = 0; i < header_count; i += 2) res->writeHeader(std::string_view(headers[i], header_lens[i]), std::string_view(headers[i + 1], header_lens[i + 1]));
    });
  });
}

// a body chunk: chunked, or part of total bytes when the length is known; 0 = backpressure, 'writable' follows
int porf_uws_write(int slot, const char *data, size_t len, double total) {
  if (!live(slot)) return 1;
  bool ok = true;
  with_res(slot, [&](auto *res) {
    res->cork([&]() {
      if (total >= 0) {
        slots[slot].total = (uintmax_t)total;
        ok = try_end(slot, res, std::string_view(data, len));
      } else ok = res->write(std::string_view(data, len));
    });
    if (!ok && total < 0) {
      watch_abort(slot);
      res->onWritable([slot](uintmax_t) {
        porf_uws_on_event(WRITABLE, slot, nullptr, 0, 0);
        return true;
      });
    }
  });
  return ok;
}

// the last chunk: chunked end, or the rest of a known length
void porf_uws_finish(int slot, const char *data, size_t len, double total, int close) {
  if (!live(slot)) return;
  Slot &s = slots[slot];
  s.done = true;
  s.close = close != 0;
  with_res(slot, [&](auto *res) {
    res->cork([&]() {
      if (total >= 0) {
        s.total = (uintmax_t)total;
        try_end(slot, res, std::string_view(data, len));
      } else res->end(std::string_view(data, len));
    });
  });
  if (s.close) close_after(slot);
}

void porf_uws_write_continue(int slot) {
  if (live(slot)) with_res(slot, [](auto *res) { res->writeContinue(); });
}

void porf_uws_pause(int slot, int pause) {
  Slot &s = slots[slot];
  if (s.aborted || !s.res || s.paused == (pause != 0)) return;
  s.paused = pause != 0;
  pause_reading(s, s.paused);
}

// bytes straight onto a connection, past what is corked
void porf_uws_conn_write(int conn, const char *data, size_t len) {
  const Conn &c = conns[conn];
  if (!c.s) return;
#ifdef PORF_UWS_SSL
  if (c.ssl) return conn_write<true>(c.s, data, len);
#endif
  conn_write<false>(c.s, data, len);
}

// flushes what was written first; end: FIN once what is buffered is out, else close at once
void porf_uws_conn_close(int conn, int end) {
  const Conn &c = conns[conn];
  if (!c.s) return;
#ifdef PORF_UWS_SSL
  if (c.ssl) return conn_close<true>(c.s, end);
#endif
  conn_close<false>(c.s, end);
}

// ms since the connection's next request started arriving, or -1
double porf_uws_receiving(int conn) {
  const Conn &c = conns[conn];
  return c.started ? (double)(uv_now(loop) - c.started) : -1;
}

// hands the connection to a node socket (upgrade, connect): dup'd fd and bytes read past the request, -1 for tls
int porf_uws_detach(int slot, const char **head, size_t *head_len) {
  Slot &s = slots[slot];
  const int conn = s.conn;
  us_socket_t *socket = conns[conn].s;
  if (conns[conn].ssl) return -1;
  *head = uWS::httpRemaining.data();
  *head_len = uWS::httpRemaining.size();
  const int fd = dup(us_poll_fd((us_poll_t *)socket));
  s.done = true;
  s.released = true;
  maybe_free(slot);
  conn_ids.erase(socket);
  conns[conn].s = nullptr;
  free_conns.push_back(conn);
  us_socket_close(0, socket, 0, nullptr);
  return fd;
}

// remote address text (as node writes it) into buf, returns its length; port out
size_t porf_uws_remote(int conn, char *buf, size_t cap, int *port) {
  const Conn &c = conns[conn];
  if (!c.s) return 0;
  char ip[16];
  int len = sizeof(ip);
  us_socket_remote_address(c.ssl, c.s, ip, &len);
  if (!inet_ntop(len == 4 ? AF_INET : AF_INET6, ip, buf, (socklen_t)cap)) return 0;
  *port = us_socket_remote_port(c.ssl, c.s);
  return strlen(buf);
}

}
