'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('./dist/core.js');
const source = text => [{ name: 'test.csv', text }];

test('RFC 4180 decoding preserves quoted commas, escaped quotes and physical line spans', () => {
  const rows = C.parseCsv('\uFEFFdate,description,amount\r\n2026-02-01,"A, B ""quoted""\r\nnext line",12.30\r\n\r\n2026-02-02,Plain,0\r\n');
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[1].values, ['2026-02-01', 'A, B "quoted"\r\nnext line', '12.30']);
  assert.equal(rows[1].startLine, 2); assert.equal(rows[1].endLine, 3);
  assert.equal(rows[2].startLine, 5);
  assert.equal(rows[1].raw, '2026-02-01,"A, B ""quoted""\r\nnext line",12.30');
});
test('malformed quoting rejects the source rather than silently changing fields', () => {
  for (const text of ['a,b\n"unclosed,x', 'a,b\npart"quote,x', 'a,b\n"closed"junk,x']) assert.throws(() => C.parseCsv(text), C.InputError);
});
test('integer-cent amounts distinguish valid zero, refunds and malformed values', () => {
  assert.equal(C.parseAmount('0'), 0); assert.equal(C.parseAmount('-0.00'), 0);
  assert.equal(C.parseAmount(' 12.3 '), 1230); assert.equal(C.parseAmount('-8.60'), -860);
  assert.equal(C.parseAmount('999999999.99'), 99999999999);
  for (const value of ['', ' ', '1e3', 'Infinity', 'NaN', '$5.00', '1,000.00', '12.345', '1000000000.00', '+12.00']) assert.equal(C.parseAmount(value), null, value);
  assert.equal(C.amountText(-860), '-8.60');
});
test('invalid records are not duplicates or zero-valued entries in the valid net', () => {
  const result = C.analyzeSources(source('date,description,amount\n2026-01-01,A,0.10\n2026-01-02,B,0.20\n2026-01-03,Refund,-0.05\n2026-02-30,Invalid date,100.00\n2026-01-04,Invalid amount,nope\n2026-01-04,Invalid amount,nope\n,Missing,3.00\n,,\n'));
  assert.deepEqual(result.summary, { total: 8, clean: 3, review: 0, invalid: 5, netCents: 25, excludedInvalid: 5, missingFields: 2, invalidAmounts: 2, duplicateGroups: 0 });
  assert.equal(result.rows[4].amountCents, null);
  assert.equal(result.rows[3].amountCents, 10000);
  assert.equal(result.rows[3].status, 'invalid');
});
test('duplicate candidates are retained across files; normalized amount and trimmed description match', () => {
  const result = C.analyzeSources([{ name: 'a.csv', text: 'date,description,amount\n2026-01-01, A ,1.0\n2026-01-01,a,1\n' },
    { name: 'b.csv', text: 'amount,date,description\n1.00,2026-01-01,A\n' }]);
  assert.equal(result.summary.total, 3); assert.equal(result.summary.clean, 1); assert.equal(result.summary.review, 2); assert.equal(result.summary.invalid, 0);
  assert.equal(result.summary.netCents, 300); assert.equal(result.summary.duplicateGroups, 1);
  assert.equal(result.rows[0].duplicateGroup, result.rows[2].duplicateGroup);
  assert.equal(C.parseCsv(C.exportClean(result)).length, 2);
  assert.equal(C.parseCsv(C.exportExceptions(result)).length, 3);
});
test('clean CSV neutralizes formula-like text without corrupting legitimate numeric refunds', () => {
  const result = C.analyzeSources([{ name: '=source.csv', text: 'date,description,amount\n2026-01-01,=SUM(A1:A2),-8.60\n2026-01-02,  +cmd,0\n2026-01-03,@name,1\n2026-01-04,-not a number,2\n' }]);
  const exported = C.parseCsv(C.exportClean(result));
  assert.equal(exported[1].values[1], "'=SUM(A1:A2)"); assert.equal(exported[1].values[2], '-8.60');
  assert.equal(exported[1].values[3], "'=source.csv");
  assert.equal(exported[2].values[1], "'+cmd"); assert.equal(exported[3].values[1], "'@name"); assert.equal(exported[4].values[1], "'-not a number");
  assert.equal(C.safeText('\t=cmd'), "'\t=cmd");
  const report = JSON.parse(C.exportReport(result));
  assert.equal(report.rows[0].raw.description, '=SUM(A1:A2)');
  assert.equal(report.rows[0].source, '=source.csv');
});
test('exception CSV protects raw amount formulas while JSON retains exact evidence', () => {
  const result = C.analyzeSources(source('date,description,amount\n2026-01-01,Unsafe,=1+1\n'));
  const output = C.parseCsv(C.exportExceptions(result));
  assert.equal(output[1].values[8], "'=1+1");
  assert.equal(JSON.parse(C.exportReport(result)).rows[0].raw.amount, '=1+1');
  assert.equal(result.summary.netCents, 0); assert.equal(result.summary.invalid, 1);
});
test('headers, extra columns, empty files, row and byte bounds are enforced', () => {
  assert.throws(() => C.analyzeSources(source('')), /header/);
  assert.throws(() => C.analyzeSources(source('date,date,amount\n2026-01-01,A,1')), /header/);
  assert.throws(() => C.analyzeSources(source('date,description,amount,extra\n')), /header/);
  const extra = C.analyzeSources(source('date,description,amount\n2026-01-01,A,1,extra\n'));
  assert.equal(extra.summary.invalid, 1); assert.equal(extra.rows[0].issues[0].code, 'COLUMN_COUNT');
  assert.throws(() => C.analyzeSources(source('date,description,amount\n' + '2026-01-01,A,1\n'.repeat(5001))), /records|row/);
  assert.throws(() => C.analyzeSources(source('date,description,amount\n' + 'é'.repeat(524288))), /1 MiB/);
  assert.throws(() => C.analyzeSources(Array.from({ length: 6 }, () => ({ name: 'x.csv', text: 'date,description,amount\n' }))), /between 1 and 5/);
});
test('valid empty datasets export headers; comma-only and quoted-empty records remain invalid data', () => {
  const empty = C.analyzeSources(source('date,description,amount\n\n'));
  assert.equal(empty.summary.total, 0); assert.equal(C.parseCsv(C.exportClean(empty)).length, 1);
  const blank = C.analyzeSources(source('date,description,amount\n,,\n"",,""\n'));
  assert.equal(blank.summary.total, 2); assert.equal(blank.summary.invalid, 2);
});
test('synthetic fixture count, source positions, exact net and export separation reconcile', () => {
  const result = C.analyzeSources(C.DEMO_SOURCES);
  assert.equal(result.summary.total, 24); assert.equal(result.summary.clean, 14); assert.equal(result.summary.review, 4); assert.equal(result.summary.invalid, 6);
  assert.equal(result.summary.clean + result.summary.review + result.summary.invalid, result.summary.total);
  // Independently added source amounts: A = 318.21, B = 322.84.
  assert.equal(result.summary.netCents, 64105);
  assert.equal(result.rows[5].startLine, 7); assert.equal(result.rows[5].endLine, 8);
  assert.equal(C.parseCsv(C.exportClean(result)).length - 1, 14);
  assert.equal(C.parseCsv(C.exportExceptions(result)).length - 1, 10);
  const report = JSON.parse(C.exportReport(result, true)); assert.equal(report.synthetic, true); assert.equal(report.rows.length, 24);
});
