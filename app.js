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
// STATO DELL'APPLICAZIONE (InTasca)
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

let state = {
  transactions: [],
  categories: DEFAULT_CATEGORIES,
  subscriptions: [],
  darkMode: false
};

let fileHandle = null;

const currentDate = new Date();
let selectedYear = currentDate.getFullYear();
let selectedMonth = currentDate.getMonth();

// Anno selezionato per la vista Report Annuale
let annualSelectedYear = currentDate.getFullYear();

// Riferimenti grafici Dashboard
let categoryChartInstance = null;
let yearlyChartInstance = null;

// Riferimenti grafici Report Annuale
let annualCashflowChartInstance = null;
let annualCategoryChartInstance = null;
let annualCumulativeChartInstance = null;

// Data pivot e riferimenti grafici Report Settimanale
let weeklySelectedDate = new Date();
let weeklyDayChartInstance = null;
let weeklyCategoryChartInstance = null;

// ==========================================
// INIZIALIZZAZIONE
// ==========================================
window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('txDate').value = new Date().toISOString().split('T')[0];

  const saved = localStorage.getItem('intasca_data') || localStorage.getItem('mie_finanze_data');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      state.transactions = parsed.transactions || [];
      state.categories = parsed.categories || DEFAULT_CATEGORIES;
      state.subscriptions = parsed.subscriptions || [];
      state.darkMode = !!parsed.darkMode;
    } catch (e) {
      state.transactions = [];
      state.subscriptions = [];
    }
  }

  checkAndApplySubscriptions();

  applyTheme(state.darkMode);
  setupNavigation();
  setupPeriodSelector();
  setupAnnualPeriodSelector();
  setupFilters();
  setupFileSystemSync();
  setupSubscriptionForm();
  populateCategorySelects();
  setupWeeklyPeriodSelector();
  initDashboardCharts();
  initAnnualCharts();
  initWeeklyCharts();
  refreshApp();
});

// ==========================================
// CATCH-UP AUTOMATICO ABBONAMENTI
// ==========================================
function checkAndApplySubscriptions() {
  if (!state.subscriptions || state.subscriptions.length === 0) return;

  const now = new Date();
  const currentY = now.getFullYear();
  const currentM = now.getMonth();
  const currentD = now.getDate();

  let addedCount = 0;

  state.subscriptions.forEach(sub => {
    if (!sub.autoAdd) return;

    if (sub.frequency === 'monthly') {
      const targetDay = Math.min(sub.billingDay, new Date(currentY, currentM + 1, 0).getDate());
      if (currentD >= targetDay) {
        const expectedDateStr = `${currentY}-${String(currentM + 1).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`;
        const alreadyExists = state.transactions.some(tx => 
          tx.subscriptionId === sub.id && tx.date.startsWith(`${currentY}-${String(currentM + 1).padStart(2, '0')}`)
        );

        if (!alreadyExists) {
          state.transactions.unshift({
            id: 'sub_tx_' + Date.now().toString() + Math.random().toString(36).substr(2, 4),
            subscriptionId: sub.id,
            date: expectedDateStr,
            type: 'expense',
            amount: sub.amount,
            category: sub.category,
            note: `[Rinnovo] ${sub.name}`
          });
          sub.lastGenerated = expectedDateStr;
          addedCount++;
        }
      }
    }
  });

  if (addedCount > 0) {
    saveToStorage();
    console.log(`InTasca: Generati automaticamente ${addedCount} rinnovi.`);
  }
}

// ==========================================
// SELETTORE PERIODO DASHBOARD (MESE / ANNO)
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
  updateDashboardCharts();
  lucide.createIcons();
}

// ==========================================
// SELETTORE ANNO REPORT ANNUALE
// ==========================================
function setupAnnualPeriodSelector() {
  document.getElementById('prevAnnualYearBtn').addEventListener('click', () => {
    annualSelectedYear--;
    updateAnnualDisplay();
    renderAnnualReport();
  });

  document.getElementById('nextAnnualYearBtn').addEventListener('click', () => {
    annualSelectedYear++;
    updateAnnualDisplay();
    renderAnnualReport();
  });

  document.getElementById('currentYearBtn').addEventListener('click', () => {
    annualSelectedYear = new Date().getFullYear();
    updateAnnualDisplay();
    renderAnnualReport();
  });

  updateAnnualDisplay();
}

function updateAnnualDisplay() {
  document.getElementById('annualYearLabel').textContent = `${annualSelectedYear}`;
  const now = new Date();
  const isCurrent = (annualSelectedYear === now.getFullYear());
  document.getElementById('annualHint').textContent = isCurrent 
    ? `Panoramica finanziaria complessiva dell'anno in corso (${annualSelectedYear})` 
    : `Riepilogo e archivio storico delle spese dell'anno ${annualSelectedYear}`;
}

// ==========================================
// NAVIGAZIONE SPA
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
    setTimeout(updateDashboardCharts, 50);
  } else if (viewName === 'transactions') {
    renderAllTransactions();
  } else if (viewName === 'annual') {
    renderAnnualReport();
    setTimeout(updateAnnualCharts, 50);
  } else if (viewName === 'weekly') {
    renderWeeklyReport();
    setTimeout(updateWeeklyCharts, 50);
  } else if (viewName === 'categories') {
    renderCategoriesList();
  } else if (viewName === 'subscriptions') {
    renderSubscriptionsList();
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

  // Dashboard charts
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

  // Annual report charts
  if (annualCashflowChartInstance) {
    annualCashflowChartInstance.options.scales.x.ticks.color = textColor;
    annualCashflowChartInstance.options.scales.y.ticks.color = textColor;
    annualCashflowChartInstance.options.scales.y.grid.color = gridColor;
    annualCashflowChartInstance.options.plugins.legend.labels.color = textColor;
    annualCashflowChartInstance.update();
  }
  if (annualCategoryChartInstance) {
    annualCategoryChartInstance.options.plugins.legend.labels.color = textColor;
    annualCategoryChartInstance.update();
  }
  if (annualCumulativeChartInstance) {
    annualCumulativeChartInstance.options.scales.x.ticks.color = textColor;
    annualCumulativeChartInstance.options.scales.y.ticks.color = textColor;
    annualCumulativeChartInstance.options.scales.y.grid.color = gridColor;
    annualCumulativeChartInstance.options.plugins.legend.labels.color = textColor;
    annualCumulativeChartInstance.update();
  }
  if (weeklyDayChartInstance) {
    weeklyDayChartInstance.options.scales.x.ticks.color = textColor;
    weeklyDayChartInstance.options.scales.y.ticks.color = textColor;
    weeklyDayChartInstance.options.scales.y.grid.color = gridColor;
    weeklyDayChartInstance.update();
  }
  if (weeklyCategoryChartInstance) {
    weeklyCategoryChartInstance.options.plugins.legend.labels.color = textColor;
    weeklyCategoryChartInstance.update();
  }
}

// ==========================================
// UTILITY
// ==========================================

// ==========================================
// UTILITY: SANITIZZAZIONE E FORMATTAZIONE ROBUSTA
// ==========================================

// Sanitizzazione testo contro iniezioni HTML/XSS
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Parsing numerico universale: gestisce numeri, stringhe con virgola o punto (es. "1.250,50", "25,50", 12.3)
function parseAmount(val) {
  if (typeof val === 'number') return isNaN(val) ? 0 : Math.abs(val);
  if (!val) return 0;

  let clean = String(val).trim().replace(/\s+/g, '');
  
  // Se contiene sia punto che virgola (es. "1.250,50"), rimuove i punti delle migliaia
  if (clean.includes('.') && clean.includes(',')) {
    clean = clean.replace(/\./g, '').replace(',', '.');
  } else if (clean.includes(',')) {
    // Sostituisce la virgola decimale italiana col punto
    clean = clean.replace(',', '.');
  }

  const parsed = parseFloat(clean);
  return isNaN(parsed) ? 0 : Math.abs(parsed);
}

// Formattazione valuta sicura
function formatCurrency(num) {
  const n = (typeof num === 'number' && !isNaN(num)) ? num : parseAmount(num);
  return n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
}

// Formattazione visiva data (da YYYY-MM-DD a DD/MM/YYYY)
function formatDate(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return escapeHtml(dateStr);
}

async function saveToStorage() {
  localStorage.setItem('intasca_data', JSON.stringify(state));
  await writeDirectlyToFile();
}

function populateCategorySelects() {
  const selects = [
    document.getElementById('txCategory'),
    document.getElementById('editTxCategory'),
    document.getElementById('filterCategory'),
    document.getElementById('subCategory')
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
  updateAnnualDisplay();
  renderStats();
  renderDashboardTransactions();
  renderAllTransactions();
  renderAnnualReport();
  renderWeeklyReport();
  renderCategoriesList();
  renderSubscriptionsList();
  updateDashboardCharts();
  lucide.createIcons();
}

// Calcola lunedì (inizio) e domenica (fine) della settimana contenente la data passata
function getWeekRange(refDate) {
  const d = new Date(refDate);
  const day = d.getDay(); // 0 = Dom, 1 = Lun, ...
  const diffToMonday = (day === 0 ? -6 : 1) - day;
  
  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  return { monday, sunday };
}

// Numero settimana dell'anno (ISO 8601)
function getISOWeekNumber(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
}

// Formato data YYYY-MM-DD
function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function setupWeeklyPeriodSelector() {
  document.getElementById('prevWeekBtn').addEventListener('click', () => {
    weeklySelectedDate.setDate(weeklySelectedDate.getDate() - 7);
    renderWeeklyReport();
  });

  document.getElementById('nextWeekBtn').addEventListener('click', () => {
    weeklySelectedDate.setDate(weeklySelectedDate.getDate() + 7);
    renderWeeklyReport();
  });

  document.getElementById('currentWeekBtn').addEventListener('click', () => {
    weeklySelectedDate = new Date();
    renderWeeklyReport();
  });
}

function renderWeeklyReport() {
  const { monday, sunday } = getWeekRange(weeklySelectedDate);
  const monISO = toISODate(monday);
  const sunISO = toISODate(sunday);
  const weekNum = getISOWeekNumber(monday);

  // Aggiorna intestazione periodo
  const labelEl = document.getElementById('weeklyLabel');
  const hintEl = document.getElementById('weeklyHint');
  const monStr = `${String(monday.getDate()).padStart(2, '0')}/${String(monday.getMonth() + 1).padStart(2, '0')}`;
  const sunStr = `${String(sunday.getDate()).padStart(2, '0')}/${String(sunday.getMonth() + 1).padStart(2, '0')}/${sunday.getFullYear()}`;
  
  labelEl.textContent = `Settimana ${weekNum} (${monStr} - ${sunStr})`;

  const now = new Date();
  const isCurrentWeek = (now >= monday && now <= sunday);
  hintEl.textContent = isCurrentWeek 
    ? 'Stai visualizzando i dati della settimana corrente'
    : `Archivio della settimana dal ${monStr} al ${sunStr}`;

  // Inizializza contatori
  let weeklyExpenses = 0;
  let weeklyIncome = 0;
  const dayExpensesArr = new Array(7).fill(0); // 0 = Lun, 1 = Mar, ... 6 = Dom
  const dayNames = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
  const catTotals = {};

  // Filtra movimenti della settimana
  const weekTxs = state.transactions.filter(tx => {
    return tx.date >= monISO && tx.date <= sunISO;
  }).sort((a, b) => new Date(b.date) - new Date(a.date));

  weekTxs.forEach(tx => {
    const amt = parseAmount(tx.amount);
    if (tx.type === 'income') {
      weeklyIncome += amt;
    } else {
      weeklyExpenses += amt;
      catTotals[tx.category] = (catTotals[tx.category] || 0) + amt;

      // Assegna la spesa al corretto giorno della settimana (0 = Lunedi)
      const d = new Date(tx.date + 'T00:00:00');
      const dayIdx = (d.getDay() === 0 ? 6 : d.getDay() - 1);
      dayExpensesArr[dayIdx] += amt;
    }
  });

  const netSavings = weeklyIncome - weeklyExpenses;
  const avgDaily = weeklyExpenses / 7;

  // Trova giorno di picco
  let peakDayIdx = -1;
  let peakDayAmt = 0;
  dayExpensesArr.forEach((amt, idx) => {
    if (amt > peakDayAmt) {
      peakDayAmt = amt;
      peakDayIdx = idx;
    }
  });

  // Aggiorna KPI
  document.getElementById('weeklyExpenses').textContent = formatCurrency(weeklyExpenses);
  document.getElementById('weeklyIncome').textContent = formatCurrency(weeklyIncome);
  
  const netEl = document.getElementById('weeklyNetSavings');
  netEl.textContent = (netSavings >= 0 ? '+' : '') + formatCurrency(netSavings);
  netEl.className = 'stat-val ' + (netSavings >= 0 ? 'val-income' : 'val-expense');

  document.getElementById('weeklyAvgDaily').textContent = formatCurrency(avgDaily);
  
  const topDayEl = document.getElementById('weeklyTopDay');
  if (peakDayIdx >= 0 && peakDayAmt > 0) {
    topDayEl.textContent = `Picco: ${dayNames[peakDayIdx]} (${formatCurrency(peakDayAmt)})`;
  } else {
    topDayEl.textContent = 'Nessuna spesa';
  }

  // Render lista transazioni settimana
  const listEl = document.getElementById('weeklyTxList');
  const countEl = document.getElementById('weeklyTxCount');
  listEl.innerHTML = '';
  countEl.textContent = `${weekTxs.length} moviment${weekTxs.length === 1 ? 'o' : 'i'}`;

  if (weekTxs.length === 0) {
    listEl.innerHTML = '<div class="empty-state">Nessun movimento registrato in questa settimana.</div>';
  } else {
    weekTxs.forEach(tx => {
      listEl.appendChild(createTxElement(tx, true));
    });
  }

  // Aggiorna grafici
  updateWeeklyChartsData(dayExpensesArr, catTotals);
  lucide.createIcons();
}

function initWeeklyCharts() {
  const isDark = state.darkMode;
  const textColor = isDark ? '#94a3b8' : '#64748b';
  const gridColor = isDark ? '#334155' : '#f1f5f9';
  const dayLabels = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

  // 1. Spese per Giorno (Bar Chart)
  const ctxDay = document.getElementById('weeklyDayChart').getContext('2d');
  weeklyDayChartInstance = new Chart(ctxDay, {
    type: 'bar',
    data: {
      labels: dayLabels,
      datasets: [{
        label: 'Spesa Giornaliera (€)',
        data: new Array(7).fill(0),
        backgroundColor: '#6366f1',
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: textColor } },
        x: { grid: { display: false }, ticks: { color: textColor } }
      },
      plugins: {
        legend: { display: false }
      }
    }
  });

  // 2. Categorie Settimana (Doughnut)
  const ctxCat = document.getElementById('weeklyCategoryChart').getContext('2d');
  weeklyCategoryChartInstance = new Chart(ctxCat, {
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
        legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 }, color: textColor } }
      },
      cutout: '70%'
    }
  });
}

function updateWeeklyChartsData(dayExpensesArr, catTotals) {
  if (!weeklyDayChartInstance || !weeklyCategoryChartInstance) return;

  const isDark = state.darkMode;

  // Aggiorna barre giornaliere
  weeklyDayChartInstance.data.datasets[0].data = dayExpensesArr;
  weeklyDayChartInstance.update();

  // Aggiorna ciambella categorie
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
    weeklyCategoryChartInstance.data.labels = ['Nessuna spesa'];
    weeklyCategoryChartInstance.data.datasets[0].data = [1];
    weeklyCategoryChartInstance.data.datasets[0].backgroundColor = [isDark ? '#334155' : '#e2e8f0'];
  } else {
    weeklyCategoryChartInstance.data.labels = catLabels;
    weeklyCategoryChartInstance.data.datasets[0].data = catData;
    weeklyCategoryChartInstance.data.datasets[0].backgroundColor = catColors;
  }
  weeklyCategoryChartInstance.data.datasets[0].borderColor = isDark ? '#1e293b' : '#ffffff';
  weeklyCategoryChartInstance.update();
}

function updateWeeklyCharts() {
  if (weeklyDayChartInstance) weeklyDayChartInstance.resize();
  if (weeklyCategoryChartInstance) weeklyCategoryChartInstance.resize();
}

// ==========================================
// CALCOLO STATISTICHE DASHBOARD
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
  const amountVal = parseAmount(tx.amount);

  const safeTitle = escapeHtml(tx.note) || escapeHtml(cat.name);
  const safeCatName = escapeHtml(cat.name);
  const safeDate = formatDate(tx.date);
  const safeIcon = escapeHtml(cat.icon || 'tag');
  const safeColor = escapeHtml(cat.color || '#64748b');

  const item = document.createElement('div');
  item.className = 'tx-item';
  item.innerHTML = `
    <div class="tx-left">
      <div class="tx-cat-badge" style="background-color: ${safeColor};">
        <i data-lucide="${safeIcon}" style="width: 20px; height: 20px;"></i>
      </div>
      <div class="tx-info">
        <h4>${safeTitle}</h4>
        <span>${safeCatName} • ${safeDate}</span>
      </div>
    </div>
    <div class="tx-right">
      <span class="tx-amount ${isExp ? 'expense' : 'income'}">
        ${isExp ? '-' : '+'}${formatCurrency(amountVal)}
      </span>
      ${showEditBtn ? `
        <button class="tx-btn btn-edit-tx" title="Modifica">
          <i data-lucide="pencil" style="width: 16px; height: 16px;"></i>
        </button>
      ` : ''}
      <button class="tx-btn btn-danger btn-del-tx" title="Elimina">
        <i data-lucide="trash-2" style="width: 16px; height: 16px;"></i>
      </button>
    </div>
  `;

  // Listener nativi: niente stringhe arbitrarie eseguite nell'HTML
  if (showEditBtn) {
    item.querySelector('.btn-edit-tx').addEventListener('click', () => openEditModal(tx.id));
  }
  item.querySelector('.btn-del-tx').addEventListener('click', () => deleteTx(tx.id));

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
  const amount = parseAmount(document.getElementById('txAmount').value);
  const type = document.getElementById('txType').value === 'income' ? 'income' : 'expense';
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
  annualSelectedYear = txD.getFullYear();

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

  tx.type = document.getElementById('editTxType').value === 'income' ? 'income' : 'expense';
  tx.amount = parseAmount(document.getElementById('editTxAmount').value);
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
    const safeName = escapeHtml(cat.name);
    const safeIcon = escapeHtml(cat.icon || 'tag');
    const safeColor = escapeHtml(cat.color || '#64748b');

    const item = document.createElement('div');
    item.className = 'cat-item';
    item.innerHTML = `
      <div class="cat-item-left">
        <span class="cat-badge-dot" style="background-color: ${safeColor};"></span>
        <i data-lucide="${safeIcon}" style="width: 18px; height: 18px;"></i>
        <strong>${safeName}</strong>
      </div>
      <div style="display: flex; align-items: center; gap: 12px;">
        <span class="badge-count">${txCount} moviment${txCount === 1 ? 'o' : 'i'}</span>
        ${cat.id !== 'altro' ? `
          <button class="tx-btn btn-danger btn-del-cat" title="Elimina Categoria">
            <i data-lucide="trash-2" style="width: 15px; height: 15px;"></i>
          </button>
        ` : ''}
      </div>
    `;

    const delBtn = item.querySelector('.btn-del-cat');
    if (delBtn) {
      delBtn.addEventListener('click', () => deleteCategory(cat.id));
    }

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
// GESTIONE ABBONAMENTI & SPESE RICORRENTI
// ==========================================
function setupSubscriptionForm() {
  document.getElementById('newSubForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('subName').value.trim();
    const amount = parseAmount(document.getElementById('subAmount').value);
    const category = document.getElementById('subCategory').value;
    const frequency = document.getElementById('subFrequency').value;
    const billingDay = parseInt(document.getElementById('subBillingDay').value);
    const autoAdd = document.getElementById('subAutoAdd').checked;

    if (!name || isNaN(amount) || amount <= 0) return;

    const newSub = {
      id: 'sub_' + Date.now().toString(),
      name,
      amount,
      category,
      frequency,
      billingDay,
      autoAdd,
      createdAt: new Date().toISOString()
    };

    if (!state.subscriptions) state.subscriptions = [];
    state.subscriptions.push(newSub);

    document.getElementById('subName').value = '';
    document.getElementById('subAmount').value = '';
    
    checkAndApplySubscriptions();
    refreshApp();
  });
}

function renderSubscriptionsList() {
  const listEl = document.getElementById('subListContainer');
  const countEl = document.getElementById('subListCount');
  const monthlyTotalEl = document.getElementById('subMonthlyTotal');
  const yearlyTotalEl = document.getElementById('subYearlyTotal');
  const activeCountEl = document.getElementById('subActiveCount');

  if (!state.subscriptions) state.subscriptions = [];
  listEl.innerHTML = '';

  let monthlySum = 0;
  state.subscriptions.forEach(sub => {
    const amt = parseAmount(sub.amount);
    monthlySum += (sub.frequency === 'monthly') ? amt : (amt / 12);
  });

  const yearlySum = monthlySum * 12;

  monthlyTotalEl.textContent = formatCurrency(monthlySum);
  yearlyTotalEl.textContent = formatCurrency(yearlySum);
  activeCountEl.textContent = state.subscriptions.length;
  countEl.textContent = `${state.subscriptions.length} attiv${state.subscriptions.length === 1 ? 'o' : 'i'}`;

  if (state.subscriptions.length === 0) {
    listEl.innerHTML = '<div class="empty-state">Nessun abbonamento configurato finora.</div>';
    return;
  }

  state.subscriptions.forEach(sub => {
    const cat = state.categories.find(c => c.id === sub.category) || { name: 'Altro', icon: 'repeat', color: '#4f46e5' };
    const safeName = escapeHtml(sub.name);
    const safeCatName = escapeHtml(cat.name);
    const safeIcon = escapeHtml(cat.icon || 'repeat');
    const safeColor = escapeHtml(cat.color || '#4f46e5');
    const amountVal = parseAmount(sub.amount);

    const item = document.createElement('div');
    item.className = 'tx-item';
    item.innerHTML = `
      <div class="tx-left">
        <div class="tx-cat-badge" style="background-color: ${safeColor};">
          <i data-lucide="${safeIcon}" style="width: 20px; height: 20px;"></i>
        </div>
        <div class="tx-info">
          <h4>${safeName}</h4>
          <span>${safeCatName} • Rinnovo il ${parseInt(sub.billingDay, 10)} del mese (${sub.frequency === 'monthly' ? 'Mensile' : 'Annuale'})</span>
        </div>
      </div>
      <div class="tx-right">
        <span class="renewal-badge">${sub.autoAdd ? 'Auto: Sì' : 'Auto: No'}</span>
        <span class="tx-amount expense">
          -${formatCurrency(amountVal)}
        </span>
        <button class="tx-btn btn-danger btn-del-sub" title="Elimina Abbonamento">
          <i data-lucide="trash-2" style="width: 16px; height: 16px;"></i>
        </button>
      </div>
    `;

    item.querySelector('.btn-del-sub').addEventListener('click', () => deleteSubscription(sub.id));
    listEl.appendChild(item);
  });
  lucide.createIcons();
}

window.deleteSubscription = function(subId) {
  if (confirm('Vuoi davvero eliminare questo abbonamento? I movimenti passati già inseriti rimarranno intatti.')) {
    state.subscriptions = state.subscriptions.filter(s => s.id !== subId);
    refreshApp();
  }
};

// ==========================================
// REPORT ANNUALE & ANALISI DETTAGLIATA
// ==========================================
function renderAnnualReport() {
  let annualIncome = 0;
  let annualExpenses = 0;
  const monthExpensesArr = new Array(12).fill(0);
  const monthIncomeArr = new Array(12).fill(0);
  const activeExpenseMonths = new Set();
  const categoryTotals = {};

  // Filtra transazioni dell'anno selezionato
  state.transactions.forEach(tx => {
    const d = new Date(tx.date);
    if (d.getFullYear() === annualSelectedYear) {
      const m = d.getMonth();
      if (tx.type === 'income') {
        annualIncome += tx.amount;
        monthIncomeArr[m] += tx.amount;
      } else {
        annualExpenses += tx.amount;
        monthExpensesArr[m] += tx.amount;
        activeExpenseMonths.add(m);
        categoryTotals[tx.category] = (categoryTotals[tx.category] || 0) + tx.amount;
      }
    }
  });

  const netSavings = annualIncome - annualExpenses;
  const activeMonthsCount = activeExpenseMonths.size || 1;
  const avgMonthly = annualExpenses / activeMonthsCount;

  // Calcolo tasso di risparmio %
  let savingsRate = 0;
  if (annualIncome > 0) {
    savingsRate = Math.round((netSavings / annualIncome) * 100);
  }

  // Trova mese con la spesa più alta
  let peakMonthIndex = -1;
  let peakAmount = 0;
  monthExpensesArr.forEach((amt, idx) => {
    if (amt > peakAmount) {
      peakAmount = amt;
      peakMonthIndex = idx;
    }
  });

  // Aggiorna KPI Schermata Annuale
  document.getElementById('annualTotalExpenses').textContent = formatCurrency(annualExpenses);
  document.getElementById('annualTotalIncome').textContent = formatCurrency(annualIncome);
  
  const netEl = document.getElementById('annualNetSavings');
  netEl.textContent = (netSavings >= 0 ? '+' : '') + formatCurrency(netSavings);
  netEl.className = 'stat-val ' + (netSavings >= 0 ? 'val-income' : 'val-expense');

  const savingsRateEl = document.getElementById('annualSavingsRate');
  if (annualIncome > 0) {
    savingsRateEl.textContent = `${savingsRate >= 0 ? '+' : ''}${savingsRate}% tasso di risparmio`;
    savingsRateEl.style.display = 'inline-block';
    savingsRateEl.style.color = savingsRate >= 0 ? '#065f46' : '#991b1b';
    savingsRateEl.style.background = savingsRate >= 0 ? '#d1fae5' : '#fee2e2';
  } else {
    savingsRateEl.style.display = 'none';
  }

  document.getElementById('annualAvgMonthly').textContent = formatCurrency(avgMonthly);

  const topMonthEl = document.getElementById('annualTopMonth');
  if (peakMonthIndex >= 0 && peakAmount > 0) {
    topMonthEl.textContent = `Picco: ${MONTH_NAMES[peakMonthIndex]} (${formatCurrency(peakAmount)})`;
  } else {
    topMonthEl.textContent = 'Nessuna spesa';
  }

  // Render Breakdown Categorie dell'anno con percentuali e barre di avanzamento
  renderAnnualCategoryBreakdown(categoryTotals, annualExpenses);

  // Aggiorna grafici
  updateAnnualChartsData(monthIncomeArr, monthExpensesArr, categoryTotals);
}

function renderAnnualCategoryBreakdown(catTotals, totalExpenses) {
  const container = document.getElementById('annualCategoryBreakdown');
  const countBadge = document.getElementById('annualCatRankCount');
  container.innerHTML = '';

  const catIds = Object.keys(catTotals);
  countBadge.textContent = `${catIds.length} categorie`;

  if (catIds.length === 0 || totalExpenses === 0) {
    container.innerHTML = '<div class="empty-state">Nessuna spesa registrata per quest\'anno.</div>';
    return;
  }

  const sortedCategories = catIds.map(catId => {
    const cat = state.categories.find(c => c.id === catId) || { name: 'Altro', color: '#64748b', icon: 'tag' };
    const amount = parseAmount(catTotals[catId]);
    const pct = ((amount / totalExpenses) * 100).toFixed(1);
    const monthlyAvg = amount / 12;
    return { ...cat, amount, pct, monthlyAvg };
  }).sort((a, b) => b.amount - a.amount);

  sortedCategories.forEach(item => {
    const row = document.createElement('div');
    row.className = 'annual-cat-row';
    row.innerHTML = `
      <div class="annual-cat-header">
        <div class="annual-cat-title">
          <span class="cat-badge-dot" style="background-color: ${escapeHtml(item.color)};"></span>
          <i data-lucide="${escapeHtml(item.icon || 'tag')}" style="width: 17px; height: 17px;"></i>
          <span>${escapeHtml(item.name)}</span>
        </div>
        <div class="annual-cat-stats">
          <span class="annual-cat-pct">${item.pct}% del totale (${formatCurrency(item.monthlyAvg)}/mese)</span>
          <strong class="val-expense">-${formatCurrency(item.amount)}</strong>
        </div>
      </div>
      <div class="annual-progress-bar-bg">
        <div class="annual-progress-bar-fill" style="width: ${item.pct}%; background-color: ${escapeHtml(item.color)};"></div>
      </div>
    `;
    container.appendChild(row);
  });
  lucide.createIcons();
}

// Inizializzazione Grafici Annuali
function initAnnualCharts() {
  const isDark = state.darkMode;
  const textColor = isDark ? '#94a3b8' : '#64748b';
  const gridColor = isDark ? '#334155' : '#f1f5f9';
  const monthLabels = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];

  // 1. Flusso di Cassa: Entrate vs Spese
  const ctxCashflow = document.getElementById('annualCashflowChart').getContext('2d');
  annualCashflowChartInstance = new Chart(ctxCashflow, {
    type: 'bar',
    data: {
      labels: monthLabels,
      datasets: [
        {
          label: 'Entrate',
          data: new Array(12).fill(0),
          backgroundColor: '#10b981',
          borderRadius: 4
        },
        {
          label: 'Spese',
          data: new Array(12).fill(0),
          backgroundColor: '#ef4444',
          borderRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: textColor } },
        x: { grid: { display: false }, ticks: { color: textColor } }
      },
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 }, color: textColor } }
      }
    }
  });

  // 2. Categorie Totale Anno (Doughnut)
  const ctxCatAnnual = document.getElementById('annualCategoryChart').getContext('2d');
  annualCategoryChartInstance = new Chart(ctxCatAnnual, {
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
        legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 }, color: textColor } }
      },
      cutout: '70%'
    }
  });

  // 3. Risparmio Cumulativo nell'Anno (Area Chart)
  const ctxCumulative = document.getElementById('annualCumulativeChart').getContext('2d');
  annualCumulativeChartInstance = new Chart(ctxCumulative, {
    type: 'line',
    data: {
      labels: monthLabels,
      datasets: [{
        label: 'Risparmio Cumulativo Netto (€)',
        data: new Array(12).fill(0),
        borderColor: '#4f46e5',
        backgroundColor: 'rgba(79, 70, 229, 0.1)',
        fill: true,
        tension: 0.3,
        pointBackgroundColor: '#4f46e5',
        pointRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { grid: { color: gridColor }, ticks: { color: textColor } },
        x: { grid: { display: false }, ticks: { color: textColor } }
      },
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 }, color: textColor } }
      }
    }
  });
}

function updateAnnualChartsData(monthIncomeArr, monthExpensesArr, catTotals) {
  if (!annualCashflowChartInstance || !annualCategoryChartInstance || !annualCumulativeChartInstance) return;

  const isDark = state.darkMode;

  // 1. Aggiorna Bar chart Entrate vs Spese
  annualCashflowChartInstance.data.datasets[0].data = monthIncomeArr;
  annualCashflowChartInstance.data.datasets[1].data = monthExpensesArr;
  annualCashflowChartInstance.update();

  // 2. Aggiorna Doughnut categorie annuali
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
    annualCategoryChartInstance.data.labels = ['Nessuna spesa nell\'anno'];
    annualCategoryChartInstance.data.datasets[0].data = [1];
    annualCategoryChartInstance.data.datasets[0].backgroundColor = [isDark ? '#334155' : '#e2e8f0'];
  } else {
    annualCategoryChartInstance.data.labels = catLabels;
    annualCategoryChartInstance.data.datasets[0].data = catData;
    annualCategoryChartInstance.data.datasets[0].backgroundColor = catColors;
  }
  annualCategoryChartInstance.data.datasets[0].borderColor = isDark ? '#1e293b' : '#ffffff';
  annualCategoryChartInstance.update();

  // 3. Calcolo e aggiornamento Line chart Risparmio Cumulativo
  const cumulativeSavings = new Array(12).fill(0);
  let runningTotal = 0;
  for (let i = 0; i < 12; i++) {
    runningTotal += (monthIncomeArr[i] - monthExpensesArr[i]);
    cumulativeSavings[i] = runningTotal;
  }
  annualCumulativeChartInstance.data.datasets[0].data = cumulativeSavings;
  annualCumulativeChartInstance.update();
}

function updateAnnualCharts() {
  if (annualCashflowChartInstance) annualCashflowChartInstance.resize();
  if (annualCategoryChartInstance) annualCategoryChartInstance.resize();
  if (annualCumulativeChartInstance) annualCumulativeChartInstance.resize();
}

// ==========================================
// GRAFICI DASHBOARD
// ==========================================
function initDashboardCharts() {
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

function updateDashboardCharts() {
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
// FILE SYSTEM ACCESS & SYNC (PERSISTENZA CON INDEXEDDB)
// ==========================================

let pendingHandle = null;

// Gestione database locale IndexedDB per salvare l'handle del file fisico
function openHandleDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('intasca_db', 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('handles')) {
        db.createObjectStore('handles');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveFileHandleToDB(handle) {
  try {
    const db = await openHandleDB();
    const tx = db.transaction('handles', 'readwrite');
    tx.objectStore('handles').put(handle, 'connected_file');
    return new Promise((resolve) => {
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch (err) {
    console.warn('Impossibile salvare il fileHandle in IndexedDB:', err);
  }
}

async function getFileHandleFromDB() {
  try {
    const db = await openHandleDB();
    const tx = db.transaction('handles', 'readonly');
    const req = tx.objectStore('handles').get('connected_file');
    return new Promise((resolve) => {
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch (err) {
    return null;
  }
}

async function removeFileHandleFromDB() {
  try {
    const db = await openHandleDB();
    const tx = db.transaction('handles', 'readwrite');
    tx.objectStore('handles').delete('connected_file');
  } catch (err) {
    console.warn('Impossibile rimuovere il fileHandle da IndexedDB:', err);
  }
}

// Lettura e caricamento dati dal file agganciato
async function loadDataFromFileHandle(handle) {
  fileHandle = handle;
  pendingHandle = null;

  const file = await fileHandle.getFile();
  const content = await file.text();

  if (content.trim()) {
    const parsed = JSON.parse(content);
    if (parsed.transactions && Array.isArray(parsed.transactions)) {
      state.transactions = parsed.transactions;
      if (parsed.categories) state.categories = parsed.categories;
      if (parsed.subscriptions) state.subscriptions = parsed.subscriptions;
      populateCategorySelects();
    }
  }

  setConnectedFileUI(fileHandle.name);
  checkAndApplySubscriptions();
  refreshApp();
}

// Tentativo di ricollegamento automatico all'avvio
async function tryAutoConnectFile() {
  if (!('showOpenFilePicker' in window)) return;

  const savedHandle = await getFileHandleFromDB();
  if (!savedHandle) return;

  try {
    // Verifica se il browser ha già i permessi attivi
    const status = await savedHandle.queryPermission({ mode: 'readwrite' });
    if (status === 'granted') {
      await loadDataFromFileHandle(savedHandle);
    } else {
      // Handle memorizzato ma richiede 1 clic dell'utente per sbloccare l'accesso al disco
      pendingHandle = savedHandle;
      document.getElementById('linkFileText').textContent = `Ricollega ${savedHandle.name}`;
      document.getElementById('linkFileBtn').title = `Clicca per confermare l'accesso a ${savedHandle.name}`;
    }
  } catch (err) {
    console.warn('Verifica permessi file memorizzato fallita:', err);
    await removeFileHandleFromDB();
  }
}

function setupFileSystemSync() {
  const linkFileBtn = document.getElementById('linkFileBtn');
  const unlinkFileBtn = document.getElementById('unlinkFileBtn');

  // Esegui la verifica automatica all'avvio
  tryAutoConnectFile();

  linkFileBtn.addEventListener('click', async () => {
    if ('showOpenFilePicker' in window) {
      try {
        // Se c'è già il file memorizzato in attesa di sblocco, chiedi solo il permesso con 1 clic senza riaprire la cartella
        if (pendingHandle) {
          const status = await pendingHandle.requestPermission({ mode: 'readwrite' });
          if (status === 'granted') {
            await loadDataFromFileHandle(pendingHandle);
            return;
          }
        }

        // Altrimenti apri il selettore per scegliere un nuovo file
        const [handle] = await window.showOpenFilePicker({
          types: [{
            description: 'File InTasca JSON',
            accept: { 'application/json': ['.json'] }
          }],
          multiple: false
        });

        await saveFileHandleToDB(handle);
        await loadDataFromFileHandle(handle);
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error(err);
          alert('Errore durante il collegamento del file.');
        }
      }
    } else {
      document.getElementById('fileInput').click();
    }
  });

  unlinkFileBtn.addEventListener('click', async () => {
    fileHandle = null;
    pendingHandle = null;
    await removeFileHandleFromDB();
    document.getElementById('fileNoticeBar').style.display = 'none';
    document.getElementById('linkFileText').textContent = 'Collega File';
    document.getElementById('linkFileBtn').title = 'Collega un file sul tuo computer';
    lucide.createIcons();
  });
}

function setConnectedFileUI(fileName) {
  document.getElementById('fileNoticeBar').style.display = 'flex';
  document.getElementById('connectedFileName').textContent = fileName;
  document.getElementById('linkFileText').textContent = 'File Collegato';
  document.getElementById('linkFileBtn').title = `File sincronizzato: ${fileName}`;
  lucide.createIcons();
}

async function writeDirectlyToFile() {
  if (!fileHandle) return;
  try {
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(state, null, 2));
    await writable.close();
  } catch (err) {
    console.warn('Scrittura su file fallita o permessi scaduti:', err);
  }
}

// Esportazione manuale JSON
document.getElementById('exportBtn').addEventListener('click', () => {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", `intasca_${new Date().toISOString().split('T')[0]}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
});

// Importazione manuale JSON
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
        if (imported.subscriptions) state.subscriptions = imported.subscriptions;
        if (typeof imported.darkMode !== 'undefined') {
          state.darkMode = imported.darkMode;
          applyTheme(state.darkMode);
        }
        populateCategorySelects();
        checkAndApplySubscriptions();
        refreshApp();
        alert('Dati caricati con successo!');
      } else {
        alert('Formato file non valido.');
      }
    } catch (err) {
      alert('Errore nella lettura del file JSON.');
    }
  };
  reader.readAsText(file);
});
