(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RowProof = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const LIMITS = Object.freeze({ bytes: 1048576, rows: 5000, files: 5 });
  const HEADER = ['date', 'description', 'amount'];
  const MAX_AMOUNT_CENTS = 99999999999;
  class InputError extends Error { constructor(message) { super(message); this.name = 'InputError'; } }
  function fail(message) { throw new InputError(message); }

  // RFC 4180 field quoting, escaped quotes, and CRLF/LF/CR records. Physical line
  // positions and exact record text are retained independently of decoded fields.
  function parseCsv(input, maxRecords = LIMITS.rows + 1) {
    if (typeof input !== 'string') fail('CSV input must be text.');
    const text = input.replace(/^\uFEFF/, '');
    const records = [];
    let fields = [], field = '', state = 'start', line = 1, startLine = 1, start = 0, i = 0;
    function record(end) {
      const raw = text.slice(start, end);
      if (raw !== '') {
        records.push({ values: [...fields, field], startLine, endLine: line, raw });
        if (records.length > maxRecords) fail('Too many CSV records. Limit: ' + LIMITS.rows + ' data rows in total.');
      }
      fields = []; field = ''; state = 'start';
    }
    while (i < text.length) {
      const ch = text[i];
      if (state === 'quoted') {
        if (ch === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; }
          else { state = 'afterQuote'; i++; }
        } else if (ch === '\r' || ch === '\n') {
          const ending = ch === '\r' && text[i + 1] === '\n' ? '\r\n' : ch;
          field += ending; i += ending.length; line++;
        } else { field += ch; i++; }
        continue;
      }
      if (ch === ',') { fields.push(field); field = ''; state = 'start'; i++; continue; }
      if (ch === '\r' || ch === '\n') {
        record(i);
        i += ch === '\r' && text[i + 1] === '\n' ? 2 : 1;
        line++; startLine = line; start = i;
        continue;
      }
      if (state === 'afterQuote') fail('Unexpected text after a closing quote at physical line ' + line + '.');
      if (ch === '"') {
        if (state !== 'start') fail('A quote inside an unquoted field at physical line ' + line + ' must be escaped.');
        state = 'quoted'; i++; continue;
      }
      field += ch; state = 'unquoted'; i++;
    }
    if (state === 'quoted') fail('An unclosed quoted field starts in the record at physical line ' + startLine + '.');
    if (start < text.length) record(text.length);
    return records;
  }
  function parseAmount(raw) {
    if (typeof raw !== 'string') return null;
    const value = raw.trim();
    if (!/^-?\d{1,9}(?:\.\d{1,2})?$/.test(value)) return null;
    const negative = value.startsWith('-');
    const [whole, fraction = ''] = value.replace(/^-/, '').split('.');
    const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
    if (!Number.isSafeInteger(cents) || cents > MAX_AMOUNT_CENTS) return null;
    return cents === 0 ? 0 : negative ? -cents : cents;
  }
  function amountText(cents) {
    if (!Number.isSafeInteger(cents)) fail('Amount must be an integer number of cents.');
    const absolute = Math.abs(cents);
    return (cents < 0 ? '-' : '') + Math.floor(absolute / 100) + '.' + String(absolute % 100).padStart(2, '0');
  }
  function validDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number(value.slice(0, 4)) === 0) return false;
    const date = new Date(value + 'T00:00:00.000Z');
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }
  function analyzeSources(sources) {
    if (!Array.isArray(sources) || sources.length < 1 || sources.length > LIMITS.files) fail('Choose between 1 and 5 CSV files.');
    let bytes = 0;
    for (const source of sources) {
      if (!source || typeof source.name !== 'string' || !source.name.trim() || typeof source.text !== 'string') fail('Each source needs a filename and CSV text.');
      bytes += new TextEncoder().encode(source.text).length;
    }
    if (bytes > LIMITS.bytes) fail('Combined CSV content exceeds the 1 MiB limit.');
    const rows = [], sourceInfo = [];
    for (let fileIndex = 0; fileIndex < sources.length; fileIndex++) {
      const source = sources[fileIndex];
      let parsed;
      try { parsed = parseCsv(source.text); } catch (error) { fail(source.name + ': ' + error.message); }
      if (!parsed.length) fail(source.name + ': no CSV header found.');
      const header = parsed[0].values.map(value => value.trim().toLowerCase());
      if (header.length !== 3 || new Set(header).size !== 3 || HEADER.some(key => !header.includes(key))) {
        fail(source.name + ': header must contain exactly date, description, amount (in any order).');
      }
      const positions = Object.fromEntries(HEADER.map(key => [key, header.indexOf(key)]));
      sourceInfo.push({ name: source.name, rows: parsed.length - 1 });
      for (let index = 1; index < parsed.length; index++) {
        if (rows.length >= LIMITS.rows) fail('Combined files exceed the 5,000 data-row limit.');
        const record = parsed[index];
        const raw = Object.fromEntries(HEADER.map(key => [key, record.values[positions[key]] ?? '']));
        const value = Object.fromEntries(HEADER.map(key => [key, raw[key].trim()]));
        const issues = [];
        const issue = (code, message) => issues.push({ code, message });
        if (record.values.length !== 3) issue('COLUMN_COUNT', 'Expected 3 columns; found ' + record.values.length + '.');
        for (const key of HEADER) if (!value[key]) issue('MISSING_' + key.toUpperCase(), 'Required ' + key + ' is missing.');
        if (value.date && !validDate(value.date)) issue('INVALID_DATE', 'Date must be a real calendar date in YYYY-MM-DD format.');
        if (value.description.length > 500) issue('LONG_DESCRIPTION', 'Description exceeds 500 characters.');
        const cents = parseAmount(raw.amount);
        if (value.amount && cents === null) issue('INVALID_AMOUNT', 'Amount needs a decimal point, up to 2 decimals, and no currency symbol or grouping separator (maximum 999999999.99).');
        rows.push({ id: rows.length, source: source.name, sourceIndex: fileIndex, record: index,
          startLine: record.startLine, endLine: record.endLine, rawRecord: record.raw,
          raw, date: value.date, description: value.description, amountCents: cents,
          status: issues.length ? 'invalid' : 'clean', issues, duplicateGroup: null });
      }
    }
    const groups = new Map();
    for (const row of rows) if (row.status !== 'invalid') {
      const key = JSON.stringify([row.date, row.description, row.amountCents]);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }
    let duplicateGroups = 0;
    for (const group of groups.values()) if (group.length > 1) {
      const groupId = 'D' + String(++duplicateGroups).padStart(2, '0');
      for (const row of group) {
        row.status = 'review'; row.duplicateGroup = groupId;
        row.issues.push({ code: 'POSSIBLE_DUPLICATE', message: groupId + ': same date, trimmed description and amount in ' + group.length + ' rows. Retained; review before export.' });
      }
    }
    const summary = { total: rows.length, clean: 0, review: 0, invalid: 0, netCents: 0,
      excludedInvalid: 0, missingFields: 0, invalidAmounts: 0, duplicateGroups };
    for (const row of rows) {
      summary[row.status]++;
      if (row.status !== 'invalid') summary.netCents += row.amountCents;
      if (row.issues.some(issue => issue.code.startsWith('MISSING_'))) summary.missingFields++;
      if (row.issues.some(issue => issue.code === 'INVALID_AMOUNT')) summary.invalidAmounts++;
    }
    summary.excludedInvalid = summary.invalid;
    if (!Number.isSafeInteger(summary.netCents)) fail('Combined amount is outside safe integer limits.');
    return { version: 1, rows, sources: sourceInfo, bytes, summary };
  }
  // Only user-controlled text is neutralized. Typed numeric amounts are generated
  // from validated integer cents and remain numeric, including legitimate refunds.
  function safeText(value) {
    const text = String(value ?? '');
    return /^[\s\u0000-\u001f]*[=+\-@]/u.test(text) || /^[\t\r\n]/.test(text) ? "'" + text : text;
  }
  function csvCell(value) { return '"' + String(value ?? '').replace(/"/g, '""') + '"'; }
  function csvDocument(matrix) { return '\uFEFF' + matrix.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n'; }
  function exportClean(result) {
    return csvDocument([['date', 'description', 'amount', 'source', 'source_index', 'record', 'start_line', 'end_line'],
      ...result.rows.filter(row => row.status === 'clean').map(row => [row.date, safeText(row.description), amountText(row.amountCents),
        safeText(row.source), row.sourceIndex + 1, row.record, row.startLine, row.endLine])]);
  }
  function exportExceptions(result) {
    return csvDocument([['status', 'source', 'source_index', 'record', 'start_line', 'end_line', 'raw_date', 'raw_description', 'raw_amount', 'issues', 'duplicate_group', 'raw_record'],
      ...result.rows.filter(row => row.status !== 'clean').map(row => [row.status, safeText(row.source), row.sourceIndex + 1, row.record, row.startLine, row.endLine,
        safeText(row.raw.date), safeText(row.raw.description), safeText(row.raw.amount), safeText(row.issues.map(issue => issue.message).join(' | ')),
        row.duplicateGroup || '', safeText(row.rawRecord)])]);
  }
  function exportReport(result, synthetic = false) {
    return JSON.stringify({ product: 'Rowproof — independent concept', synthetic, processing: 'Local browser only; no accounting judgment or AI',
      policy: { categories: 'Clean, review and invalid are mutually exclusive. Nothing is deleted.',
        net: 'Integer-cent sum of clean and review rows. Invalid rows are excluded, never coerced to zero.',
        duplicate: 'Same valid date, trimmed case-sensitive description and amount; all candidate rows are retained.',
        csv: 'CSV text cells that resemble spreadsheet formulas receive an apostrophe prefix. Exact input remains in this JSON report.',
        blanks: 'Completely empty physical records are ignored; whitespace-only or comma-only records are validated as data.',
        unit: 'One user-supplied amount unit only; no currency inference or conversion.' },
      summary: result.summary, sources: result.sources, rows: result.rows }, null, 2);
  }
  const DEMO_SOURCES = Object.freeze([
    { name: 'studio-july-a.csv', text: 'date,description,amount\r\n2026-07-01,"Cloudharbor, Inc.",129.00\r\n2026-07-02,Northlight Office,48.60\r\n2026-07-03,Harbor Café,-8.60\r\n2026-07-04,Transit Pass,18.00\r\n2026-07-05,Paper & Thread,0.00\r\n2026-07-06,"Moss Studio\r\nJuly adjustment",39.95\r\n2026-07-32,Invalid date,12.00\r\n2026-07-07,Missing amount,\r\n2026-07-08,Unparsed currency,$24.00\r\n2026-07-09,Greenbasket Grocery,63.27\r\n2026-07-10,Familyflix,15.99\r\n2026-07-11,Beacon Hosting,12.00\r\n' },
    { name: 'studio-july-b.csv', text: '\uFEFFdate,description,amount\n2026-07-02,Northlight Office,48.60\n2026-07-11,Beacon Hosting,12.00\n2026-07-12,Desk lamp,64.99\n2026-07-13,Research tools,80.00\n2026-07-14,"=HYPERLINK(""https://example.invalid"",""Sample text"")",9.00\n2026-07-15,"Quote ""escaped"" example",15.75\n2026-07-16,Refund,-19.99\n,Missing date,33.00\n2026-07-17,,25.00\n2026-07-18,Too many decimals,12.345\n2026-07-19,Unicode café ☕,22.50\n2026-07-20,Fresh service,89.99\n' }
  ]);
  return { LIMITS, InputError, parseCsv, parseAmount, amountText, validDate, analyzeSources, safeText, exportClean, exportExceptions, exportReport, DEMO_SOURCES };
});
