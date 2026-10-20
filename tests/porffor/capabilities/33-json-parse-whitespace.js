// Regression coverage for JSON.parse whitespace before empty containers close.
// Run with: node runtime/index.js tests/porffor/capabilities/33-json-parse-whitespace.js

const emptyArray = JSON.parse('[ ]');
if (!Array.isArray(emptyArray) || emptyArray.length !== 0) {
  throw new Error("JSON.parse('[ ]') should return an empty array");
}

const whitespaceArray = JSON.parse('[ \t\r\n ]');
if (!Array.isArray(whitespaceArray) || whitespaceArray.length !== 0) {
  throw new Error('JSON.parse with JSON whitespace in an empty array should return an empty array');
}

const emptyObject = JSON.parse('{ }');
if (Object.keys(emptyObject).length !== 0) {
  throw new Error("JSON.parse('{ }') should return an empty object");
}

const whitespaceObject = JSON.parse('{ \t\r\n }');
if (Object.keys(whitespaceObject).length !== 0) {
  throw new Error('JSON.parse with JSON whitespace in an empty object should return an empty object');
}
