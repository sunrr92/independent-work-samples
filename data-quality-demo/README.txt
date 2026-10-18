ROWPROOF — CSV EXCEPTION REVIEW DESK
Original, independent concept work. Fictional studio names and sample transactions.
Not a past client engagement, earned income, accounting decision, or an AI service.

OPEN
Open dist/index.html directly in a current browser. No build, installation, package,
account, API, external font, image or network connection is required. Keep core.js
and app.js beside index.html. The initial data consists of two synthetic CSV files.

INPUT CONTRACT
Import 1–5 UTF-8 .csv files, 1 MiB combined, at most 5,000 data records in total.
Required header: date,description,amount (case-insensitive; any column order).
Exactly three columns are required. Dates: real YYYY-MM-DD calendar dates.
Amounts: optional minus, 1–9 whole-number digits, optional dot and 1–2 decimals.
No currency symbols, grouping separators, exponents, conversion or inferred units.
Descriptions: nonempty, at most 500 characters. Leading/trailing spaces are trimmed
for validation and duplicate matching, while exact original fields are preserved.
RFC 4180 quoted commas, escaped quotes and multiline fields are supported, as are
CRLF/LF/CR records and a leading UTF-8 BOM. Completely empty physical records are
ignored; comma-only, whitespace-only and quoted-empty records are validated.
Malformed quoting or a wrong header rejects the entire import; prior data remains.

RULES / EXPORTS
- Each record is clean, review or invalid, with mutually exclusive counts.
- Valid net is an integer-cent sum of clean AND review rows. Invalid records are
  excluded, never converted to zero. A valid amount of 0 is distinct from invalid.
- Possible duplicates have the same valid date, trimmed case-sensitive description
  and integer amount. All candidates remain, including across source files.
- Clean CSV contains only clean rows, with source filename, index and original positions.
- Exceptions CSV contains every review/invalid row with reasons and source details.
- JSON report contains every original record, raw field, line span, reason and total.
- CSV text that may start a spreadsheet formula is prefixed with an apostrophe.
  Validated numeric amounts remain numeric, including negative refunds. Exact input
  is retained in JSON. An exported CSV is an intentionally protected representation.
- Filters/search affect only the view. Exports always use the entire current dataset.
- No automatic corrections, deletion, deduplication or accounting classification.

PRIVACY / SCOPE
Files are read in this tab's memory. No upload, storage, telemetry, localStorage,
server, model, analytics or external resources. Reloading clears imported data.
Exports are ordinary browser downloads. File names and data are user-controlled.
This is a bounded local data-quality demonstration, not a general financial system.
No persistent project, XLSX/PDF import, arbitrary schema mapping or live API exists.
Keyboard controls are native buttons/inputs; narrow screens use stacked inspection.

CORE VERIFICATION
With an existing Node.js 18+ runtime, run from this directory:
  node --test core.test.cjs
Tests execute the SAME core.js used in the browser: quoting/line positions, malformed
input, missing/invalid fields, duplicate handling, integer cents, injection-safe CSV,
unmodified JSON evidence, file/row limits and independent fixture totals.
Browser acceptance passed on desktop and at a 390px mobile breakpoint. A separate
seven-record file imported as 3 clean + 2 review + 2 invalid, valid net 22.10.
The three actual browser downloads were inspected; malformed import preserved the
previous dataset. The public HTTPS demonstration was also loaded and checked.

Files: dist/index.html, dist/core.js, dist/app.js, core.test.cjs, README.txt.
Static demonstration: open locally or through the public technical portfolio.
No account, purchase, Sites registration or connected processing service is required.
