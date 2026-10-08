// Tests for the one source lexer (lane GATE-8, 2026-10-08). The lexer answers "is this text code, a comment or a
// string?" for the fitness functions; every case below is a form the AUD-AT-4 register found a per-function regex
// getting wrong (a URL cut at //, a starred line of real code skipped as JSDoc, a marker inside a string).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifySource, viewSource, codeOnly, codeAndStrings, commentsOnly, stripComments, foldStringConcat, CODE, LIT, COM,
} from './source-lexer.mjs';

test('a URL in a string is not a comment; the trailing comment is', () => {
  const src = 'const u = "https://api.example.com/v1"; // trailing note';
  assert.equal(codeAndStrings(src).includes('https://api.example.com/v1'), true);
  assert.equal(codeAndStrings(src).includes('trailing note'), false);
  assert.equal(commentsOnly(src).trim(), '// trailing note');
});

test('indexes and line numbers stay aligned: every view is the same length with the same newlines', () => {
  const src = 'a // c1\n/* c2\n c3 */ b "s"\n`t${x}u`';
  for (const view of [codeOnly(src), codeAndStrings(src), commentsOnly(src), stripComments(src)]) {
    assert.equal(view.length, src.length);
    assert.equal(view.split('\n').length, src.split('\n').length);
  }
});

test('a line that starts with an asterisk is code unless a block comment is open', () => {
  assert.equal(codeOnly('total = a\n  * b;').includes('* b'), true);
  assert.equal(codeOnly('/**\n * documented\n */\nx = 1;').includes('documented'), false);
});

test('comment openers inside strings and template literals are not comments', () => {
  const src = 'const a = "/* not a comment */"; const b = `// nor this ${1 + 1}`; const c = 1;';
  assert.equal(codeAndStrings(src).includes('not a comment'), true);
  assert.equal(codeAndStrings(src).includes('nor this'), true);
  assert.equal(commentsOnly(src).trim(), '');
  assert.equal(codeOnly(src).includes('const c = 1'), true);
});

test('template interpolation is code, template text is a literal, nesting works', () => {
  const src = 'x = `a ${f(`b ${g("q")}`)} c`;';
  const code = codeOnly(src);
  assert.equal(code.includes('f('), true);
  assert.equal(code.includes('g('), true);
  assert.equal(code.includes('a '), false);
  assert.equal(code.endsWith('`;'), true);
});

test('a regex literal body is not code; a division is not a regex', () => {
  const re = codeOnly('const r = /ab[/]c/g.test(x);');
  assert.equal(re.includes('ab'), false);
  assert.equal(re.includes('.test(x)'), true);
  const div = codeOnly('const q = a / b / c; // note');
  assert.equal(div.includes('a / b / c'), true);
});

test('classifySource marks delimiters as code and content as literal', () => {
  const cls = classifySource('f("ab")');
  assert.equal(cls[2], CODE); // the opening quote
  assert.equal(cls[3], LIT);
  assert.equal(cls[4], LIT);
  assert.equal(cls[5], CODE); // the closing quote
  assert.equal(classifySource('// x')[0], COM);
});

test('escapes inside a string do not end it early; an unterminated string stops at the newline', () => {
  const src = 'a = "he said \\"hi\\" // still string";\nb = 1;';
  assert.equal(codeAndStrings(src).includes('still string'), true);
  assert.equal(codeOnly(src).includes('b = 1'), true);
  assert.equal(codeOnly('a = "open\nb = 2;').includes('b = 2'), true);
});

test('viewSource keeps only the classes asked for', () => {
  const src = 'a("s") // c';
  assert.equal(viewSource(src, [COM]).trim(), '// c');
  assert.equal(viewSource(src, [LIT]).replace(/\s/g, ''), 's');
});

test('foldStringConcat joins adjacent literals across quote styles and lines, keeping the line count', () => {
  assert.equal(foldStringConcat("h = 'a' + \"b\" + 'c';"), "h = 'abc';");
  const folded = foldStringConcat('h = "api." +\n "anthropic.com";\nz');
  assert.equal(folded.includes('"api.anthropic.com"'), true);
  assert.equal(folded.split('\n').length, 'h = "api." +\n "anthropic.com";\nz'.split('\n').length);
  assert.equal(foldStringConcat('x = a + "b" + c;'), 'x = a + "b" + c;', 'a non-literal operand is left alone');
});
