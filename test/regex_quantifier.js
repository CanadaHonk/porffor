// "1110111111"
print(/a?/.test("a"))
print(/a?/.test(""))
print(/a?/.test("b"))

print(/a+/.test("b"))
print(/a+/.test("a"))
print(/a+/.test("aaaaaaa"))
// print(/a+/.test(""))

print(/a*/.test("a"))
print(/a*/.test("aaaaaaa"))
// print(/a*/.test(""))

print(/[ab]+/.test("abababa"))
print(/[a-c]+/.test("abcabc"))