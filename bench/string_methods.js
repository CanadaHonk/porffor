const str = 'The quick brown fox jumps over the lazy dog'
const iterations = 8000

const argsMap = {
  // anchor: ['section'],
  // at: [1],
  // big: [],
  // blink: [],
  // bold: [],
  // charAt: [1],
  // charCodeAt: [1],
  // codePointAt: [1],
  // concat: [' and another string'],
  // endsWith: ['dog'],
  // fixed: [],
  // fontcolor: ['red'],
  // fontsize: ['16'],
  // includes: ['fox'],
  // indexOf: ['o'],
  // isWellFormed: [],
  // italics: [],
  // lastIndexOf: ['o'],
  // link: ['https://example.com'],
  // localeCompare: ['zoo'],
  // match: ['o'],
  // matchAll: ['o'],
  // normalize: ['NFC'],
  // padEnd: [60, '.'],
  // padStart: [60, '.'],
  // repeat: [3],
  // replace: ['fox', 'cat'],
  // replaceAll: ['o', '0'],
  // search: ['fox'],
  // slice: [4, 9],
  // small: [],
  // split: [' '],
  // startsWith: ['The'],
  // strike: [],
  // sub: [],
  // substr: [4, 5],
  // substring: [4, 9],
  // sup: [],
  // toLocaleLowerCase: [],
  // toLocaleUpperCase: [],
  // toLowerCase: [],
  // toString: [],
  // toUpperCase: [],
  // toWellFormed: [],
  // trim: [],
  // trimEnd: [],
  // trimLeft: [],
  // trimRight: [],
  // trimStart: [],
  // valueOf: []
  toUpperCase: [],
  toLowerCase: [],
  // substr: [4, 5],
  // slice: [4, 9],
  // substring: [4, 9],
  // trim: [],
  // trimStart: [],
  // trimEnd: [],
  // repeat: [3],
  // toWellFormed: []
}

const methods = Object.keys(argsMap)

for (const method of methods) {
  const label = `String.prototype.${method}`
  const args = argsMap[method] || []
  const fn = String.prototype[method]

  console.time(label)
  for (let i = 0; i < iterations; i++) {
    fn.apply(str, args)
  }
  console.timeEnd(label)
}
