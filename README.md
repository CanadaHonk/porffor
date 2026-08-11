# Porffor &nbsp;<sup><sub>*(poor-for)*</sup></sub>
An ahead-of-time JavaScript compiler

```sh
curl -fsSL https://porffor.dev/install.sh | sh
```

<hr>

```
$ cat hello.js
console.log('hello world!');
$ porf hello.js hello
[105ms] compiled hello.js -> hello (33.7KB)
$ ./hello
hello world!
```

<br>

Porffor is a 100% AOT compiled JS engine/runtime. There is nothing interpreted or compiled just-in-time. Porffor compiles JS to C (with an IR inbetween). We chose this approach because:
- it can be used essentially everywhere
- is relatively easy to emit and compile
- it avoids directly depending on a backend like LLVM or Cranelift
- is easily modifiable post-compile for diverse environments

## Versioning
Porffor releases use a single increasing release number. Releases are automatically published every git push after CI testing.

## Name
`purple` in Welsh is `porffor`. Why purple?
- No other JS engine is purple colored
- Purple is pretty cool
- Purple apparently represents "ambition", which accurately describes this project :)
