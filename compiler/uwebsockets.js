import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { TYPES } from './types.js';

export const UWS_REPO_URL = 'https://github.com/uNetworking/uWebSockets';
export const UWS_COMMIT = '360c276d609d59af56ae6932adb95154ace9f15f';

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, {
  stdio: 'pipe',
  encoding: 'utf8',
  ...opts
});

const __dirname = import.meta.dirname;
const UWS_PATCH_DIR = path.join(__dirname, 'uwebsockets');

const uWebSocketsPatches = () => {
  if (!fs.existsSync(UWS_PATCH_DIR)) return [];

  return fs.readdirSync(UWS_PATCH_DIR)
    .filter(file => file.endsWith('.patch'))
    .sort()
    .map(file => path.join(UWS_PATCH_DIR, file));
};

const applyUWebSocketsPatches = repoDir => {
  for (const patch of uWebSocketsPatches()) {
    try {
      run('git', [ 'apply', '--check', patch ], { cwd: repoDir });
      run('git', [ 'apply', patch ], { cwd: repoDir });
    } catch (error) {
      const stderr = error?.stderr?.toString?.().trim?.();
      const stdout = error?.stdout?.toString?.().trim?.();
      throw new Error(stderr || stdout || `failed to apply ${path.basename(patch)}`);
    }
  }
};

export const ensureUWebSockets = () => {
  const cacheRoot = path.join(os.homedir(), '.cache', 'porffor', 'deps');
  const repoDir = path.join(cacheRoot, `uWebSockets-${UWS_COMMIT}${Prefs.musl ? '-musl' : ''}`);
  const appHeader = path.join(repoDir, 'src', 'App.h');
  const uSocketsDir = path.join(repoDir, 'uSockets');

  if (fs.existsSync(appHeader) && fs.existsSync(path.join(uSocketsDir, 'src'))) {
    return repoDir;
  }

  fs.mkdirSync(cacheRoot, { recursive: true });

  const tempDir = path.join(cacheRoot, `.uWebSockets-${process.pid}-${Date.now()}`);
  fs.rmSync(tempDir, { recursive: true, force: true });
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    run('git', [ 'init' ], { cwd: tempDir });
    run('git', [ 'remote', 'add', 'origin', UWS_REPO_URL ], { cwd: tempDir });
    run('git', [ 'fetch', '--depth', '1', 'origin', UWS_COMMIT ], { cwd: tempDir });
    run('git', [ 'checkout', '--detach', 'FETCH_HEAD' ], { cwd: tempDir });
    run('git', [ 'submodule', 'update', '--init', '--depth', '1', 'uSockets' ], { cwd: tempDir });
    applyUWebSocketsPatches(tempDir);

    fs.rmSync(repoDir, { recursive: true, force: true });
    fs.renameSync(tempDir, repoDir);
  } catch (error) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    const stderr = error?.stderr?.toString?.().trim?.();
    const stdout = error?.stdout?.toString?.().trim?.();
    throw new Error(stderr || stdout || `failed to fetch uWebSockets @ ${UWS_COMMIT}`);
  }

  return repoDir;
};

export const ensureUSocketsBuilt = uwsDir => {
  const uSocketsDir = path.join(uwsDir, 'uSockets');
  const archive = path.join(uSocketsDir, 'uSockets.a');

  if (fs.existsSync(archive)) return archive;
  fs.rmSync(archive, { force: true });
  const env = {
    ...process.env,
    CC: Prefs.musl ? 'zig cc -target x86_64-linux-musl' : process.env.CC ?? 'cc'
  };
  if (Prefs.musl) env.AR = 'zig ar';

  try {
    run('make', [
      '-C', uSocketsDir,
      'WITH_OPENSSL=0',
      'WITH_BORINGSSL=0',
      'WITH_WOLFSSL=0',
      'WITH_QUIC=0',
      'WITH_IO_URING=0',
      'WITH_LIBUV=0',
      'WITH_ASIO=0',
      ...(Prefs.musl ? [ 'WITH_LTO=0' ] : [])
    ], {
      env
    });
  } catch (error) {
    const stderr = error?.stderr?.toString?.().trim?.();
    const stdout = error?.stdout?.toString?.().trim?.();
    throw new Error(stderr || stdout || 'failed to build uSockets.a');
  }

  if (!fs.existsSync(archive)) {
    throw new Error('uSockets build completed without producing uSockets.a');
  }

  return archive;
};

const cmakeTargetName = name => {
  const out = name.replace(/[^A-Za-z0-9_]+/g, '_').replace(/^[^A-Za-z_]+/, '');
  return out.length > 0 ? out : 'porffor_native_fetch';
};

const makeUWebSocketsCMakeLists = (projectDirName, cFileName = 'app.c', cppFileName = 'server.cpp') => {
  const targetName = cmakeTargetName(projectDirName);

  return `cmake_minimum_required(VERSION 3.20)

${Prefs.musl ? `set(CMAKE_C_COMPILER zig cc)
set(CMAKE_CXX_COMPILER zig c++)
set(CMAKE_ASM_COMPILER zig cc)
set(CMAKE_C_COMPILER_TARGET x86_64-linux-musl)
set(CMAKE_CXX_COMPILER_TARGET x86_64-linux-musl)
set(CMAKE_ASM_COMPILER_TARGET x86_64-linux-musl)
set(CMAKE_EXE_LINKER_FLAGS_INIT "-static")

` : ''}\
project(${targetName} LANGUAGES C CXX ASM)

${Prefs.musl ? `set(CMAKE_C_LINK_DEPENDS_USE_LINKER FALSE)
set(CMAKE_CXX_LINK_DEPENDS_USE_LINKER FALSE)
set(CMAKE_ASM_LINK_DEPENDS_USE_LINKER FALSE)
set(CMAKE_C_LINKER_DEPFILE_SUPPORTED FALSE)
set(CMAKE_CXX_LINKER_DEPFILE_SUPPORTED FALSE)
set(CMAKE_ASM_LINKER_DEPFILE_SUPPORTED FALSE)

` : ''}\
set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)
set(CMAKE_C_EXTENSIONS OFF)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

if(NOT CMAKE_BUILD_TYPE AND NOT CMAKE_CONFIGURATION_TYPES)
  set(CMAKE_BUILD_TYPE Release CACHE STRING "Build type" FORCE)
endif()

set(PORFFOR_NATIVE_MARCH "" CACHE STRING "Optional -march value for the native fetch server build")
set(PORFFOR_UWS_REPO_URL "${UWS_REPO_URL}.git")
set(PORFFOR_UWS_COMMIT "${UWS_COMMIT}")
set(PORFFOR_UWS_DIR "\${CMAKE_CURRENT_SOURCE_DIR}/uWebSockets")
set(PORFFOR_USOCKETS_CC "${Prefs.musl ? 'zig cc -target x86_64-linux-musl' : '${CMAKE_C_COMPILER}'}")
${Prefs.musl ? 'set(PORFFOR_USOCKETS_AR "zig ar")\n' : ''}\

include(ExternalProject)
include(CheckIPOSupported)

find_package(Git QUIET)
find_package(Threads REQUIRED)
find_program(PORFFOR_MAKE_PROGRAM NAMES gmake make REQUIRED)

set(PORFFOR_UWS_FETCH_DEPS)
set(PORFFOR_UWS_CACHE_ROOT "$ENV{HOME}/.cache/porffor/deps")
set(PORFFOR_UWS_CACHE_DIR "\${PORFFOR_UWS_CACHE_ROOT}/uWebSockets-\${PORFFOR_UWS_COMMIT}${Prefs.musl ? '-musl' : ''}")
set(PORFFOR_UWS_LINK_DIR "\${CMAKE_BINARY_DIR}/_deps/uwebsockets/src/uwebsockets")

if(NOT EXISTS "\${PORFFOR_UWS_DIR}/src/App.h" OR NOT EXISTS "\${PORFFOR_UWS_DIR}/uSockets/src")
  if(NOT EXISTS "\${PORFFOR_UWS_CACHE_DIR}/src/App.h" OR NOT EXISTS "\${PORFFOR_UWS_CACHE_DIR}/uSockets/src")
    if(NOT Git_FOUND)
      message(FATAL_ERROR "uWebSockets is missing and Git is unavailable to fetch it")
    endif()

    file(MAKE_DIRECTORY "\${PORFFOR_UWS_CACHE_ROOT}")
    set(PORFFOR_UWS_CACHE_TMP "\${PORFFOR_UWS_CACHE_DIR}.tmp")
    if(EXISTS "\${PORFFOR_UWS_CACHE_TMP}" OR IS_SYMLINK "\${PORFFOR_UWS_CACHE_TMP}")
      file(REMOVE_RECURSE "\${PORFFOR_UWS_CACHE_TMP}")
    endif()

    execute_process(
      COMMAND "\${GIT_EXECUTABLE}" clone "\${PORFFOR_UWS_REPO_URL}" "\${PORFFOR_UWS_CACHE_TMP}"
      RESULT_VARIABLE porffor_uws_clone_result
      OUTPUT_VARIABLE porffor_uws_clone_stdout
      ERROR_VARIABLE porffor_uws_clone_stderr
    )
    if(NOT porffor_uws_clone_result EQUAL 0)
      file(REMOVE_RECURSE "\${PORFFOR_UWS_CACHE_TMP}")
      message(FATAL_ERROR "failed to clone uWebSockets cache into \${PORFFOR_UWS_CACHE_DIR}\n\${porffor_uws_clone_stdout}\n\${porffor_uws_clone_stderr}")
    endif()

    execute_process(
      COMMAND "\${GIT_EXECUTABLE}" -C "\${PORFFOR_UWS_CACHE_TMP}" checkout "\${PORFFOR_UWS_COMMIT}"
      RESULT_VARIABLE porffor_uws_checkout_result
      OUTPUT_VARIABLE porffor_uws_checkout_stdout
      ERROR_VARIABLE porffor_uws_checkout_stderr
    )
    if(NOT porffor_uws_checkout_result EQUAL 0)
      file(REMOVE_RECURSE "\${PORFFOR_UWS_CACHE_TMP}")
      message(FATAL_ERROR "failed to checkout cached uWebSockets commit \${PORFFOR_UWS_COMMIT}\n\${porffor_uws_checkout_stdout}\n\${porffor_uws_checkout_stderr}")
    endif()

    execute_process(
      COMMAND "\${GIT_EXECUTABLE}" -C "\${PORFFOR_UWS_CACHE_TMP}" submodule update --init --depth 1 uSockets
      RESULT_VARIABLE porffor_uws_submodule_result
      OUTPUT_VARIABLE porffor_uws_submodule_stdout
      ERROR_VARIABLE porffor_uws_submodule_stderr
    )
    if(NOT porffor_uws_submodule_result EQUAL 0)
      file(REMOVE_RECURSE "\${PORFFOR_UWS_CACHE_TMP}")
      message(FATAL_ERROR "failed to initialize cached uWebSockets submodule\n\${porffor_uws_submodule_stdout}\n\${porffor_uws_submodule_stderr}")
    endif()

    file(RENAME "\${PORFFOR_UWS_CACHE_TMP}" "\${PORFFOR_UWS_CACHE_DIR}")
  endif()

  file(MAKE_DIRECTORY "\${CMAKE_BINARY_DIR}/_deps/uwebsockets/src")
  if(EXISTS "\${PORFFOR_UWS_LINK_DIR}" OR IS_SYMLINK "\${PORFFOR_UWS_LINK_DIR}")
    file(REMOVE_RECURSE "\${PORFFOR_UWS_LINK_DIR}")
  endif()
  execute_process(
    COMMAND "\${CMAKE_COMMAND}" -E create_symlink "\${PORFFOR_UWS_CACHE_DIR}" "\${PORFFOR_UWS_LINK_DIR}"
    RESULT_VARIABLE porffor_uws_symlink_result
  )
  if(NOT porffor_uws_symlink_result EQUAL 0)
    message(FATAL_ERROR "failed to link cached uWebSockets from \${PORFFOR_UWS_CACHE_DIR}")
  endif()
  set(PORFFOR_UWS_DIR "\${PORFFOR_UWS_LINK_DIR}")
endif()

set(PORFFOR_USOCKETS_ARCHIVE "\${PORFFOR_UWS_DIR}/uSockets/uSockets.a")
add_custom_command(
  OUTPUT "\${PORFFOR_USOCKETS_ARCHIVE}"
  COMMAND "\${PORFFOR_MAKE_PROGRAM}" -C "\${PORFFOR_UWS_DIR}/uSockets"
    WITH_OPENSSL=0
    WITH_BORINGSSL=0
    WITH_WOLFSSL=0
    WITH_QUIC=0
    WITH_IO_URING=0
    WITH_LIBUV=0
    WITH_ASIO=0
${Prefs.musl ? '    WITH_LTO=0\n' : ''}\
    "CC=\${PORFFOR_USOCKETS_CC}"
${Prefs.musl ? '    "AR=${PORFFOR_USOCKETS_AR}"\n' : ''}\
  DEPENDS \${PORFFOR_UWS_FETCH_DEPS}
  VERBATIM
)
add_custom_target(uSockets_build DEPENDS "\${PORFFOR_USOCKETS_ARCHIVE}")

add_library(uSockets STATIC IMPORTED GLOBAL)
set_target_properties(uSockets PROPERTIES IMPORTED_LOCATION "\${PORFFOR_USOCKETS_ARCHIVE}")
add_dependencies(uSockets uSockets_build)

add_executable(${targetName}
  ${cFileName}
  ${cppFileName}
)

target_include_directories(${targetName} PRIVATE
  "\${PORFFOR_UWS_DIR}/src"
  "\${PORFFOR_UWS_DIR}/uSockets/src"
)

target_compile_definitions(${targetName} PRIVATE
  _POSIX_C_SOURCE=200809L
  _GNU_SOURCE
  $<$<PLATFORM_ID:Darwin>:_DARWIN_C_SOURCE>
  UWS_NO_ZLIB
  UWS_HTTPRESPONSE_NO_WRITEMARK
)

target_compile_options(${targetName} PRIVATE
  -ffunction-sections
  -fdata-sections
  -fno-ident
${Prefs.d ? '' : '  $<$<PLATFORM_ID:Darwin>:-fvisibility=hidden>\n'}\
  $<$<COMPILE_LANGUAGE:CXX>:-fno-exceptions>
  $<$<COMPILE_LANGUAGE:CXX>:-fno-rtti>
  $<$<COMPILE_LANGUAGE:CXX>:-fno-unwind-tables>
  $<$<COMPILE_LANGUAGE:CXX>:-fno-asynchronous-unwind-tables>
)

if(PORFFOR_NATIVE_MARCH)
  target_compile_options(${targetName} PRIVATE "-march=\${PORFFOR_NATIVE_MARCH}")
endif()

target_link_libraries(${targetName} PRIVATE
  uSockets
  Threads::Threads
  m
)

target_link_options(${targetName} PRIVATE
  $<$<PLATFORM_ID:Darwin>:-Wl,-stack_size,0x4000000>
${Prefs.d ? '' : `  $<$<PLATFORM_ID:Darwin>:-Wl,-dead_strip>
  $<$<PLATFORM_ID:Darwin>:-Wl,-dead_strip_dylibs>
  $<$<PLATFORM_ID:Darwin>:-Wl,-x>
`}\
  $<$<NOT:$<PLATFORM_ID:Darwin>>:-Wl,--gc-sections>
${Prefs.musl ? '  -static\n' : ''}\
)

${Prefs.musl ? '' : `\
check_ipo_supported(RESULT porffor_ipo_supported OUTPUT porffor_ipo_error)
if(porffor_ipo_supported)
  set_property(TARGET ${targetName} PROPERTY INTERPROCEDURAL_OPTIMIZATION TRUE)
endif()

`}\
set_target_properties(${targetName} PROPERTIES
  OUTPUT_NAME "${projectDirName}"
  RUNTIME_OUTPUT_DIRECTORY "\${CMAKE_BINARY_DIR}"
)`;
};

const materializeUWebSocketsDir = outDir => {
  const uwsDir = ensureUWebSockets();
  const destDir = path.join(outDir, 'uWebSockets');

  fs.rmSync(destDir, { recursive: true, force: true });

  try {
    const relativeTarget = path.relative(outDir, uwsDir);
    fs.symlinkSync(relativeTarget, destDir, process.platform === 'win32' ? 'junction' : 'dir');
  } catch {
    fs.cpSync(uwsDir, destDir, { recursive: true });
  }
};

export const writeNativeFetchPackage = (outDir, cOut) => {
  const resolvedDir = path.resolve(outDir);
  const cFileName = 'app.c';
  const cppFileName = 'server.cpp';
  const cmakeFileName = 'CMakeLists.txt';

  if (typeof cOut === 'string' || !cOut.nativeFetch) {
    throw new Error('native fetch package generation requires native fetch C output');
  }

  fs.mkdirSync(resolvedDir, { recursive: true });
  fs.writeFileSync(path.join(resolvedDir, cFileName), cOut.c);
  fs.writeFileSync(path.join(resolvedDir, cppFileName), makeUWebSocketsShimSource());
  fs.writeFileSync(path.join(resolvedDir, cmakeFileName), makeUWebSocketsCMakeLists(path.basename(resolvedDir), cFileName, cppFileName));
  materializeUWebSocketsDir(resolvedDir);
};

export const makeUWebSocketsShimSource = (threads = false) => `
#include "App.h"
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <limits>
#include <memory>
#include <string>
#include <string_view>
#include <unordered_map>
${threads ? `#include <pthread.h>
#include <thread>
#include <vector>` : ''}

extern "C" {
typedef int i32;
typedef unsigned int u32;
typedef unsigned long long u64;
typedef double f64;

struct jsval {
  f64 val;
  i32 type;
};
struct NativeFetchResponseParts {
  i32 status;
  struct jsval body;
  struct jsval headers;
};

void porf_native_fetch_runtime_init(void);
void porf_native_fetch_collect_normal(void);
void porf_native_fetch_collect_normal_from(void* stack_top);
u32 porf_native_fetch_alloc(u32 bytes, u32 type);
u32 porf_native_fetch_alloc_bytestring(const char* input, size_t len);
i32 porf_gc_native_root_add(f64 value, i32 type);
void porf_gc_native_root_remove(i32 slot);
extern unsigned char* porf_mem;
struct jsval porf_native_fetch_call_handler(f64 method_value, i32 method_type, f64 url_value, i32 url_type, f64 headers_value, i32 headers_type, f64 body_value, i32 body_type);
void porf_native_fetch_finalize_response(f64 response_value, i32 response_type, struct NativeFetchResponseParts* out);
f64 porf_native_fetch_get_port(void);
int porf_native_fetch_should_collect(void);
int porf_native_fetch_read_value(struct jsval value, const char** out_buf, size_t* out_len, char** out_owned);
int porf_native_fetch_promise_state(struct jsval value);
struct jsval porf_native_fetch_promise_result(struct jsval value);
void porf_native_fetch_attach_response(struct jsval promise, void* pending, u32* fulfill_out, u32* reject_out);
void porf_native_fetch_cancel_response_reaction(u32 reaction);
void porf_native_fetch_drain_microtasks(void);
void porf_native_fetch_fire_timer(u32 id);
}

${threads ? `static pthread_rwlock_t __porffor_js_rwlock = PTHREAD_RWLOCK_INITIALIZER;
static inline void __porffor_js_enter(void) { pthread_rwlock_rdlock(&__porffor_js_rwlock); }
static inline void __porffor_js_exit(void) { pthread_rwlock_unlock(&__porffor_js_rwlock); }` : `static inline void __porffor_js_enter(void) {}
static inline void __porffor_js_exit(void) {}`}

${Prefs.eventLoop ? `struct NativeTimer {
  u32 id = 0;
  us_timer_t* timer = nullptr;
  bool repeat = false;
};

static std::unordered_map<u32, NativeTimer*> native_timers;
static u32 native_timer_firing = 0;

extern "C" void porf_native_fetch_timer_start(u32 id, i32 delay_ms, i32 repeat_ms) {
  auto* loop = (struct us_loop_t*)uWS::Loop::get();
  auto* timer = us_create_timer(loop, 0, sizeof(NativeTimer*));
  auto* native_timer = new NativeTimer();
  native_timer->id = id;
  native_timer->timer = timer;
  native_timer->repeat = repeat_ms != 0;
  std::memcpy(us_timer_ext(timer), &native_timer, sizeof(native_timer));
  native_timers[id] = native_timer;
  us_timer_set(timer, [](struct us_timer_t* timer) {
    NativeTimer* native_timer = nullptr;
    std::memcpy(&native_timer, us_timer_ext(timer), sizeof(native_timer));
    if (!native_timer) return;

    const u32 id = native_timer->id;

    native_timer_firing = id;
    __porffor_js_enter();
    porf_native_fetch_fire_timer(id);
    __porffor_js_exit();
    native_timer_firing = 0;

    if (!native_timer->repeat || native_timers.find(id) == native_timers.end()) {
      native_timers.erase(id);
      us_timer_close(timer);
      delete native_timer;
    }
  }, delay_ms < 0 ? 0 : delay_ms, repeat_ms < 0 ? 0 : repeat_ms);
}

extern "C" void porf_native_fetch_timer_clear(u32 id) {
  auto it = native_timers.find(id);
  if (it == native_timers.end()) return;
  NativeTimer* native_timer = it->second;
  native_timers.erase(it);
  if (native_timer_firing == id) {
    native_timer->repeat = false;
    return;
  }
  us_timer_close(native_timer->timer);
  delete native_timer;
}` : `// event loop disabled (no --event-loop): timers not available`}

static i32 method_get = 0;
static i32 method_head = 0;
static i32 method_post = 0;
static i32 method_put = 0;
static i32 method_delete = 0;
static i32 method_connect = 0;
static i32 method_options = 0;
static i32 method_trace = 0;
static i32 method_patch = 0;

static const u64 JSVAL_PATTERN = 0xFFF8000000000000ull;
static const i32 JS_TYPE_NUMBER = ${TYPES.number};

static inline u64 pack_bytestring(i32 ptr) {
  return JSVAL_PATTERN | ((u64)${TYPES.bytestring} << 43) | (u64)(u32)ptr;
}

static inline struct jsval unpack_jsval(u64 bits) {
  if ((bits & JSVAL_PATTERN) != JSVAL_PATTERN) {
    f64 value;
    std::memcpy(&value, &bits, sizeof(value));
    return { value, JS_TYPE_NUMBER };
  }

  return { (f64)(u32)bits, (i32)((bits >> 43) & 0xff) };
}

static i32 alloc_static_bytestring(const char* input, size_t len) {
  const i32 ptr = (i32)porf_native_fetch_alloc_bytestring(input, len);
  porf_gc_native_root_add((f64)ptr, ${TYPES.bytestring});
  return ptr;
}

static void porf_native_fetch_static_init(void) {
  if (method_get != 0) return;

  method_get = alloc_static_bytestring("GET", 3);
  method_head = alloc_static_bytestring("HEAD", 4);
  method_post = alloc_static_bytestring("POST", 4);
  method_put = alloc_static_bytestring("PUT", 3);
  method_delete = alloc_static_bytestring("DELETE", 6);
  method_connect = alloc_static_bytestring("CONNECT", 7);
  method_options = alloc_static_bytestring("OPTIONS", 7);
  method_trace = alloc_static_bytestring("TRACE", 5);
  method_patch = alloc_static_bytestring("PATCH", 5);
}

static i32 alloc_request_url(uWS::HttpRequest* req) {
  std::string_view host = req->getHeader("host");
  std::string_view target = req->getFullUrl();

  if (host.empty()) {
    return (i32)porf_native_fetch_alloc_bytestring(target.data(), target.size());
  }

  const size_t len = 7 + host.size() + target.size();
  const i32 ptr = (i32)porf_native_fetch_alloc((u32)(len + 4), ${TYPES.bytestring});
  unsigned char* out = porf_mem + ptr;
  *((i32*)out) = (i32)len;
  out += 4;

  memcpy(out, "http://", 7);
  out += 7;
  memcpy(out, host.data(), host.size());
  out += host.size();
  memcpy(out, target.data(), target.size());
  return ptr;
}

struct NativeRoot {
  i32 slot = -1;

  NativeRoot() = default;
  NativeRoot(f64 value, i32 type) {
    reset(value, type);
  }
  NativeRoot(const NativeRoot&) = delete;
  NativeRoot& operator=(const NativeRoot&) = delete;

  ~NativeRoot() {
    clear();
  }

  void reset(f64 value, i32 type) {
    clear();
    slot = porf_gc_native_root_add(value, type);
  }

  void clear() {
    if (slot >= 0) {
      porf_gc_native_root_remove(slot);
      slot = -1;
    }
  }
};

static i32 collect_headers(uWS::HttpRequest* req) {
  i32 header_capacity = 0;
  for (auto [key, value] : *req) {
    (void)key;
    (void)value;
    header_capacity += 2;
  }
  const i32 header_bytes = 16 + header_capacity * 8;
  const i32 headers_ptr = (i32)porf_native_fetch_alloc((u32)header_bytes, ${TYPES.array});
  const i32 entries_ptr = headers_ptr + 16;
  *((i32*)(porf_mem + headers_ptr)) = 0;
  *((u32*)(porf_mem + headers_ptr + 4)) = (u32)entries_ptr;
  *((i32*)(porf_mem + headers_ptr + 8)) = header_capacity;
  i32 slot = 0;
  for (auto [key, value] : *req) {
    const i32 key_base = entries_ptr + slot * 8;
    *((u64*)(porf_mem + key_base)) = pack_bytestring((i32)porf_native_fetch_alloc_bytestring(key.data(), key.size()));
    slot++;

    const i32 value_base = entries_ptr + slot * 8;
    *((u64*)(porf_mem + value_base)) = pack_bytestring((i32)porf_native_fetch_alloc_bytestring(value.data(), value.size()));
    slot++;
  }
  *((i32*)(porf_mem + headers_ptr)) = slot;

  return headers_ptr;
}

static i32 get_method_ptr(std::string_view method) {
  if (method == "GET") return method_get;
  if (method == "HEAD") return method_head;
  if (method == "POST") return method_post;
  if (method == "PUT") return method_put;
  if (method == "DELETE") return method_delete;
  if (method == "CONNECT") return method_connect;
  if (method == "OPTIONS") return method_options;
  if (method == "TRACE") return method_trace;
  if (method == "PATCH") return method_patch;
  return 0;
}

struct NativeRequestRoots {
  NativeRoot url;
  NativeRoot headers;

  NativeRequestRoots() = default;
  NativeRequestRoots(const NativeRequestRoots&) = delete;
  NativeRequestRoots& operator=(const NativeRequestRoots&) = delete;

  ~NativeRequestRoots() {
    clear();
  }

  void set_url(i32 url_ptr) {
    url.reset((f64)url_ptr, ${TYPES.bytestring});
  }

  void set_headers(i32 headers_ptr) {
    headers.reset((f64)headers_ptr, ${TYPES.array});
  }

  void reset(i32 url_ptr, i32 headers_ptr) {
    set_url(url_ptr);
    set_headers(headers_ptr);
  }

  void clear() {
    url.clear();
    headers.clear();
  }
};

struct PendingRequest {
  bool aborted = false;
  bool finished = false;
  i32 method_ptr = 0;
  i32 url_ptr = 0;
  i32 headers_ptr = 0;
  NativeRequestRoots roots;
  std::string body;
};

static const size_t REQUEST_BODY_MAX_BYTES = 1024u * 1024u;

static void collect_after_request(void) {
  volatile int porf_stack_anchor = 0;
${threads ? `  if (!porf_native_fetch_should_collect()) return;
  pthread_rwlock_wrlock(&__porffor_js_rwlock);
  porf_native_fetch_collect_normal_from((void*)&porf_stack_anchor);
  pthread_rwlock_unlock(&__porffor_js_rwlock);` : '  porf_native_fetch_collect_normal_from((void*)&porf_stack_anchor);'}
}

static void respond_with_error(uWS::HttpResponse<false>* res, std::string_view status, std::string_view body, bool close_connection = false) {
  res->cork([res, status, body, close_connection]() {
    res->writeStatus(status);
    res->writeHeader("Content-Type", "text/plain; charset=utf-8");
    res->end(body, close_connection);
  });
}

static bool parse_content_length(std::string_view input, size_t* out) {
  if (input.empty()) return false;

  size_t value = 0;
  for (char c : input) {
    if (c < '0' || c > '9') return false;
    const size_t digit = (size_t)(c - '0');
    if (value > (((std::numeric_limits<size_t>::max)() - digit) / 10u)) {
      value = (std::numeric_limits<size_t>::max)();
      break;
    }
    value = value * 10u + digit;
  }

  *out = value;
  return true;
}

static bool body_would_exceed_limit(size_t current_size, size_t chunk_size) {
  return chunk_size > REQUEST_BODY_MAX_BYTES ||
         current_size > REQUEST_BODY_MAX_BYTES - chunk_size;
}

static bool finish_pending_request(PendingRequest* pending) {
  if (pending->finished) return false;
  pending->finished = true;
  return true;
}

static void release_pending_request(PendingRequest* pending) {
  pending->roots.clear();
  std::string().swap(pending->body);
  collect_after_request();
}

static std::string_view lookup_status_line(i32 status) {
  switch (status) {
    case 100: return "100 Continue";
    case 101: return "101 Switching Protocols";
    case 201: return "201 Created";
    case 202: return "202 Accepted";
    case 204: return "204 No Content";
    case 301: return "301 Moved Permanently";
    case 302: return "302 Found";
    case 304: return "304 Not Modified";
    case 307: return "307 Temporary Redirect";
    case 308: return "308 Permanent Redirect";
    case 400: return "400 Bad Request";
    case 401: return "401 Unauthorized";
    case 403: return "403 Forbidden";
    case 404: return "404 Not Found";
    case 405: return "405 Method Not Allowed";
    case 408: return "408 Request Timeout";
    case 409: return "409 Conflict";
    case 413: return "413 Payload Too Large";
    case 429: return "429 Too Many Requests";
    case 500: return "500 Internal Server Error";
    case 501: return "501 Not Implemented";
    case 502: return "502 Bad Gateway";
    case 503: return "503 Service Unavailable";
    case 504: return "504 Gateway Timeout";
    default: return {};
  }
}

static bool is_forbidden_response_header(std::string_view key) {
  return key == "connection" ||
         key == "content-length" ||
         key == "transfer-encoding";
}

static void write_response_value(uWS::HttpResponse<false>* res, struct jsval response, bool* aborted) {
  struct NativeFetchResponseParts response_parts;
  porf_native_fetch_finalize_response(response.val, response.type, &response_parts);
  const i32 status = response_parts.status;
  const struct jsval body_value = response_parts.body;
  const i32 headers_entries_ptr = (i32)response_parts.headers.val;

  const char* body_buf = nullptr;
  size_t body_len = 0;
  char* body_owned = nullptr;
  porf_native_fetch_read_value(body_value, &body_buf, &body_len, &body_owned);

  if (!aborted || !*aborted) {
    res->cork([res, status, headers_entries_ptr, body_buf, body_len]() {
      if (status != 200) res->writeStatus(lookup_status_line(status));

      const i32 headers_len = *((i32*)(porf_mem + headers_entries_ptr)) / 2;
      const i32 headers_entries = *((i32*)(porf_mem + headers_entries_ptr + 4));
      for (i32 i = 0; i < headers_len; i++) {
        const i32 name_base = headers_entries + i * 16;
        const i32 value_base = name_base + 8;
        const struct jsval name_value = unpack_jsval(*((u64*)(porf_mem + name_base)));
        const struct jsval value_value = unpack_jsval(*((u64*)(porf_mem + value_base)));

        const char* name_buf = nullptr;
        size_t name_len = 0;
        char* name_owned = nullptr;
        const char* value_buf = nullptr;
        size_t value_len = 0;
        char* value_owned = nullptr;
        porf_native_fetch_read_value(name_value, &name_buf, &name_len, &name_owned);
        porf_native_fetch_read_value(value_value, &value_buf, &value_len, &value_owned);

        const std::string_view key(name_buf, name_len);
        if (!is_forbidden_response_header(key)) {
          res->writeHeader(key, std::string_view(value_buf, value_len));
        }

        if (name_owned) free(name_owned);
        if (value_owned) free(value_owned);
      }

      res->end(std::string_view(body_buf, body_len));
    });
  }

  if (body_owned) free(body_owned);
}

struct PendingResponse {
  uWS::HttpResponse<false>* res = nullptr;
  bool aborted = false;
  bool finished = false;
  u32 fulfill_reaction = 0;
  u32 reject_reaction = 0;
  NativeRequestRoots roots;
  NativeRoot body;

  PendingResponse(uWS::HttpResponse<false>* res, i32 url_ptr, i32 headers_ptr, i32 body_ptr) : res(res) {
    roots.reset(url_ptr, headers_ptr);
    if (body_ptr != 0) body.reset((f64)body_ptr, ${TYPES.bytestring});
  }

  void clear() {
    roots.clear();
    body.clear();
  }

  void cancel_reactions() {
    porf_native_fetch_cancel_response_reaction(fulfill_reaction);
    porf_native_fetch_cancel_response_reaction(reject_reaction);
    fulfill_reaction = 0;
    reject_reaction = 0;
  }
};

extern "C" void porf_native_fetch_response_complete(void* raw_pending, f64 value, i32 type, i32 is_reject) {
  auto* pending = (PendingResponse*)raw_pending;
  if (!pending || pending->finished) return;
  pending->finished = true;

  if (!pending->aborted && pending->res) {
    if (is_reject) {
      respond_with_error(pending->res, "500 Internal Server Error", "native fetch promise rejected", true);
    } else {
      write_response_value(pending->res, { value, type }, &pending->aborted);
    }
  }

  pending->clear();
  delete pending;
  collect_after_request();
}

static bool handle_request(uWS::HttpResponse<false>* res, i32 method_ptr, i32 url_ptr, i32 headers_ptr, std::string_view request_body, bool* aborted, NativeRequestRoots* roots) {
  if (aborted && *aborted) {
    if (roots) roots->clear();
    return true;
  }

  const i32 body_ptr = request_body.empty() ? 0 : (i32)porf_native_fetch_alloc_bytestring(request_body.data(), request_body.size());

  struct jsval response = porf_native_fetch_call_handler((f64)method_ptr, ${TYPES.bytestring}, (f64)url_ptr, ${TYPES.bytestring}, (f64)headers_ptr, ${TYPES.array}, (f64)body_ptr, ${TYPES.bytestring});
  porf_native_fetch_drain_microtasks();

  const int promise_state = porf_native_fetch_promise_state(response);
  if (promise_state != -1) {
    if (promise_state == 0) {
${Prefs.eventLoop ? `      auto* pending = new PendingResponse(res, url_ptr, headers_ptr, body_ptr);
      res->onAborted([pending]() {
        if (pending->finished || pending->aborted) return;
        pending->aborted = true;
        pending->res = nullptr;
        pending->cancel_reactions();
        pending->clear();
        delete pending;
        collect_after_request();
      });
      porf_native_fetch_attach_response(response, pending, &pending->fulfill_reaction, &pending->reject_reaction);
      return false;` : `      // event loop disabled (no --event-loop): cannot suspend across host turns
      respond_with_error(res, "500 Internal Server Error", "async response requires --event-loop", true);
      if (roots) roots->clear();
      return true;`}
    }

    if (promise_state == 2) {
      respond_with_error(res, "500 Internal Server Error", "native fetch promise rejected", true);
      if (roots) roots->clear();
      return true;
    }

    response = porf_native_fetch_promise_result(response);
  }

  write_response_value(res, response, aborted);
  if (roots) roots->clear();
  return true;
}

static void on_request(uWS::HttpResponse<false>* res, uWS::HttpRequest* req) {
  const std::string_view method = req->getCaseSensitiveMethod();
  const i32 method_ptr = get_method_ptr(method);
  if (method_ptr == 0) {
    respond_with_error(res, "400 Bad Request", "unsupported method", true);
    collect_after_request();
    return;
  }

  __porffor_js_enter();
  const i32 url_ptr = alloc_request_url(req);
  const i32 headers_ptr = collect_headers(req);

  const std::string_view content_length = req->getHeader("content-length");
  const std::string_view transfer_encoding = req->getHeader("transfer-encoding");
  size_t declared_content_length = 0;

  if (!content_length.empty() && !parse_content_length(content_length, &declared_content_length)) {
    __porffor_js_exit();
    respond_with_error(res, "400 Bad Request", "invalid content-length", true);
    collect_after_request();
    return;
  }

  if (transfer_encoding.empty() && declared_content_length == 0) {
    const bool completed = handle_request(res, method_ptr, url_ptr, headers_ptr, std::string_view(), nullptr, nullptr);
    __porffor_js_exit();
    if (completed) collect_after_request();
    return;
  }

  if (declared_content_length > REQUEST_BODY_MAX_BYTES || REQUEST_BODY_MAX_BYTES == 0) {
    __porffor_js_exit();
    respond_with_error(res, "413 Payload Too Large", "request body too large", true);
    collect_after_request();
    return;
  }

  auto pending = std::make_shared<PendingRequest>();
  pending->method_ptr = method_ptr;
  pending->url_ptr = url_ptr;
  pending->headers_ptr = headers_ptr;
  pending->roots.reset(url_ptr, headers_ptr);
  __porffor_js_exit();
  res->onAborted([pending]() {
    if (finish_pending_request(pending.get())) {
      pending->aborted = true;
      release_pending_request(pending.get());
    }
  });

  res->onData([res, pending](std::string_view chunk, bool is_last) {
    if (pending->finished) return;
    if (body_would_exceed_limit(pending->body.size(), chunk.size())) {
      finish_pending_request(pending.get());
      release_pending_request(pending.get());
      respond_with_error(res, "413 Payload Too Large", "request body too large", true);
      return;
    }

    pending->body.append(chunk.data(), chunk.size());
    if (is_last) {
      finish_pending_request(pending.get());
      __porffor_js_enter();
      const bool completed = handle_request(res, pending->method_ptr, pending->url_ptr, pending->headers_ptr, pending->body, &pending->aborted, &pending->roots);
      __porffor_js_exit();
      (void)completed;
      release_pending_request(pending.get());
    }
  });
}
${threads ? `
#define SERVER_THREADS_MAX 256

static uWS::App* server_apps[SERVER_THREADS_MAX];
static std::atomic<int> server_apps_ready{0};
static std::atomic<unsigned int> server_rr{0};
static std::mutex server_apps_mutex;

static LIBUS_SOCKET_DESCRIPTOR distribute_socket(struct us_socket_context_t* context, LIBUS_SOCKET_DESCRIPTOR fd) {
  (void)context;
  const int ready = server_apps_ready.load(std::memory_order_acquire);
  if (ready <= 0) return fd;

  uWS::App* receiver = server_apps[server_rr.fetch_add(1, std::memory_order_relaxed) % (unsigned int)ready];
  receiver->getLoop()->defer([receiver, fd]() {
    receiver->adoptSocket(fd);
  });
  return (LIBUS_SOCKET_DESCRIPTOR)-1;
}

static void serve(int port, int worker_index) {
  (void)worker_index;

  uWS::App app;
  app.any("/*", [](auto* res, auto* req) {
    on_request(res, req);
  }).preOpen(distribute_socket).listen(port, [port, worker_index](auto* token) {
    if (!token) {
      std::fprintf(stderr, "Failed to bind native fetch server (thread %d)\\n", worker_index);
      exit(1);
    }
  });

  {
    std::lock_guard<std::mutex> lock(server_apps_mutex);
    const int idx = server_apps_ready.load(std::memory_order_relaxed);
    server_apps[idx] = &app;
    server_apps_ready.store(idx + 1, std::memory_order_release);
  }

  app.run();
}

int main(void) {
  porf_native_fetch_runtime_init();
  porf_native_fetch_static_init();

  const int port = (int)porf_native_fetch_get_port();
  int n = ${parseInt(Prefs.threadsPool) || 0};
  if (n < 1) n = (int)std::thread::hardware_concurrency();
  if (n < 1) n = 1;
  if (n > SERVER_THREADS_MAX) n = SERVER_THREADS_MAX;

  std::fprintf(stderr, "Porffor native fetch server listening on http://127.0.0.1:%d (%d threads)\\n", port, n);

  std::vector<std::thread> workers;
  for (int i = 1; i < n; i++) workers.emplace_back(serve, port, i);
  serve(port, 0);
  for (auto& w : workers) w.join();
  return 0;
}` : `
int main(void) {
  porf_native_fetch_runtime_init();
  porf_native_fetch_static_init();

  const int port = (int)porf_native_fetch_get_port();
  bool listened = false;
  uWS::App().any("/*", [](auto* res, auto* req) {
    on_request(res, req);
  }).listen(port, [&listened, port](auto* token) {
    if (token) {
      listened = true;
      std::fprintf(stderr, "Porffor native fetch server listening on http://127.0.0.1:%d\\n", port);
    }
  }).run();

  if (!listened) {
    std::fprintf(stderr, "Failed to bind native fetch server\\n");
    return 1;
  }

  return 0;
}`}`;
