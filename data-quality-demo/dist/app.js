(function () {
  'use strict';
  const C = window.RowProof, $ = id => document.getElementById(id);
  const pageSize = 50;
  let result, synthetic = true, filter = 'all', query = '', page = 0, selected = null, loading = false;
  const statusName = status => status.charAt(0).toUpperCase() + status.slice(1);
  function text(id, value) { $(id).textContent = value; }
  function feedback(message, error = false) { text('feedback', message); $('feedback').classList.toggle('error', error); }
  function amount(cents) { const [whole, fraction] = C.amountText(cents).split('.'); return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + fraction; }
  function matching() {
    return result.rows.filter(row => (filter === 'all' || row.status === filter) && (!query ||
      [row.description, row.source, row.date, row.raw.amount, ...row.issues.map(issue => issue.message)].some(value => value.toLowerCase().includes(query))));
  }
  function element(tag, className, value) {
    const el = document.createElement(tag); if (className) el.className = className;
    if (value !== undefined) el.textContent = value; return el;
  }
  function inspect(row) {
    selected = row ? row.id : null;
    for (const tr of $('rows').querySelectorAll('tr[data-row]')) tr.setAttribute('aria-selected', String(Number(tr.dataset.row) === selected));
    $('inspect-issues').replaceChildren(); $('inspect-details').replaceChildren();
    if (!row) {
      text('record-id', '—'); text('inspect-title', 'No matching record'); text('inspect-summary', 'Try another filter or clear the search.');
      text('raw-record', '—'); text('line-label', '—'); $('inspect-badge').hidden = true;
      text('inspect-note', 'The dataset and exports are unchanged by filtering.'); return;
    }
    $('inspect-badge').hidden = false; $('inspect-badge').className = 'badge ' + row.status;
    text('inspect-badge', statusName(row.status)); text('record-id', 'RECORD ' + String(row.id + 1).padStart(2, '0'));
    text('inspect-title', row.description || 'Missing description');
    text('inspect-summary', row.status === 'invalid' ? 'This row is excluded from the valid net and clean export.' : row.status === 'review' ? 'Valid fields, but the possible duplicate needs a decision. Still included in the valid net.' : 'All required fields are valid. This row is included in the clean export.');
    const issues = row.issues.length ? row.issues : [{ message: 'No format or duplicate issues found. The original text is retained.' }];
    for (const issue of issues) $('inspect-issues').append(element('li', row.status, issue.message));
    const entries = [['Source', '#' + (row.sourceIndex + 1) + ' / ' + row.source], ['Record', row.record + ' in source'], ['Date', row.raw.date || '(empty)'],
      ['Amount', row.amountCents === null ? 'Not parsed — invalid' : C.amountText(row.amountCents)], ['Group', row.duplicateGroup || '—']];
    for (const [label, value] of entries) $('inspect-details').append(element('dt', '', label), element('dd', '', value));
    text('raw-record', row.rawRecord); text('line-label', row.startLine === row.endLine ? 'line ' + row.startLine : 'lines ' + row.startLine + '–' + row.endLine);
    text('inspect-note', 'Exact original record, before trimming or CSV formula protection. All rows remain in the JSON report.');
  }
  function renderRows(resetSelection = false) {
    const matched = matching(); const totalPages = Math.max(1, Math.ceil(matched.length / pageSize));
    page = Math.min(page, totalPages - 1);
    const visible = matched.slice(page * pageSize, (page + 1) * pageSize);
    $('rows').replaceChildren();
    for (const row of visible) {
      const tr = element('tr'); tr.dataset.row = String(row.id); tr.setAttribute('aria-selected', 'false');
      const titleCell = element('td', 'col-record');
      const button = element('button', 'row-title', row.description || '(missing description)'); button.type = 'button';
      button.setAttribute('aria-label', 'Inspect record ' + (row.id + 1) + ': ' + (row.description || 'missing description'));
      titleCell.append(button, element('span', 'row-origin', row.source + ' · record ' + row.record + ' · ' + (row.startLine === row.endLine ? 'line ' + row.startLine : 'lines ' + row.startLine + '–' + row.endLine)));
      const dateCell = element('td', 'col-date row-date', row.date || '—');
      const amountCell = element('td', 'col-amount row-amount' + (row.amountCents === null ? ' invalid' : ''), row.amountCents === null ? 'Not parsed' : amount(row.amountCents));
      const stateCell = element('td', 'col-state'); stateCell.append(element('span', 'badge ' + row.status, statusName(row.status)));
      tr.append(titleCell, dateCell, amountCell, stateCell); $('rows').append(tr);
    }
    if (!visible.length) { const tr = element('tr'); const td = element('td', 'empty-row', 'No rows match this view.'); td.colSpan = 4; tr.append(td); $('rows').append(tr); }
    text('visible-count', matched.length ? ((page * pageSize + 1) + '–' + Math.min((page + 1) * pageSize, matched.length) + ' of ' + matched.length + ' matching rows') : '0 matching rows');
    text('page-count', (page + 1) + ' / ' + totalPages); $('prev-page').disabled = page === 0; $('next-page').disabled = page >= totalPages - 1;
    const row = !resetSelection && visible.find(item => item.id === selected) || visible.find(item => item.status === 'invalid') || visible[0];
    inspect(row || null);
  }
  function renderDataset() {
    const s = result.summary;
    text('total-count', s.total.toLocaleString('en-US')); text('source-count', result.sources.length + ' source file' + (result.sources.length === 1 ? '' : 's'));
    for (const state of ['clean', 'review', 'invalid']) { text(state + '-count', s[state].toLocaleString('en-US')); text('filter-' + state, s[state]); }
    text('filter-all', s.total); text('net-amount', amount(s.netCents));
    text('net-note', 'Clean + review. ' + s.invalid + ' invalid excluded. One amount unit; no conversion.');
    text('dataset-label', synthetic ? 'SYNTHETIC SAMPLE' : 'LOCAL IMPORT');
    text('export-clean-label', 'Export ' + s.clean + ' clean rows');
    $('export-clean').disabled = s.clean === 0; $('export-exceptions').disabled = s.review + s.invalid === 0;
    text('export-copy', s.clean + ' clean + ' + s.review + ' review + ' + s.invalid + ' invalid = ' + s.total + ' original records. Exports include the whole dataset, not just this filtered view.');
    for (const button of document.querySelectorAll('[data-filter]')) button.setAttribute('aria-pressed', String(button.dataset.filter === filter));
    renderRows(true);
  }
  function setDataset(next, isSynthetic) {
    result = next; synthetic = isSynthetic; filter = 'all'; query = ''; page = 0; selected = null; $('search').value = ''; renderDataset();
  }
  function resetDemo() {
    setDataset(C.analyzeSources(C.DEMO_SOURCES), true);
    feedback('Fictional studio exports loaded — try an invalid row, a duplicate, or an export. Nothing was uploaded.');
  }
  async function importFiles(list) {
    if (loading || !list.length) return;
    const files = Array.from(list);
    if (files.length > C.LIMITS.files) { feedback('Import rejected: choose at most 5 CSV files. Current data is unchanged.', true); return; }
    if (files.some(file => !/\.csv$/i.test(file.name))) { feedback('Import rejected: only .csv files are accepted. Current data is unchanged.', true); return; }
    if (files.reduce((sum, file) => sum + file.size, 0) > C.LIMITS.bytes) { feedback('Import rejected: combined files exceed 1 MiB. Current data is unchanged.', true); return; }
    loading = true; $('choose-files').disabled = true; $('load-demo').disabled = true; feedback('Reading CSV files on your device…');
    try {
      const sources = await Promise.all(files.map(async file => {
        const bytes = new Uint8Array(await file.arrayBuffer());
        let text; try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
        catch { throw new C.InputError(file.name + ': file is not valid UTF-8. Export it as UTF-8 CSV first.'); }
        return { name: file.name, text };
      }));
      const next = C.analyzeSources(sources); setDataset(next, false);
      feedback('Imported ' + next.summary.total + ' records locally. ' + next.summary.missingFields + ' rows have missing fields; ' + next.summary.invalidAmounts + ' have malformed amounts. No rows deleted.');
    } catch (error) { feedback('Import rejected: ' + error.message + ' Current data is unchanged.', true); }
    finally { loading = false; $('choose-files').disabled = false; $('load-demo').disabled = false; $('csv-files').value = ''; }
  }
  function download(content, name, type) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; document.body.append(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    feedback(name + ' prepared locally. CSV text cells are formula-protected; exact originals remain in the JSON report.');
  }
  $('choose-files').addEventListener('click', () => $('csv-files').click());
  $('csv-files').addEventListener('change', event => importFiles(event.target.files));
  $('load-demo').addEventListener('click', resetDemo);
  $('search').addEventListener('input', event => { query = event.target.value.trim().toLowerCase(); page = 0; renderRows(true); });
  for (const button of document.querySelectorAll('[data-filter]')) button.addEventListener('click', () => {
    filter = button.dataset.filter; page = 0;
    for (const other of document.querySelectorAll('[data-filter]')) other.setAttribute('aria-pressed', String(other === button));
    renderRows(true);
  });
  $('rows').addEventListener('click', event => { const tr = event.target.closest('tr[data-row]'); if (tr) inspect(result.rows[Number(tr.dataset.row)]); });
  $('prev-page').addEventListener('click', () => { page--; renderRows(true); $('table-scroll').scrollTop = 0; });
  $('next-page').addEventListener('click', () => { page++; renderRows(true); $('table-scroll').scrollTop = 0; });
  $('export-clean').addEventListener('click', () => download(C.exportClean(result), 'rowproof-clean.csv', 'text/csv;charset=utf-8'));
  $('export-exceptions').addEventListener('click', () => download(C.exportExceptions(result), 'rowproof-exceptions.csv', 'text/csv;charset=utf-8'));
  $('export-report').addEventListener('click', () => download(C.exportReport(result, synthetic), 'rowproof-report.json', 'application/json;charset=utf-8'));
  const dropZone = $('drop-zone');
  for (const type of ['dragenter', 'dragover']) dropZone.addEventListener(type, event => { event.preventDefault(); dropZone.classList.add('dragging'); });
  dropZone.addEventListener('dragleave', event => { if (!dropZone.contains(event.relatedTarget)) dropZone.classList.remove('dragging'); });
  dropZone.addEventListener('drop', event => { event.preventDefault(); dropZone.classList.remove('dragging'); importFiles(event.dataTransfer.files); });
  // Prevent a stray dropped file from navigating away from the local review desk.
  window.addEventListener('dragover', event => event.preventDefault());
  window.addEventListener('drop', event => event.preventDefault());
  resetDemo();
})();
