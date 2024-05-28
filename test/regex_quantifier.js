// "1110111111"
console.log("\n?")
print(/a?/.test("a"))
print(/a?/.test(""))
print(/a?/.test("b"))

console.log("\n+")
print(/a+/.test("b"))
print(/a+/.test("a"))
print(/a+/.test("aaaaaaa"))
// print(/a+/.test(""))

console.log("\n*")
print(/a*/.test("a"))
print(/a*/.test("aaaaaaa"))
print(/a*/.test(""))

console.log("\nset")
print(/[ab]+/.test("abababa"))

console.log("\nset+")
print(/[ab]+/.test("abababa"))
print(/[a-c]+/.test("abcabc"))