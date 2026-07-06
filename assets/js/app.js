const state = {
  rows: Array.isArray(window.PENAL_CODE_DATA) ? window.PENAL_CODE_DATA : [],
  selection: new Map(),
  filters: { q: '', type: 'all', category: 'all', sort: 'default' }
};

const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1472728568860774695/US-d5yD6Emhn9i0XftlQ5qMAyzVlc5asRaONkmuk-vOYQKvXYICESSgU8T3xecbxL3P4';

const el = {
  datasetStatus: document.querySelector('#datasetStatus'), resultCount: document.querySelector('#resultCount'), searchInput: document.querySelector('#searchInput'), typeFilter: document.querySelector('#typeFilter'), categoryFilter: document.querySelector('#categoryFilter'), sortFilter: document.querySelector('#sortFilter'), resetFilters: document.querySelector('#resetFilters'), quickTabs: document.querySelector('#quickTabs'), penalTable: document.querySelector('#penalTable'), selectionMeta: document.querySelector('#selectionMeta'), selectedCount: document.querySelector('#selectedCount'), totalFine: document.querySelector('#totalFine'), totalJail: document.querySelector('#totalJail'), selectionList: document.querySelector('#selectionList'), clearSelection: document.querySelector('#clearSelection'), rpAgents: document.querySelector('#rpAgents'), rpAddress: document.querySelector('#rpAddress'), rpSuspect: document.querySelector('#rpSuspect'), rpWriter: document.querySelector('#rpWriter'), rpStory: document.querySelector('#rpStory'), reportOutput: document.querySelector('#reportOutput'), copyReport: document.querySelector('#copyReport'), downloadReport: document.querySelector('#downloadReport'), sendDiscord: document.querySelector('#sendDiscord'), toast: document.querySelector('#toast')
};

const moneyFormatter = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const collator = new Intl.Collator('fr', { sensitivity: 'base' });

function normalizeText(value) { return String(value || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
function formatMoney(value) { return moneyFormatter.format(Number(value) || 0) + ' $'; }
function cleanDisplay(value, fallback = '-') { const text = String(value ?? '').trim(); return text && text.toLowerCase() !== 'nan' ? text : fallback; }
function rowKey(row) { return String(row.id); }
function selectedRows() { return Array.from(state.selection.values()); }

function init() {
  el.datasetStatus.textContent = state.rows.length + ' entrees chargees';
  buildFilterOptions(); buildQuickTabs(); bindEvents(); restoreFiltersFromHash(); render();
}

function buildFilterOptions() {
  const types = [...new Set(state.rows.map(row => row.type).filter(Boolean))].sort(collator.compare);
  const categories = [...new Set(state.rows.map(row => row.categorie))].sort((a, b) => Number(a) - Number(b));
  fillSelect(el.typeFilter, [['all', 'Tous les types'], ...types.map(type => [type, type])]);
  fillSelect(el.categoryFilter, [['all', 'Toutes'], ...categories.map(cat => [String(cat), 'Categorie ' + cat])]);
}
function fillSelect(select, options) { select.innerHTML = options.map(([value, label]) => '<option value="' + escapeAttr(value) + '">' + escapeHtml(label) + '</option>').join(''); }
function buildQuickTabs() { const categories = ['all', ...new Set(state.rows.map(row => String(row.categorie)))]; el.quickTabs.innerHTML = categories.map(category => '<button type="button" data-category="' + category + '">' + (category === 'all' ? 'Toutes' : 'Cat. ' + category) + '</button>').join(''); }

function bindEvents() {
  [el.searchInput, el.typeFilter, el.categoryFilter, el.sortFilter].forEach(input => input.addEventListener('input', () => { state.filters.q = el.searchInput.value.trim(); state.filters.type = el.typeFilter.value; state.filters.category = el.categoryFilter.value; state.filters.sort = el.sortFilter.value; writeFiltersToHash(); renderTable(); syncQuickTabs(); }));
  el.resetFilters.addEventListener('click', () => { state.filters = { q: '', type: 'all', category: 'all', sort: 'default' }; applyFilterControls(); writeFiltersToHash(); renderTable(); syncQuickTabs(); });
  el.quickTabs.addEventListener('click', event => { const button = event.target.closest('button[data-category]'); if (!button) return; state.filters.category = button.dataset.category; el.categoryFilter.value = state.filters.category; writeFiltersToHash(); renderTable(); syncQuickTabs(); });
  el.penalTable.addEventListener('click', event => { const rowEl = event.target.closest('tr[data-id]'); if (!rowEl) return; const row = state.rows.find(item => rowKey(item) === rowEl.dataset.id); if (row) changeSelection(row, event.shiftKey ? -1 : 1); });
  el.selectionList.addEventListener('click', event => { const button = event.target.closest('button[data-action]'); if (!button) return; const item = state.selection.get(button.dataset.id); if (item) changeSelection(item.row, button.dataset.action === 'inc' ? 1 : -1); });
  el.clearSelection.addEventListener('click', () => { state.selection.clear(); renderSelection(); renderTableHighlights(); });
  [el.rpAgents, el.rpAddress, el.rpSuspect, el.rpWriter, el.rpStory].forEach(input => input.addEventListener('input', updateReport));
  el.copyReport.addEventListener('click', async () => { await navigator.clipboard.writeText(el.reportOutput.value); showToast('Rapport copie.', 'ok'); });
  el.downloadReport.addEventListener('click', downloadReport);
  el.sendDiscord.addEventListener('click', sendDiscordReport);
  window.addEventListener('hashchange', () => { restoreFiltersFromHash(); renderTable(); syncQuickTabs(); });
}

function applyFilterControls() { el.searchInput.value = state.filters.q; el.typeFilter.value = state.filters.type; el.categoryFilter.value = state.filters.category; el.sortFilter.value = state.filters.sort; }
function restoreFiltersFromHash() { const params = new URLSearchParams(location.hash.replace(/^#/, '')); state.filters.q = params.get('q') || ''; state.filters.type = params.get('type') || 'all'; state.filters.category = params.get('category') || 'all'; state.filters.sort = params.get('sort') || 'default'; applyFilterControls(); }
function writeFiltersToHash() { const params = new URLSearchParams(); if (state.filters.q) params.set('q', state.filters.q); if (state.filters.type !== 'all') params.set('type', state.filters.type); if (state.filters.category !== 'all') params.set('category', state.filters.category); if (state.filters.sort !== 'default') params.set('sort', state.filters.sort); history.replaceState(null, '', params.toString() ? '#' + params.toString() : location.pathname); }

function getFilteredRows() {
  const query = normalizeText(state.filters.q);
  const filtered = state.rows.filter(row => {
    if (state.filters.type !== 'all' && row.type !== state.filters.type) return false;
    if (state.filters.category !== 'all' && String(row.categorie) !== state.filters.category) return false;
    if (!query) return true;
    return normalizeText([row.infraction, row.type, row.categorie, row.amende, row.peine, row.supplements].join(' ')).includes(query);
  });
  return filtered.sort((a, b) => {
    switch (state.filters.sort) {
      case 'name': return collator.compare(a.infraction, b.infraction);
      case 'fineDesc': return numericSort(b.amendeValue, a.amendeValue);
      case 'fineAsc': return numericSort(a.amendeValue, b.amendeValue);
      case 'jailDesc': return numericSort(b.peineValue, a.peineValue);
      case 'jailAsc': return numericSort(a.peineValue, b.peineValue);
      default: return a.id - b.id;
    }
  });
}
function numericSort(a, b) { return (Number.isFinite(a) ? a : -1) - (Number.isFinite(b) ? b : -1); }
function render() { renderTable(); renderSelection(); syncQuickTabs(); }

function renderTable() {
  const rows = getFilteredRows();
  el.resultCount.textContent = rows.length + ' entree' + (rows.length > 1 ? 's' : '') + ' sur ' + state.rows.length;
  if (!rows.length) { el.penalTable.innerHTML = '<tr><td colspan="6" class="soft">Aucune infraction ne correspond aux filtres.</td></tr>'; return; }
  el.penalTable.innerHTML = rows.map(row => {
    const selected = state.selection.has(rowKey(row)) ? ' class="selected"' : '';
    const jail = cleanDisplay(row.peine, '0') + (Number.isFinite(row.peineValue) && String(row.peine) !== '0' ? ' min' : '');
    return '<tr data-id="' + rowKey(row) + '"' + selected + '><td><span class="badge cat-' + row.categorie + '">Cat. ' + row.categorie + '</span></td><td><span class="badge">' + escapeHtml(row.type) + '</span></td><td>' + escapeHtml(row.infraction) + '</td><td class="fine">' + escapeHtml(cleanDisplay(row.amende, formatMoney(row.amendeValue))) + '</td><td>' + escapeHtml(jail) + '</td><td class="soft">' + escapeHtml(cleanDisplay(row.supplements)) + '</td></tr>';
  }).join('');
}
function renderTableHighlights() { document.querySelectorAll('#penalTable tr[data-id]').forEach(tr => tr.classList.toggle('selected', state.selection.has(tr.dataset.id))); }
function syncQuickTabs() { document.querySelectorAll('#quickTabs button').forEach(button => button.classList.toggle('active', button.dataset.category === state.filters.category)); }

function changeSelection(row, delta) { const key = rowKey(row); const current = state.selection.get(key); const qty = Math.max(0, (current ? current.qty : 0) + delta); if (qty === 0) state.selection.delete(key); else state.selection.set(key, { row, qty }); renderSelection(); renderTableHighlights(); }
function totals() { return selectedRows().reduce((acc, item) => { acc.count += item.qty; if (Number.isFinite(item.row.amendeValue)) acc.fine += item.row.amendeValue * item.qty; if (Number.isFinite(item.row.peineValue)) acc.jail += item.row.peineValue * item.qty; return acc; }, { count: 0, fine: 0, jail: 0 }); }

function renderSelection() {
  const items = selectedRows(); const sum = totals();
  el.selectedCount.textContent = String(sum.count); el.totalFine.textContent = formatMoney(sum.fine); el.totalJail.textContent = String(sum.jail);
  el.selectionMeta.textContent = sum.count ? sum.count + ' infraction' + (sum.count > 1 ? 's' : '') + ' retenue' + (sum.count > 1 ? 's' : '') : 'Aucune infraction selectionnee';
  el.selectionList.innerHTML = !items.length ? '<div class="empty-state">Clique sur une ligne du tableau pour ajouter une infraction. Shift + clic retire une quantite.</div>' : items.map(item => '<div class="selected-item"><div><strong>' + escapeHtml(item.row.infraction) + '</strong><small>' + escapeHtml(item.row.type) + ' | ' + escapeHtml(cleanDisplay(item.row.amende)) + ' | ' + escapeHtml(cleanDisplay(item.row.peine)) + '</small></div><div class="qty-controls"><button type="button" data-action="dec" data-id="' + rowKey(item.row) + '">-</button><span>' + item.qty + '</span><button type="button" data-action="inc" data-id="' + rowKey(item.row) + '">+</button></div></div>').join('');
  updateReport();
}

function updateReport() { el.reportOutput.value = buildReport(); }
function buildReport() {
  const sum = totals(); const items = selectedRows(); const supplements = buildSupplements(items); const date = new Date().toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
  const lines = ["Rapport d'incident - LSPD", '', 'Date: ' + date, 'Agents presents: ' + (el.rpAgents.value.trim() || 'Non renseigne'), 'Adresse: ' + (el.rpAddress.value.trim() || 'Non renseignee'), 'Suspect: ' + (el.rpSuspect.value.trim() || 'Non renseigne'), '', 'Deroulement:', el.rpStory.value.trim() || 'Non renseigne', '', "Chefs d'accusation:"];
  if (items.length) items.forEach(item => lines.push('- x' + item.qty + ' ' + item.row.infraction + ' (' + cleanDisplay(item.row.amende) + ', peine: ' + cleanDisplay(item.row.peine) + ')')); else lines.push('- Aucun');
  lines.push('', 'Total amende: ' + formatMoney(sum.fine), 'Total peine: ' + sum.jail + ' minutes');
  if (supplements.length) lines.push('', 'Supplements:', ...supplements.map(text => '- ' + text));
  lines.push('', 'Rapport redige par: ' + (el.rpWriter.value.trim() || 'Non renseigne'));
  return lines.join('\n');
}
function buildSupplements(items) { const map = new Map(); items.forEach(item => { const text = cleanDisplay(item.row.supplements, ''); if (!text || text === '-') return; map.set(text, (map.get(text) || 0) + item.qty); }); return Array.from(map.entries()).map(([text, qty]) => qty > 1 ? text + ' x' + qty : text); }
function downloadReport() { const blob = new Blob([el.reportOutput.value], { type: 'text/plain;charset=utf-8' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'rapport-lspd-' + new Date().toISOString().slice(0, 10) + '.txt'; link.click(); URL.revokeObjectURL(link.href); }
async function sendDiscordReport() {
  const embeds = [{ title: 'Rapport d incident - LSPD', description: el.reportOutput.value.slice(0, 3900), color: 5213439 }];
  try { const response = await fetch(DISCORD_WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ embeds }) }); if (!response.ok) throw new Error('HTTP ' + response.status); showToast('Rapport envoye sur Discord.', 'ok'); } catch (error) { showToast('Envoi impossible: ' + error.message, 'error'); }
}
function showToast(message, type) { el.toast.textContent = message; el.toast.className = 'notice ' + type; window.clearTimeout(showToast.timer); showToast.timer = window.setTimeout(() => { el.toast.textContent = ''; el.toast.className = 'notice'; }, 4200); }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char])); }
function escapeAttr(value) { return escapeHtml(value); }
document.addEventListener('DOMContentLoaded', init);
