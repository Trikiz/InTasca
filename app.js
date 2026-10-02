// ==========================================
// REGISTRAZIONE SERVICE WORKER (PWA)
// ==========================================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then((reg) => console.log('Service Worker attivo:', reg.scope))
      .catch((err) => console.warn('Service Worker non registrato:', err));
  });
}

// ==========================================
// STATO DELL'APPLICAZIONE
// ==========================================
const DEFAULT_CATEGORIES = [
  { id: 'cibo', name: 'Spesa & Cibo', icon: 'shopping-cart', color: '#f97316' },
  { id: 'casa', name: 'Casa & Utenze', icon: 'home', color: '#06b6d4' },
  { id: 'trasporti', name: 'Trasporti & Auto', icon: 'car', color: '#eab308' },
  { id: 'svago', name: 'Svago & Ristoranti', icon: 'utensils', color: '#ec4899' },
  { id: 'salute', name: 'Salute & Benessere', icon: 'heart-pulse', color: '#10b981' },
  { id: 'acquisti', name: 'Shopping & Extra', icon: 'shopping-bag', color: '#8b5cf6' },
  { id: 'stipendio', name: 'Stipendio & Entrate', icon: 'banknote', color: '#22c55e' },
  { id: 'altro', name: 'Altro', icon: 'tag', color: '#64748b' }
];

const MONTH_NAMES = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
];

// Inizializzazione: nessun dato fittizio, parte a zero!
let state = {
  transactions: [],
  categories: DEFAULT_CATEGORIES,
  darkMode: false
};

// Riferimento al file fisico aperto sul computer (File System Access API)
let fileHandle = null;

const currentDate = new Date();
let selectedYear = currentDate.getFullYear();
let selectedMonth = currentDate.getMonth();

let categoryChartInstance = null;
let yearlyChartInstance = null;

// ==========================================
// INIZIALIZZAZIONE
// ==========================================
window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('txDate').value = new Date().toISOString().split('T')[0];

  // Carica da memoria locale se già usata in precedenza
  const saved = localStorage.getItem('mie_finanze_data');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      state.transactions = parsed.transactions || [];
      state.categories = parsed.categories || DEFAULT_CATEGORIES;
      state.darkMode = !!parsed.darkMode;
    } catch (e) {
      state.transactions = [];
    }
  }

  applyTheme(state.darkMode);
  setupNavigation();
  setupPeriodSelector();
  setupFilters();
  setupFileSystemSync();
  populateCategorySelects();
  initCharts();
  refreshApp();
});

// ==========================================
// SELETTORE PERIODO (MESE / ANNO)
// ==========================================
function setupPeriodSelector() {
  document.getElementById('prevMonthBtn').addEventListener('click', () => {
    selectedMonth--;
    if (selectedMonth < 0) {
      selectedMonth = 11;
      selectedYear--;
    }
    updatePeriodDisplay();
    refreshDashboardOnly();
  });

  document.getElementById('nextMonthBtn').addEventListener('click', () => {
    selectedMonth++;
    if (selectedMonth > 11) {
      selectedMonth = 0;
      selectedYear++;
    }
    updatePeriodDisplay();
    refreshDashboardOnly();
  });

  document.getElementById('todayBtn').addEventListener('click', () => {
    const now = new Date();
    selectedYear = now.getFullYear();
    selectedMonth = now.getMonth();
    updatePeriodDisplay();
    refreshDashboardOnly();
  });

  updatePeriodDisplay();
}

function updatePeriodDisplay() {
  const label = `${MONTH_NAMES[selectedMonth]} ${selectedYear}`;
  document.getElementById('periodLabel').textContent = label;

  const now = new Date();
  const isCurrentMonth = (selectedYear === now.getFullYear() && selectedMonth === now.getMonth());

  document.getElementById('periodHint').textContent = isCurrentMonth 
    ? 'Stai visualizzando il mese corrente' 
    : `Archivio storico per ${label}`;

  document.getElementById('expenseCardLabel').textContent = `Uscite (${MONTH_NAMES[selectedMonth]})`;
  document.getElementById('incomeCardLabel').textContent = `Entrate (${MONTH_NAMES[selectedMonth]})`;
  document.getElementById('avgCardLabel').textContent = `Media Mensile (${selectedYear})`;
  document.getElementById('doughnutChartTitle').textContent = `Spese per Categoria (${MONTH_NAMES[selectedMonth]} ${selectedYear})`;
  document.getElementById('barChartTitle').textContent = `Confronto Mensile (${selectedYear} vs ${selectedYear - 1})`;
}

function refreshDashboardOnly() {
  renderStats();
  renderDashboardTransactions();
  updateCharts();
  lucide.createIcons();
}

// ==========================================
// NAVIGAZIONE TRA SCHERMATE (SPA)
// ==========================================
function setupNavigation() {
  const tabs = document.querySelectorAll('.nav-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      switchView(tab.getAttribute('data-view'));
    });
  });
}

function switchView(viewName) {
  document.querySelectorAll('.nav-tab').forEach(t => {
    t.classList.toggle('active', t.getAttribute('data-view') === viewName);
  });

  document.querySelectorAll('.app-view').forEach(v => {
    v.classList.remove('active');
  });
  const activeViewEl = document.getElementById(`view-${viewName}`);
  if (activeViewEl) {
    activeViewEl.classList.add('active');
  }

  if (viewName === 'dashboard') {
    setTimeout(updateCharts, 50);
  } else if (viewName === 'transactions') {
    renderAllTransactions();
  } else if (viewName === 'categories') {
    renderCategoriesList();
  }
  lucide.createIcons();
}

// ==========================================
// GESTIONE DARK MODE
// ==========================================
const themeToggleBtn = document.getElementById('themeToggleBtn');
themeToggleBtn.addEventListener('click', () => {
  state.darkMode = !state.darkMode;
  applyTheme(state.darkMode);
  saveToStorage();
  updateChartsTheme();
});

function applyTheme(isDark) {
  if (isDark) {
    document.body.classList.add('dark');
    themeToggleBtn.innerHTML = '<i data-lucide="sun"></i>';
  } else {
    document.body.classList.remove('dark');
    themeToggleBtn.innerHTML = '<i data-lucide="moon"></i>';
  }
  lucide.createIcons();
}

function updateChartsTheme() {
  const isDark = state.darkMode;
  const textColor = isDark ? '#94a3b8' : '#64748b';
  const gridColor = isDark ? '#334155' : '#f1f5f9';

  if (yearlyChartInstance) {
    yearlyChartInstance.options.scales.x.ticks.color = textColor;
    yearlyChartInstance.options.scales.y.ticks.color = textColor;
    yearlyChartInstance.options.scales.y.grid.color = gridColor;
    yearlyChartInstance.options.plugins.legend.labels.color = textColor;
    yearlyChartInstance.update();
  }
  if (categoryChartInstance) {
    categoryChartInstance.options.plugins.legend.labels.color = textColor;
    categoryChartInstance.update();
  }
}

// ==========================================
// UTILITY
// ==========================================
function formatCurrency(num) {
  return num.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
}

// Salva sia su localStorage che DIRETTAMENTE sul file fisico collegato
async function saveToStorage() {
  localStorage.setItem('mie_finanze_data', JSON.stringify(state));
  await writeDirectlyToFile();
}

function populateCategorySelects() {
  const selects = [
    document.getElementById('txCategory'),
    document.getElementById('editTxCategory'),
    document.getElementById('filterCategory')
  ];

  selects.forEach(select => {
    if (!select) return;
    const isFilter = select.id === 'filterCategory';
    select.innerHTML = isFilter ? '<option value="all">Tutte le categorie</option>' : '';

    state.categories.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat.id;
      opt.textContent = cat.name;
      select.appendChild(opt);
    });
  });
}

function refreshApp() {
  saveToStorage();
  updatePeriodDisplay();
  renderStats();
  renderDashboardTransactions();
  renderAllTransactions();
  renderCategoriesList();
  updateCharts();
  lucide.createIcons();
}

// ==========================================
// CALCOLO STATISTICHE
// ==========================================
function renderStats() {
  let totalBalance = 0;
  let monthExpenses = 0;
  let monthIncome = 0;
  let yearExpensesTotal = 0;
  let monthsWithExpenses = new Set();

  state.transactions.forEach(tx => {
    const txDate = new Date(tx.date);
    const txYear = txDate.getFullYear();
    const txMonth = txDate.getMonth();

    if (tx.type === 'income') {
      totalBalance += tx.amount;
    } else {
      totalBalance -= tx.amount;
    }

    const isSelectedYear = (txYear === selectedYear);
    const isSelectedMonth = isSelectedYear && (txMonth === selectedMonth);

    if (tx.type === 'income') {
      if (isSelectedMonth) monthIncome += tx.amount;
    } else {
      if (isSelectedMonth) monthExpenses += tx.amount;
      if (isSelectedYear) {
        yearExpensesTotal += tx.amount;
        monthsWithExpenses.add(txMonth);
      }
    }
  });

  const activeMonthsCount = monthsWithExpenses.size || 1;
  const yearAvg = yearExpensesTotal / activeMonthsCount;

  document.getElementById('totalBalance').textContent = formatCurrency(totalBalance);
  document.getElementById('monthExpenses').textContent = formatCurrency(monthExpenses);
  document.getElementById('monthIncome').textContent = formatCurrency(monthIncome);
  document.getElementById('yearAvgExpense').textContent = formatCurrency(yearAvg);
}

function renderDashboardTransactions() {
  const listEl = document.getElementById('dashboardTxList');
  listEl.innerHTML = '';

  const filtered = state.transactions.filter(tx => {
    const d = new Date(tx.date);
    return d.getFullYear() === selectedYear && d.getMonth() === selectedMonth;
  }).sort((a, b) => new Date(b.date) - new Date(a.date));

  if (filtered.length === 0) {
    listEl.innerHTML = `<div class="empty-state">Nessun movimento registrato a ${MONTH_NAMES[selectedMonth]} ${selectedYear}.</div>`;
    return;
  }

  filtered.forEach(tx => {
    listEl.appendChild(createTxElement(tx, false));
  });
}

function renderAllTransactions() {
  const listEl = document.getElementById('allTxList');
  const countEl = document.getElementById('allTxCount');
  listEl.innerHTML = '';

  const searchQuery = document.getElementById('filterSearch').value.toLowerCase().trim();
  const catFilter = document.getElementById('filterCategory').value;
  const typeFilter = document.getElementById('filterType').value;

  let filtered = [...state.transactions].sort((a, b) => new Date(b.date) - new Date(a.date));

  if (catFilter !== 'all') {
    filtered = filtered.filter(t => t.category === catFilter);
  }
  if (typeFilter !== 'all') {
    filtered = filtered.filter(t => t.type === typeFilter);
  }
  if (searchQuery) {
    filtered = filtered.filter(t => {
      const cat = state.categories.find(c => c.id === t.category);
      const catName = cat ? cat.name.toLowerCase() : '';
      const note = (t.note || '').toLowerCase();
      return note.includes(searchQuery) || catName.includes(searchQuery);
    });
  }

  countEl.textContent = `${filtered.length} moviment${filtered.length === 1 ? 'o' : 'i'}`;

  if (filtered.length === 0) {
    listEl.innerHTML = '<div class="empty-state">Nessun movimento registrato.</div>';
    return;
  }

  filtered.forEach(tx => {
    listEl.appendChild(createTxElement(tx, true));
  });
  lucide.createIcons();
}

function setupFilters() {
  document.getElementById('filterSearch').addEventListener('input', renderAllTransactions);
  document.getElementById('filterCategory').addEventListener('change', renderAllTransactions);
  document.getElementById('filterType').addEventListener('change', renderAllTransactions);
}

function createTxElement(tx, showEditBtn = true) {
  const cat = state.categories.find(c => c.id === tx.category) || { name: 'Altro', icon: 'tag', color: '#64748b' };
  const isExp = tx.type === 'expense';
  
  const item = document.createElement('div');
  item.className = 'tx-item';
  item.innerHTML = `
    <div class="tx-left">
      <div class="tx-cat-badge" style="background-color: ${cat.color};">
        <i data-lucide="${cat.icon || 'tag'}" style="width: 20px; height: 20px;"></i>
      </div>
      <div class="tx-info">
        <h4>${tx.note || cat.name}</h4>
        <span>${cat.name} • ${tx.date}</span>
      </div>
    </div>
    <div class="tx-right">
      <span class="tx-amount ${isExp ? 'expense' : 'income'}">
        ${isExp ? '-' : '+'}${formatCurrency(tx.amount)}
      </span>
      ${showEditBtn ? `
        <button class="tx-btn" onclick="openEditModal('${tx.id}')" title="Modifica">
          <i data-lucide="pencil" style="width: 16px; height: 16px;"></i>
        </button>
      ` : ''}
      <button class="tx-btn btn-danger" onclick="deleteTx('${tx.id}')" title="Elimina">
        <i data-lucide="trash-2" style="width: 16px; height: 16px;"></i>
      </button>
    </div>
  `;
  return item;
}

window.deleteTx = function(id) {
  if (confirm('Vuoi davvero eliminare questo movimento?')) {
    state.transactions = state.transactions.filter(t => t.id !== id);
    refreshApp();
  }
};

// ==========================================
// REGISTRAZIONE NUOVA TRANSAZIONE
// ==========================================
document.getElementById('txForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const amount = parseFloat(document.getElementById('txAmount').value);
  const type = document.getElementById('txType').value;
  const date = document.getElementById('txDate').value;
  const category = document.getElementById('txCategory').value;
  const note = document.getElementById('txNote').value.trim();

  if (isNaN(amount) || amount <= 0) return;

  const newTx = {
    id: Date.now().toString(),
    date,
    type,
    amount,
    category,
    note
  };

  state.transactions.unshift(newTx);
  document.getElementById('txAmount').value = '';
  document.getElementById('txNote').value = '';

  const txD = new Date(date);
  selectedYear = txD.getFullYear();
  selectedMonth = txD.getMonth();

  refreshApp();
});

// ==========================================
// MODALE MODIFICA
// ==========================================
const editModal = document.getElementById('editModal');

window.openEditModal = function(id) {
  const tx = state.transactions.find(t => t.id === id);
  if (!tx) return;

  document.getElementById('editTxId').value = tx.id;
  document.getElementById('editTxType').value = tx.type;
  document.getElementById('editTxAmount').value = tx.amount;
  document.getElementById('editTxDate').value = tx.date;
  document.getElementById('editTxCategory').value = tx.category;
  document.getElementById('editTxNote').value = tx.note || '';

  editModal.classList.add('open');
  lucide.createIcons();
};

window.closeEditModal = function() {
  editModal.classList.remove('open');
};

document.getElementById('editTxForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const id = document.getElementById('editTxId').value;
  const tx = state.transactions.find(t => t.id === id);
  if (!tx) return;

  tx.type = document.getElementById('editTxType').value;
  tx.amount = parseFloat(document.getElementById('editTxAmount').value);
  tx.date = document.getElementById('editTxDate').value;
  tx.category = document.getElementById('editTxCategory').value;
  tx.note = document.getElementById('editTxNote').value.trim();

  closeEditModal();
  refreshApp();
});

// ==========================================
// GESTIONE CATEGORIE
// ==========================================
function renderCategoriesList() {
  const container = document.getElementById('catListContainer');
  const countEl = document.getElementById('catCount');
  container.innerHTML = '';

  countEl.textContent = `${state.categories.length} categorie`;

  state.categories.forEach(cat => {
    const txCount = state.transactions.filter(t => t.category === cat.id).length;
    const item = document.createElement('div');
    item.className = 'cat-item';
    item.innerHTML = `
      <div class="cat-item-left">
        <span class="cat-badge-dot" style="background-color: ${cat.color};"></span>
        <i data-lucide="${cat.icon || 'tag'}" style="width: 18px; height: 18px;"></i>
        <strong>${cat.name}</strong>
      </div>
      <div style="display: flex; align-items: center; gap: 12px;">
        <span class="badge-count">${txCount} moviment${txCount === 1 ? 'o' : 'i'}</span>
        ${cat.id !== 'altro' ? `
          <button class="tx-btn btn-danger" onclick="deleteCategory('${cat.id}')" title="Elimina Categoria">
            <i data-lucide="trash-2" style="width: 15px; height: 15px;"></i>
          </button>
        ` : ''}
      </div>
    `;
    container.appendChild(item);
  });
  lucide.createIcons();
}

document.getElementById('newCatForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = document.getElementById('catName').value.trim();
  const color = document.getElementById('catColor').value;
  const icon = document.getElementById('catIcon').value;

  if (!name) return;

  const id = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || Date.now().toString();

  if (state.categories.some(c => c.id === id)) {
    alert('Esiste già una categoria con questo nome!');
    return;
  }

  state.categories.push({ id, name, color, icon });
  document.getElementById('catName').value = '';
  populateCategorySelects();
  refreshApp();
});

window.deleteCategory = function(catId) {
  const txUsingCat = state.transactions.filter(t => t.category === catId).length;
  if (txUsingCat > 0) {
    if (!confirm(`Questa categoria è usata in ${txUsingCat} movimenti. Se la elimini, quei movimenti verranno assegnati ad "Altro". Vuoi continuare?`)) {
      return;
    }
    state.transactions.forEach(t => {
      if (t.category === catId) t.category = 'altro';
    });
  } else {
    if (!confirm('Vuoi eliminare questa categoria?')) return;
  }

  state.categories = state.categories.filter(c => c.id !== catId);
  populateCategorySelects();
  refreshApp();
};

// ==========================================
// GRAFICI CON CHART.JS
// ==========================================
function initCharts() {
  const isDark = state.darkMode;
  const textColor = isDark ? '#94a3b8' : '#64748b';
  const gridColor = isDark ? '#334155' : '#f1f5f9';

  const ctxCat = document.getElementById('categoryChart').getContext('2d');
  categoryChartInstance = new Chart(ctxCat, {
    type: 'doughnut',
    data: {
      labels: [],
      datasets: [{
        data: [],
        backgroundColor: [],
        borderWidth: 2,
        borderColor: isDark ? '#1e293b' : '#ffffff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { boxWidth: 12, font: { size: 11 }, color: textColor }
        }
      },
      cutout: '70%'
    }
  });

  const monthLabels = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
  const ctxYear = document.getElementById('yearlyChart').getContext('2d');
  yearlyChartInstance = new Chart(ctxYear, {
    type: 'bar',
    data: {
      labels: monthLabels,
      datasets: [
        {
          label: `${selectedYear}`,
          data: new Array(12).fill(0),
          backgroundColor: '#6366f1',
          borderRadius: 4
        },
        {
          label: `${selectedYear - 1}`,
          data: new Array(12).fill(0),
          backgroundColor: isDark ? '#475569' : '#cbd5e1',
          borderRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: gridColor },
          ticks: { color: textColor }
        },
        x: {
          grid: { display: false },
          ticks: { color: textColor }
        }
      },
      plugins: {
        legend: {
          position: 'bottom',
          labels: { boxWidth: 12, font: { size: 11 }, color: textColor }
        }
      }
    }
  });
}

function updateCharts() {
  if (!categoryChartInstance || !yearlyChartInstance) return;

  const isDark = state.darkMode;
  const prevYear = selectedYear - 1;

  const catTotals = {};
  state.transactions.forEach(tx => {
    if (tx.type !== 'expense') return;
    const d = new Date(tx.date);
    if (d.getFullYear() === selectedYear && d.getMonth() === selectedMonth) {
      catTotals[tx.category] = (catTotals[tx.category] || 0) + tx.amount;
    }
  });

  const catLabels = [];
  const catData = [];
  const catColors = [];

  Object.keys(catTotals).forEach(catId => {
    const cat = state.categories.find(c => c.id === catId) || { name: 'Altro', color: '#94a3b8' };
    catLabels.push(cat.name);
    catData.push(catTotals[catId]);
    catColors.push(cat.color || '#94a3b8');
  });

  if (catData.length === 0) {
    categoryChartInstance.data.labels = [`Nessuna spesa a ${MONTH_NAMES[selectedMonth]}`];
    categoryChartInstance.data.datasets[0].data = [1];
    categoryChartInstance.data.datasets[0].backgroundColor = [isDark ? '#334155' : '#e2e8f0'];
  } else {
    categoryChartInstance.data.labels = catLabels;
    categoryChartInstance.data.datasets[0].data = catData;
    categoryChartInstance.data.datasets[0].backgroundColor = catColors;
  }
  categoryChartInstance.data.datasets[0].borderColor = isDark ? '#1e293b' : '#ffffff';
  categoryChartInstance.update();

  const expensesSelectedYear = new Array(12).fill(0);
  const expensesPrevYear = new Array(12).fill(0);

  state.transactions.forEach(tx => {
    if (tx.type !== 'expense') return;
    const d = new Date(tx.date);
    const y = d.getFullYear();
    const m = d.getMonth();
    if (y === selectedYear) {
      expensesSelectedYear[m] += tx.amount;
    } else if (y === prevYear) {
      expensesPrevYear[m] += tx.amount;
    }
  });

  yearlyChartInstance.data.datasets[0].label = `${selectedYear}`;
  yearlyChartInstance.data.datasets[0].data = expensesSelectedYear;
  yearlyChartInstance.data.datasets[1].label = `${prevYear}`;
  yearlyChartInstance.data.datasets[1].data = expensesPrevYear;
  yearlyChartInstance.data.datasets[1].backgroundColor = isDark ? '#475569' : '#cbd5e1';
  yearlyChartInstance.update();
}

// ==========================================
// FILE SYSTEM ACCESS & SINCRONIZZAZIONE SU DISCO
// ==========================================
function setupFileSystemSync() {
  const linkFileBtn = document.getElementById('linkFileBtn');
  const unlinkFileBtn = document.getElementById('unlinkFileBtn');

  // Pulsante "Collega File"
  linkFileBtn.addEventListener('click', async () => {
    // Se il browser supporta File System Access API (Chrome, Edge, Brave, Opera)
    if ('showOpenFilePicker' in window) {
      try {
        const [handle] = await window.showOpenFilePicker({
          types: [{
            description: 'File Finanze JSON',
            accept: { 'application/json': ['.json'] }
          }],
          multiple: false
        });

        fileHandle = handle;
        const file = await fileHandle.getFile();
        const content = await file.text();

        if (content.trim()) {
          const parsed = JSON.parse(content);
          if (parsed.transactions && Array.isArray(parsed.transactions)) {
            state.transactions = parsed.transactions;
            if (parsed.categories) state.categories = parsed.categories;
            populateCategorySelects();
          }
        }
        setConnectedFileUI(fileHandle.name);
        refreshApp();
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error(err);
          alert('Errore durante il collegamento del file.');
        }
      }
    } else {
      // Fallback: apri normale input file per browser non supportati (Safari / Mobile)
      document.getElementById('fileInput').click();
    }
  });

  // Pulsante "Scollega"
  unlinkFileBtn.addEventListener('click', () => {
    fileHandle = null;
    document.getElementById('fileNoticeBar').style.display = 'none';
    document.getElementById('linkFileText').textContent = 'Collega File';
    lucide.createIcons();
  });
}

function setConnectedFileUI(fileName) {
  document.getElementById('fileNoticeBar').style.display = 'flex';
  document.getElementById('connectedFileName').textContent = fileName;
  document.getElementById('linkFileText').textContent = 'File Collegato';
  lucide.createIcons();
}

// Scrive direttamente nel file fisico ogni volta che aggiungi/elimini/modifichi
async function writeDirectlyToFile() {
  if (!fileHandle) return;
  try {
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(state, null, 2));
    await writable.close();
  } catch (err) {
    console.warn('Scrittura automatica su file fallita o permessi scaduti:', err);
  }
}

// Esportazione manuale JSON (Fallback universale)
document.getElementById('exportBtn').addEventListener('click', () => {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", `finanze_${new Date().toISOString().split('T')[0]}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
});

// Importazione manuale JSON (Fallback universale)
document.getElementById('importBtn').addEventListener('click', () => {
  document.getElementById('fileInput').click();
});

document.getElementById('fileInput').addEventListener('change', (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const imported = JSON.parse(e.target.result);
      if (imported.transactions && Array.isArray(imported.transactions)) {
        state.transactions = imported.transactions;
        if (imported.categories) state.categories = imported.categories;
        if (typeof imported.darkMode !== 'undefined') {
          state.darkMode = imported.darkMode;
          applyTheme(state.darkMode);
        }
        populateCategorySelects();
        refreshApp();
        alert('File caricato con successo!');
      } else {
        alert('Formato file non valido.');
      }
    } catch (err) {
      alert('Errore nella lettura del file JSON.');
    }
  };
  reader.readAsText(file);
});
