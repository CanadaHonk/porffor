// host-provided globals (what a shell like d8/jsshell provides), prepended to every
// test. the actual test262 harness comes verbatim from test262/harness (upstream).
var print = console.log;

var $262 = {
  // AbstractModuleSource: function AbstractModuleSource() {},
  createRealm() {
    return $262;
  },
  detachArrayBuffer(buffer) {
    return Porffor.arraybuffer.detach(buffer);
  },
  evalScript(sourceText) {
    return eval(sourceText);
  },
  gc() {
    Porffor.gc();
  },
  // global: globalThis,
  // IsHTMLDDA() {
  //   return null;
  // },
  get agent() {
    throw new Error('$262.agent is unsupported');
    return null;
  }
};
