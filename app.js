/* ═══════════════════════════════════════════
   INDEXEDDB — DATA LAYER
   ═══════════════════════════════════════════ */
var APP_VERSION = '1.0.2';
var PATCHNOTES = [
  {
    version: '1.0.2',
    date: '2026-04-08',
    changes: [
      'Fixed calendar last hour stuck at 22:00 when sleep time is 00:00',
      'Removed routine blocks — recurring tasks now use preferred time directly',
      'Added patchnotes system — version visible in header and Settings'
    ]
  },
  {
    version: '1.0.1',
    date: '2026-04-08',
    changes: [
      'Fixed refresh button calling non-existent functions',
      'Added live cache version display in Settings'
    ]
  },
  {
    version: '1.0.0',
    date: '2026-04-01',
    changes: [
      'Phase 10.5: Recurring task preferred start time',
      'Refresh button in header',
      'Automated SW cache version bumping'
    ]
  }
];

var DB_NAME = 'KrasbauerOS';
var DB_VERSION = 1;
var db = null;

var DEFAULT_DOMAINS = [
  { id: 'body', name: 'Body', icon: '🏃', color: '#00D4AA', alertDays: 5, order: 0 },
  { id: 'mind', name: 'Mind', icon: '🧠', color: '#7B61FF', alertDays: 5, order: 1 },
  { id: 'work', name: 'Work', icon: '💼', color: '#3B82F6', alertDays: 3, order: 2 },
  { id: 'family', name: 'Family', icon: '👨‍👩‍👧', color: '#F59E0B', alertDays: 3, order: 3 },
  { id: 'social', name: 'Social', icon: '🤝', color: '#EC4899', alertDays: 7, order: 4 },
  { id: 'environment', name: 'Environment', icon: '🏠', color: '#84CC16', alertDays: 5, order: 5 },
  { id: 'passions', name: 'Passions', icon: '🔥', color: '#EF4444', alertDays: 5, order: 6 },
  { id: 'growth', name: 'Growth', icon: '🌱', color: '#06B6D4', alertDays: 7, order: 7 }
];

var DEFAULT_SETTINGS = {
  id: 'main',
  wakeTime: '06:00',
  sleepTime: '23:00',
  ritualAlarmTime: '21:00',
  quietHoursStart: '23:00',
  quietHoursEnd: '06:00',
  notificationsEnabled: true
};

function openDB() {
  return new Promise(function(resolve, reject) {
    var request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = function(event) {
      var db = event.target.result;

      // Tasks store
      if (!db.objectStoreNames.contains('tasks')) {
        var taskStore = db.createObjectStore('tasks', { keyPath: 'id' });
        taskStore.createIndex('domain', 'domain', { unique: false });
        taskStore.createIndex('status', 'status', { unique: false });
        taskStore.createIndex('type', 'type', { unique: false });
        taskStore.createIndex('priority', 'priority', { unique: false });
        taskStore.createIndex('archived', 'archived', { unique: false });
        taskStore.createIndex('dueDate', 'dueDate', { unique: false });
      }

      // Projects store
      if (!db.objectStoreNames.contains('projects')) {
        var projStore = db.createObjectStore('projects', { keyPath: 'id' });
        projStore.createIndex('domain', 'domain', { unique: false });
        projStore.createIndex('archived', 'archived', { unique: false });
      }

      // Calendar slots store
      if (!db.objectStoreNames.contains('calendar_slots')) {
        var calStore = db.createObjectStore('calendar_slots', { keyPath: 'id' });
        calStore.createIndex('date', 'date', { unique: false });
        calStore.createIndex('taskId', 'taskId', { unique: false });
      }

      // Routines store
      if (!db.objectStoreNames.contains('routines')) {
        db.createObjectStore('routines', { keyPath: 'id' });
      }

      // Domains store
      if (!db.objectStoreNames.contains('domains')) {
        var domStore = db.createObjectStore('domains', { keyPath: 'id' });
        domStore.createIndex('order', 'order', { unique: false });
      }

      // Daily logs store
      if (!db.objectStoreNames.contains('daily_logs')) {
        var logStore = db.createObjectStore('daily_logs', { keyPath: 'date' });
      }

      // Settings store
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'id' });
      }

      // Alarms store
      if (!db.objectStoreNames.contains('alarms')) {
        var alarmStore = db.createObjectStore('alarms', { keyPath: 'id' });
        alarmStore.createIndex('triggerTime', 'triggerTime', { unique: false });
        alarmStore.createIndex('taskId', 'taskId', { unique: false });
      }
    };

    request.onsuccess = function(event) {
      resolve(event.target.result);
    };

    request.onerror = function(event) {
      console.error('[DB] Open error:', event.target.error);
      reject(event.target.error);
    };
  });
}

/* ─── Generic CRUD helpers ─── */
function dbPut(storeName, data) {
  return new Promise(function(resolve, reject) {
    var tx = db.transaction(storeName, 'readwrite');
    var store = tx.objectStore(storeName);
    var req = store.put(data);
    req.onsuccess = function() { resolve(data); };
    req.onerror = function() { reject(req.error); };
  });
}

function dbGet(storeName, key) {
  return new Promise(function(resolve, reject) {
    var tx = db.transaction(storeName, 'readonly');
    var store = tx.objectStore(storeName);
    var req = store.get(key);
    req.onsuccess = function() { resolve(req.result || null); };
    req.onerror = function() { reject(req.error); };
  });
}

function dbGetAll(storeName) {
  return new Promise(function(resolve, reject) {
    var tx = db.transaction(storeName, 'readonly');
    var store = tx.objectStore(storeName);
    var req = store.getAll();
    req.onsuccess = function() { resolve(req.result || []); };
    req.onerror = function() { reject(req.error); };
  });
}

function dbDelete(storeName, key) {
  return new Promise(function(resolve, reject) {
    var tx = db.transaction(storeName, 'readwrite');
    var store = tx.objectStore(storeName);
    var req = store.delete(key);
    req.onsuccess = function() { resolve(); };
    req.onerror = function() { reject(req.error); };
  });
}

function dbClear(storeName) {
  return new Promise(function(resolve, reject) {
    var tx = db.transaction(storeName, 'readwrite');
    var store = tx.objectStore(storeName);
    var req = store.clear();
    req.onsuccess = function() { resolve(); };
    req.onerror = function() { reject(req.error); };
  });
}

function dbCount(storeName) {
  return new Promise(function(resolve, reject) {
    var tx = db.transaction(storeName, 'readonly');
    var store = tx.objectStore(storeName);
    var req = store.count();
    req.onsuccess = function() { resolve(req.result); };
    req.onerror = function() { reject(req.error); };
  });
}

/* ─── Seed default data on first run ─── */
async function seedDefaults() {
  // Seed domains if empty
  var domainCount = await dbCount('domains');
  if (domainCount === 0) {
    for (var i = 0; i < DEFAULT_DOMAINS.length; i++) {
      await dbPut('domains', DEFAULT_DOMAINS[i]);
    }
    console.log('[DB] Seeded default domains');
  }

  // Seed settings if empty
  var settings = await dbGet('settings', 'main');
  if (!settings) {
    await dbPut('settings', DEFAULT_SETTINGS);
    console.log('[DB] Seeded default settings');
  }
}

/* ─── Generate unique IDs ─── */
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
}

/* ═══════════════════════════════════════════
   APP STATE
   ═══════════════════════════════════════════ */
var appDomains = [];
var appSettings = {};
var allTasks = [];

async function loadAllTasks() {
  allTasks = await dbGetAll('tasks');
}

/* ═══════════════════════════════════════════
   INIT — Boot the app
   ═══════════════════════════════════════════ */
async function initApp() {
  try {
    db = await openDB();
    console.log('[DB] Connected');

    await seedDefaults();
    await loadAllTasks();

    // Load domains and settings into memory
    appDomains = await dbGetAll('domains');
    appDomains.sort(function(a, b) { return a.order - b.order; });

    appSettings = await dbGet('settings', 'main');

    // Render UI
    renderDomainBars();
    renderSettingsDomainList();
    renderDomainFilterPills();
    loadSettingsUI();
    if (!localStorage.getItem('kos-onboarded')) showOnboarding();
    updateGreeting();
    renderPatchnotes();
    await renderTaskList();
    await renderCalendar();
    await renderDashboardToday();
    await renderProjectList();
    await checkMidnightRollover();

    console.log('[App] Initialized — ' + appDomains.length + ' domains loaded');
  } catch (err) {
    console.error('[App] Init failed:', err);
  }
}

/* ═══════════════════════════════════════════
   SERVICE WORKER
   ═══════════════════════════════════════════ */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js')
    .then(function(reg) { console.log('[SW] Registered:', reg.scope); })
    .catch(function(err) { console.error('[SW] Failed:', err); });
}

/* ═══════════════════════════════════════════
   PWA INSTALL
   ═══════════════════════════════════════════ */
var deferredPrompt = null;

window.addEventListener('beforeinstallprompt', function(e) {
  e.preventDefault();
  deferredPrompt = e;
  if (!localStorage.getItem('kos-install-dismissed')) {
    document.getElementById('install-prompt').style.display = 'flex';
  }
});

function installApp() {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(function(result) {
      console.log('[PWA] Install:', result.outcome);
      deferredPrompt = null;
      document.getElementById('install-prompt').style.display = 'none';
    });
  }
}

function dismissInstall() {
  document.getElementById('install-prompt').style.display = 'none';
  localStorage.setItem('kos-install-dismissed', 'true');
}

/* ═══════════════════════════════════════════
   TAB NAVIGATION
   ═══════════════════════════════════════════ */
var tabs = ['dashboard', 'tasks', 'calendar', 'projects'];
var tabBtns = document.querySelectorAll('.tab-btn');
var tabBar = document.getElementById('tab-bar');

tabBtns.forEach(function(btn, index) {
  btn.addEventListener('click', function() {
    switchTab(btn.dataset.tab, index);
  });
});

function switchTab(tabName, index) {
  tabBtns.forEach(function(b) { b.classList.remove('active'); });
  tabBtns[index].classList.add('active');
  tabBar.dataset.active = index;
  document.querySelectorAll('.tab-panel').forEach(function(p) { p.classList.remove('active'); });
  document.getElementById('panel-' + tabName).classList.add('active');
}

/* ═══════════════════════════════════════════
   DASHBOARD SWIPE
   ═══════════════════════════════════════════ */
var dashTrack = document.getElementById('dashboard-track');
var dashDots = document.querySelectorAll('.swipe-dot');
var currentPanel = 0;
var touchStartX = 0;
var isDragging = false;

dashTrack.addEventListener('touchstart', function(e) {
  touchStartX = e.changedTouches[0].screenX;
  isDragging = true;
}, { passive: true });

dashTrack.addEventListener('touchend', function(e) {
  if (!isDragging) return;
  isDragging = false;
  var diff = touchStartX - e.changedTouches[0].screenX;
  if (Math.abs(diff) > 50) {
    if (diff > 0 && currentPanel < 1) setDashPanel(1);
    else if (diff < 0 && currentPanel > 0) setDashPanel(0);
  }
}, { passive: true });

dashDots.forEach(function(dot) {
  dot.addEventListener('click', function() {
    setDashPanel(parseInt(dot.dataset.panel));
  });
});

function setDashPanel(index) {
  currentPanel = index;
  dashTrack.style.transform = 'translateX(-' + (index * 100) + '%)';
  dashDots.forEach(function(d, i) { d.classList.toggle('active', i === index); });
}

/* ═══════════════════════════════════════════
   GREETING
   ═══════════════════════════════════════════ */
function updateGreeting() {
  var now = new Date();
  var hour = now.getHours();
  var greeting = 'Good morning';
  if (hour >= 12 && hour < 18) greeting = 'Good afternoon';
  if (hour >= 18) greeting = 'Good evening';

  var days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  document.getElementById('today-date').textContent =
    days[now.getDay()] + ', ' + months[now.getMonth()] + ' ' + now.getDate() + ', ' + now.getFullYear();

  document.querySelector('.dashboard-greeting h1').innerHTML =
    greeting + ', <span>Krasbauer</span>';
}

setInterval(updateGreeting, 60000);

/* ═══════════════════════════════════════════
   DASHBOARD — Today's Agenda + Overcommitment
   ═══════════════════════════════════════════ */
async function renderDashboardToday() {
  if (!db) return;

  var todayStr = calDateStr(new Date());
  var allSlots = await dbGetAll('calendar_slots');
  var todaySlots = allSlots.filter(function(s) { return s.date === todayStr; });

  // Sort by start time
  todaySlots.sort(function(a, b) {
    return (a.startHour * 60 + (a.startMin || 0)) - (b.startHour * 60 + (b.startMin || 0));
  });

  var container = document.getElementById('dash-today-list');
  var emptyState = document.getElementById('dash-today-empty');

  if (todaySlots.length === 0) {
    container.innerHTML = '';
    emptyState.style.display = '';
    document.getElementById('overcommit-warning').style.display = 'none';
    return;
  }

  emptyState.style.display = 'none';
  var html = '';
  var totalMinutes = 0;

  for (var i = 0; i < todaySlots.length; i++) {
    var slot = todaySlots[i];
    var task = await dbGet('tasks', slot.taskId);
    if (!task) continue;

    var domain = appDomains.find(function(d) { return d.id === task.domain; });
    var color = domain ? domain.color : '#555';
    var isDone = task.status === 'done';
    var timeLabel = formatSlotTime(slot.startHour, slot.startMin);
    var dur = task.duration || 30;
    totalMinutes += dur;

    html += '<div class="dash-agenda-item' + (isDone ? ' is-done' : '') + '" onclick="openTaskForm(\'' + task.id + '\')">' +
      '<div class="dash-agenda-time">' + timeLabel + '</div>' +
      '<div class="dash-agenda-color" style="background:' + color + '"></div>' +
      '<div class="dash-agenda-info">' +
        '<div class="dash-agenda-title">' + escapeHtml(task.title) + '</div>' +
        '<div class="dash-agenda-dur">' + dur + ' min · ' + (domain ? domain.icon + ' ' + domain.name : '') + '</div>' +
      '</div>' +
      '<button class="dash-agenda-check' + (isDone ? ' checked' : '') + '" onclick="event.stopPropagation();toggleTaskDone(\'' + task.id + '\')">' +
        (isDone ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><polyline points="20 6 9 17 4 12"></polyline></svg>' : '') +
      '</button>' +
    '</div>';
  }

  container.innerHTML = html;

  // Overcommitment check
  var wakeH = getWakeHour();
  var sleepH = getSleepHour();
  var availableMinutes = (sleepH - wakeH) * 60;
  var overcommitEl = document.getElementById('overcommit-warning');
  var overcommitText = document.getElementById('overcommit-text');

  if (totalMinutes > availableMinutes) {
    var overBy = totalMinutes - availableMinutes;
    var overHrs = Math.floor(overBy / 60);
    var overMins = overBy % 60;
    overcommitText.textContent = totalMinutes + ' min scheduled, only ' + availableMinutes + ' min available. Over by ' +
      (overHrs > 0 ? overHrs + 'h ' : '') + overMins + 'm.';
    overcommitEl.style.display = '';
  } else {
    overcommitEl.style.display = 'none';
  }
}

/* ═══════════════════════════════════════════
   DOMAIN BARS (Dashboard Overview)
   ═══════════════════════════════════════════ */
async function renderDomainBars() {
  if (!db) return;
  var container = document.getElementById('domain-bars');
  if (!container) return;

  var now = Date.now();
  var sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);

  // Count completions per domain (last 7 days)
  var counts = {};
  appDomains.forEach(function(d) { counts[d.id] = 0; });
  allTasks.forEach(function(t) {
    if (t.status === 'done' && t.completedAt && t.completedAt >= sevenDaysAgo) {
      if (counts.hasOwnProperty(t.domain)) counts[t.domain]++;
    }
  });

  // Find last activity date per domain
  var lastActivity = {};
  appDomains.forEach(function(d) { lastActivity[d.id] = 0; });
  allTasks.forEach(function(t) {
    var ts = t.completedAt || t.updatedAt || t.createdAt || 0;
    if (lastActivity.hasOwnProperty(t.domain) && ts > lastActivity[t.domain]) {
      lastActivity[t.domain] = ts;
    }
  });

  var maxCount = Math.max(1, Math.max.apply(null, appDomains.map(function(d) { return counts[d.id] || 0; })));
  var html = '';

  appDomains.forEach(function(d) {
    var c = counts[d.id] || 0;
    var pct = (c / maxCount) * 100;
    var daysSince = lastActivity[d.id] > 0 ? Math.floor((now - lastActivity[d.id]) / (24 * 60 * 60 * 1000)) : 999;
    var isNeglected = daysSince >= (d.alertDays || 5);

    html += '<div class="domain-bar-row">' +
      '<div class="domain-bar-label">' +
        '<span class="domain-dot" style="background:' + d.color + '"></span>' +
        d.name +
      '</div>' +
      '<div class="domain-bar-track">' +
        '<div class="domain-bar-fill" style="width:' + pct + '%;background:' + d.color + '"></div>' +
      '</div>' +
      '<div class="domain-bar-count">' + c + '</div>' +
      '<div class="domain-bar-alert' + (isNeglected ? '' : ' hidden') + '" title="No activity in ' + daysSince + ' days"></div>' +
    '</div>';
  });

  container.innerHTML = html;
}

/* ═══════════════════════════════════════════
   TASK SYSTEM — CRUD
   ═══════════════════════════════════════════ */
var PRIORITY_LABELS = {
  'do-first': '🔴 Do First',
  'schedule': '🟡 Schedule',
  'delegate': '🟠 Delegate',
  'eliminate': '⚪ Eliminate'
};

var STATUS_LABELS = {
  'todo': 'Todo',
  'scheduled': 'Scheduled',
  'inprogress': 'In Progress',
  'done': 'Done',
  'reported': 'Reported'
};

var DURATION_LABELS = {
  15: '15m', 30: '30m', 60: '1h', 120: '2h'
};

/* ─── Filter & Sort State ─── */
var currentFilter = 'all';
var currentDomainFilter = 'all';
var currentSort = 'priority'; // priority, date, domain, created
var showArchived = false;
var sortOptions = ['priority', 'date', 'domain', 'created'];
var sortLabels = { priority: 'Sorted by priority', date: 'Sorted by due date', domain: 'Sorted by domain', created: 'Sorted by newest' };

function setFilter(filter, btn) {
  currentFilter = filter;
  document.querySelectorAll('#filter-row .filter-pill').forEach(function(p) { p.classList.remove('active'); });
  btn.classList.add('active');
  applyFilters();
}

function setDomainFilter(domainId, btn) {
  currentDomainFilter = domainId;
  document.querySelectorAll('#domain-filter-row .filter-pill').forEach(function(p) { p.classList.remove('active'); });
  btn.classList.add('active');
  applyFilters();
}

function cycleSort() {
  var idx = sortOptions.indexOf(currentSort);
  currentSort = sortOptions[(idx + 1) % sortOptions.length];
  document.getElementById('sort-info').textContent = sortLabels[currentSort];
  applyFilters();
}

function toggleShowArchived() {
  showArchived = !showArchived;
  document.getElementById('archive-toggle-text').textContent = showArchived ? 'Hide archived' : 'Show archived';
  applyFilters();
}

async function applyFilters() {
  await renderTaskList();
}

/* ─── Render domain filter pills ─── */
function renderDomainFilterPills() {
  var container = document.getElementById('domain-filter-row');
  if (!container) return;
  var html = '<button class="filter-pill active" onclick="setDomainFilter(\'all\',this)">All Domains</button>';
  appDomains.forEach(function(d) {
    html += '<button class="filter-pill" onclick="setDomainFilter(\'' + d.id + '\',this)">' + d.icon + ' ' + d.name + '</button>';
  });
  container.innerHTML = html;
}

/* ─── Render task list ─── */
async function renderTaskList() {


  // Archive filter
  var tasks = allTasks.filter(function(t) {
    if (showArchived) return true;
    return !t.archived;
  });

  // Search filter
  var query = (document.getElementById('task-search') ? document.getElementById('task-search').value : '').toLowerCase().trim();
  if (query) {
    tasks = tasks.filter(function(t) {
      return t.title.toLowerCase().indexOf(query) >= 0 ||
        (t.notes && t.notes.toLowerCase().indexOf(query) >= 0);
    });
  }

  // Status/Priority filter
  if (currentFilter !== 'all') {
    var parts = currentFilter.split(':');
    var filterType = parts[0];
    var filterVal = parts[1];
    tasks = tasks.filter(function(t) {
      if (filterType === 'status') return t.status === filterVal;
      if (filterType === 'priority') return t.priority === filterVal;
      if (filterType === 'type') return t.type === filterVal;
      return true;
    });
  }

  // Domain filter
  if (currentDomainFilter !== 'all') {
    tasks = tasks.filter(function(t) { return t.domain === currentDomainFilter; });
  }

  // Sort
  var priorityOrder = { 'do-first': 0, 'schedule': 1, 'delegate': 2, 'eliminate': 3 };
  tasks.sort(function(a, b) {
    // Done/archived always at bottom
    if (a.status === 'done' && b.status !== 'done') return 1;
    if (b.status === 'done' && a.status !== 'done') return -1;

    if (currentSort === 'priority') {
      var pa = priorityOrder[a.priority] || 1;
      var pb = priorityOrder[b.priority] || 1;
      if (pa !== pb) return pa - pb;
      return (b.createdAt || 0) - (a.createdAt || 0);
    }
    if (currentSort === 'date') {
      var da = a.dueDate || '9999';
      var dateB = b.dueDate || '9999';
      return da.localeCompare(dateB);
    }
    if (currentSort === 'domain') {
      var domA = appDomains.findIndex(function(d) { return d.id === a.domain; });
      var domB = appDomains.findIndex(function(d) { return d.id === b.domain; });
      if (domA !== domB) return domA - domB;
      return (b.createdAt || 0) - (a.createdAt || 0);
    }
    if (currentSort === 'created') {
      return (b.createdAt || 0) - (a.createdAt || 0);
    }
    return 0;
  });

  var container = document.getElementById('task-list-container');
  var emptyState = document.getElementById('tasks-empty');
  var countEl = document.getElementById('task-count');

  var totalActive = allTasks.filter(function(t) { return !t.archived && t.status !== 'done'; }).length;
  var totalDone = allTasks.filter(function(t) { return !t.archived && t.status === 'done'; }).length;
  var totalArchived = allTasks.filter(function(t) { return t.archived; }).length;
  countEl.textContent = totalActive + ' active' +
    (totalDone ? ' · ' + totalDone + ' done' : '') +
    (totalArchived ? ' · ' + totalArchived + ' archived' : '');

  if (tasks.length === 0) {
    container.innerHTML = '';
    emptyState.style.display = '';
    return;
  }

  emptyState.style.display = 'none';

  var html = '<div class="task-list">';
  tasks.forEach(function(task) {
    var domain = appDomains.find(function(d) { return d.id === task.domain; });
    var domainColor = domain ? domain.color : '#555';
    var isDone = task.status === 'done';
    var durLabel = task.duration ? (DURATION_LABELS[task.duration] || task.duration + 'm') : '';
    var floatClass = (task.status === 'todo' || task.status === 'reported') ? ' is-floating' : (task.status === 'scheduled' ? ' is-scheduled' : '');

    html += '<div class="task-card' + (isDone ? ' status-done' : '') + (task.archived ? ' status-done' : '') + floatClass + '" data-id="' + task.id + '">' +
      '<div class="swipe-action swipe-action-right">✓ Done</div>' +
      '<div class="swipe-action swipe-action-left">Archive</div>' +
      '<div class="task-card-inner">' +
        '<button class="task-card-check' + (isDone ? ' checked' : '') + '" onclick="event.stopPropagation();toggleTaskDone(\'' + task.id + '\')">' +
          (isDone ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><polyline points="20 6 9 17 4 12"></polyline></svg>' : '') +
        '</button>' +
        '<div class="domain-stripe" style="background:' + domainColor + '"></div>' +
        '<div class="task-card-body" onclick="openTaskForm(\'' + task.id + '\')">' +
          '<div class="task-card-title">' + escapeHtml(task.title) +
            (task.archived ? ' <span style="font-size:10px;color:var(--text-tertiary);">(archived)</span>' : '') +
            (task.rolloverCount > 0 ? ' <span style="font-size:10px;color:#A855F7;">↻' + task.rolloverCount + '</span>' : '') +
          '</div>' +
          '<div class="task-card-meta">' +
            '<span class="task-chip chip-priority-' + task.priority + '">' + (PRIORITY_LABELS[task.priority] || task.priority) + '</span>' +
            '<span class="task-chip chip-status-' + task.status + '">' + (STATUS_LABELS[task.status] || task.status) + '</span>' +
            (durLabel ? '<span class="task-chip chip-duration">⏱ ' + durLabel + '</span>' : '') +
            (task.dueDate ? '<span class="task-chip chip-duration">📅 ' + task.dueDate + '</span>' : '') +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  });
  html += '</div>';

  container.innerHTML = html;

  // Attach swipe handlers
  initSwipeActions();
}

/* ─── Swipe gesture on task cards ─── */
function initSwipeActions() {
  var cards = document.querySelectorAll('.task-card');
  cards.forEach(function(card) {
    var inner = card.querySelector('.task-card-inner');
    if (!inner) return;

    var startX = 0;
    var startY = 0;
    var currentX = 0;
    var swiping = false;
    var swipeLocked = false;
    var threshold = 80;

    inner.addEventListener('touchstart', function(e) {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      currentX = 0;
      swiping = true;
      swipeLocked = false;
      inner.style.transition = 'none';
    }, { passive: true });

    inner.addEventListener('touchmove', function(e) {
      if (!swiping) return;
      var deltaX = e.touches[0].clientX - startX;
      var deltaY = e.touches[0].clientY - startY;
      // If not yet locked, decide direction on first significant movement
      if (!swipeLocked) {
        if (Math.abs(deltaX) < 5 && Math.abs(deltaY) < 5) return;
        if (Math.abs(deltaY) > Math.abs(deltaX)) { swiping = false; return; }
        swipeLocked = true;
      }
      currentX = deltaX;
      var clampedX = Math.max(-120, Math.min(120, currentX));
      inner.style.transform = 'translateX(' + clampedX + 'px)';
    }, { passive: true });

    inner.addEventListener('touchend', function() {
      if (!swiping) return;
      swiping = false;
      inner.style.transition = 'transform 0.2s var(--ease-out)';

      var taskId = card.dataset.id;

      if (currentX > threshold) {
        // Swipe right → mark done
        inner.style.transform = 'translateX(120px)';
        setTimeout(function() {
          toggleTaskDone(taskId);
        }, 200);
      } else if (currentX < -threshold) {
        // Swipe left → archive
        inner.style.transform = 'translateX(-120px)';
        setTimeout(function() {
          archiveTask(taskId);
        }, 200);
      } else {
        inner.style.transform = 'translateX(0)';
      }
    }, { passive: true });
  });
}

/* ─── Archive task ─── */
async function archiveTask(taskId) {
  var task = await dbGet('tasks', taskId);
  if (!task) return;
  try {
    task.archived = !task.archived;
    await dbPut('tasks', task);
    await loadAllTasks();
    await renderTaskList();
    renderDomainBars();
    showToast(task.archived ? 'Task archived' : 'Task unarchived');
  } catch (err) {
    console.error('[archiveTask]', err);
    showToast('Action failed — try again');
  }
}

function escapeHtml(str) {
  var div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/* ─── Toggle task done ─── */
async function toggleTaskDone(taskId) {
  var task = await dbGet('tasks', taskId);
  if (!task) return;
  try {
    task.status = task.status === 'done' ? 'todo' : 'done';
    if (task.status === 'done') task.completedAt = Date.now();
    task.updatedAt = Date.now();
    await dbPut('tasks', task);
    await loadAllTasks();
    await renderTaskList();
    await renderDashboardToday();
    await renderCalendar();
    renderDomainBars();
  } catch (err) {
    console.error('[toggleTaskDone]', err);
    showToast('Action failed — try again');
  }
}

/* ─── Task Form ─── */
function openTaskForm(editId, presetProjectId) {
  var backdrop = document.getElementById('task-form-backdrop');
  var sheet = document.getElementById('task-form-sheet');
  var titleEl = document.getElementById('task-form-title');
  var deleteBtn = document.getElementById('task-form-delete');

  renderDomainChips();

  if (editId) {
    dbGet('tasks', editId).then(function(task) {
      if (!task) return;
      titleEl.textContent = 'Edit Task';
      deleteBtn.classList.add('visible');
      document.getElementById('tf-id').value = task.id;
      document.getElementById('tf-project-id').value = task.projectId || '';
      document.getElementById('tf-title').value = task.title;
      document.getElementById('tf-due').value = task.dueDate || '';
      document.getElementById('tf-notes').value = task.notes || '';
      document.getElementById('tf-muted').checked = !!task.muted;
      document.getElementById('tf-status-group').style.display = '';

      selectChip('tf-domain-chips', task.domain);
      selectChip('tf-type-chips', task.type);
      selectChip('tf-priority-chips', task.priority);
      selectChip('tf-status-chips', task.status);

      // Recurrence fields
      if (task.type === 'recurring') {
        document.getElementById('tf-recurrence-group').style.display = '';
        selectChip('tf-recurrence-chips', task.recurrence || 'daily');
        document.getElementById('tf-recurring-time').value = task.preferredTime || '08:00';
      } else {
        document.getElementById('tf-recurrence-group').style.display = 'none';
      }

      var stdDurations = ['15', '30', '60', '120'];
      if (stdDurations.indexOf(String(task.duration)) >= 0) {
        selectChip('tf-duration-chips', String(task.duration));
        document.getElementById('tf-duration-custom').style.display = 'none';
      } else {
        selectChip('tf-duration-chips', 'custom');
        document.getElementById('tf-duration-custom').style.display = '';
        document.getElementById('tf-duration-custom').value = task.duration || '';
      }

      backdrop.classList.add('open');
      sheet.classList.add('open');
    });
  } else {
    titleEl.textContent = 'New Task';
    deleteBtn.classList.remove('visible');
    document.getElementById('tf-id').value = '';
    document.getElementById('tf-project-id').value = presetProjectId || '';
    document.getElementById('tf-title').value = '';
    document.getElementById('tf-due').value = '';
    document.getElementById('tf-notes').value = '';
    document.getElementById('tf-muted').checked = false;
    document.getElementById('tf-duration-custom').style.display = 'none';
    document.getElementById('tf-status-group').style.display = 'none';
    document.getElementById('tf-recurrence-group').style.display = 'none';
    document.getElementById('tf-recurring-time').value = '08:00';

    selectChip('tf-domain-chips', appDomains.length > 0 ? appDomains[0].id : '');
    selectChip('tf-type-chips', 'one-off');
    selectChip('tf-priority-chips', 'schedule');
    selectChip('tf-duration-chips', '30');
    selectChip('tf-status-chips', 'todo');

    backdrop.classList.add('open');
    sheet.classList.add('open');
    setTimeout(function() { document.getElementById('tf-title').focus(); }, 350);
  }
}

function closeTaskForm() {
  document.getElementById('task-form-backdrop').classList.remove('open');
  document.getElementById('task-form-sheet').classList.remove('open');
}

function renderDomainChips() {
  var container = document.getElementById('tf-domain-chips');
  var html = '';
  appDomains.forEach(function(d) {
    html += '<button class="chip-option domain-chip" data-value="' + d.id + '" ' +
      'style="--dc:' + d.color + '">' + d.icon + ' ' + d.name + '</button>';
  });
  container.innerHTML = html;
  initChipSelector('tf-domain-chips');
}

/* ─── Chip selector logic ─── */
function initChipSelector(containerId) {
  var container = document.getElementById(containerId);
  if (!container) return;
  var chips = container.querySelectorAll('.chip-option');
  chips.forEach(function(chip) {
    chip.addEventListener('click', function() {
      chips.forEach(function(c) {
        c.classList.remove('selected');
        if (containerId === 'tf-domain-chips') {
          c.style.borderColor = '';
          c.style.background = '';
          c.style.color = '';
        }
      });
      chip.classList.add('selected');

      if (containerId === 'tf-domain-chips') {
        var color = chip.style.getPropertyValue('--dc');
        if (color) {
          chip.style.borderColor = color;
          chip.style.background = color + '22';
          chip.style.color = '#fff';
        }
      }

      if (containerId === 'tf-duration-chips') {
        var customInput = document.getElementById('tf-duration-custom');
        if (chip.dataset.value === 'custom') {
          customInput.style.display = '';
          customInput.focus();
        } else {
          customInput.style.display = 'none';
        }
      }
    });
  });
}

function selectChip(containerId, value) {
  var container = document.getElementById(containerId);
  if (!container) return;
  var chips = container.querySelectorAll('.chip-option');
  chips.forEach(function(c) {
    c.classList.remove('selected');
    if (containerId === 'tf-domain-chips') {
      c.style.borderColor = '';
      c.style.background = '';
      c.style.color = '';
    }
  });
  var target = container.querySelector('[data-value="' + value + '"]');
  if (target) {
    target.classList.add('selected');
    if (containerId === 'tf-domain-chips') {
      var color = target.style.getPropertyValue('--dc');
      if (color) {
        target.style.borderColor = color;
        target.style.background = color + '22';
        target.style.color = '#fff';
      }
    }
  }
}

function getSelectedChip(containerId) {
  var container = document.getElementById(containerId);
  if (!container) return '';
  var sel = container.querySelector('.chip-option.selected');
  return sel ? sel.dataset.value : '';
}

initChipSelector('tf-type-chips');
initChipSelector('tf-priority-chips');
initChipSelector('tf-duration-chips');
initChipSelector('tf-status-chips');
initChipSelector('tf-recurrence-chips');

/* ─── Save task ─── */
async function saveTaskForm() {
  var editId = document.getElementById('tf-id').value;
  var projectId = document.getElementById('tf-project-id').value || null;
  var title = document.getElementById('tf-title').value.trim();
  var domain = getSelectedChip('tf-domain-chips');
  var type = getSelectedChip('tf-type-chips');
  var priority = getSelectedChip('tf-priority-chips');
  var status = getSelectedChip('tf-status-chips') || 'todo';
  var dueDate = document.getElementById('tf-due').value;
  var notes = document.getElementById('tf-notes').value.trim();
  var muted = document.getElementById('tf-muted').checked;
  var recurrence = type === 'recurring' ? (getSelectedChip('tf-recurrence-chips') || 'daily') : null;
  var preferredTime = type === 'recurring' ? (document.getElementById('tf-recurring-time').value || '08:00') : null;

  var durChip = getSelectedChip('tf-duration-chips');
  var duration;
  if (durChip === 'custom') {
    duration = parseInt(document.getElementById('tf-duration-custom').value) || 30;
  } else {
    duration = parseInt(durChip) || 30;
  }

  if (!title) { showToast('Title is required'); return; }
  if (!domain) { showToast('Pick a domain'); return; }

  try {
    if (editId) {
      var task = await dbGet('tasks', editId);
      if (task) {
        task.title = title;
        task.domain = domain;
        task.type = type;
        task.priority = priority;
        task.status = status;
        task.duration = duration;
        task.dueDate = dueDate;
        task.notes = notes;
        task.muted = muted;
        task.recurrence = recurrence;
        task.preferredTime = preferredTime;
        if (projectId) task.projectId = projectId;
        task.updatedAt = Date.now();
        await dbPut('tasks', task);
        showToast('Task updated');
      }
    } else {
      var newTask = {
        id: genId(),
        title: title,
        domain: domain,
        type: type,
        priority: priority,
        status: 'todo',
        duration: duration,
        dueDate: dueDate,
        notes: notes,
        muted: muted,
        recurrence: recurrence,
        routineId: null,
        preferredTime: preferredTime,
        projectId: projectId,
        archived: false,
        rolloverCount: 0,
        blockType: 'flexible',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        completedAt: null
      };
      await dbPut('tasks', newTask);

      // If created from calendar slot picker, auto-schedule
      if (window._pendingSlotTarget) {
        var pst = window._pendingSlotTarget;
        window._pendingSlotTarget = null;
        calSlotTarget = pst;
        await assignTaskToSlot(newTask.id);
        return; // assignTaskToSlot handles close + render + toast
      }

      showToast('Task created');
    }

    await loadAllTasks();
    closeTaskForm();
    await renderTaskList();
    await renderCalendar();
    await renderDashboardToday();
    renderDomainBars();
    // If task belongs to a project, refresh the project detail
    if (projectId && document.getElementById('proj-overlay').classList.contains('open')) {
      await renderProjectDetail(projectId);
    }
    await renderProjectList();
  } catch (err) {
    console.error('[saveTaskForm]', err);
    showToast('Save failed — try again');
  }
}

/* ─── Delete task ─── */
async function deleteCurrentTask() {
  var taskId = document.getElementById('tf-id').value;
  if (!taskId) return;
  if (!confirm('Delete this task permanently?')) return;

  try {
    var allSlots = await dbGetAll('calendar_slots');
    for (var i = 0; i < allSlots.length; i++) {
      if (allSlots[i].taskId === taskId) {
        await dbDelete('calendar_slots', allSlots[i].id);
      }
    }
    await dbDelete('tasks', taskId);
    await removeAlarmsForTask(taskId);
    await loadAllTasks();
    closeTaskForm();
    await renderTaskList();
    await renderCalendar();
    await renderDashboardToday();
    renderDomainBars();
    showToast('Task deleted');
  } catch (err) {
    console.error('[deleteCurrentTask]', err);
    showToast('Delete failed — try again');
  }
}


/* ═══════════════════════════════════════════
   CALENDAR SYSTEM
   ═══════════════════════════════════════════ */
var calDate = new Date(); // Currently viewed date
var calViewMode = 'day'; // 'day' or 'week'
var calSlotTarget = null; // { date, hour } for pending slot assignment

/* ─── Midnight rollover ─── */
async function checkMidnightRollover() {
  var yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  var yStr = calDateStr(yesterday);

  // If shutdown was done yesterday, skip
  var log = await dbGet('daily_logs', yStr);
  if (log && log.shutdownDone) return;

  // Find yesterday's calendar slots with tasks still in 'scheduled' status
  var allSlots = await dbGetAll('calendar_slots');
  var ySlots = allSlots.filter(function(s) { return s.date === yStr; });
  if (ySlots.length === 0) return;

  var rolled = 0;
  for (var i = 0; i < ySlots.length; i++) {
    var task = await dbGet('tasks', ySlots[i].taskId);
    if (task && task.status === 'scheduled') {
      task.status = 'todo';
      task.rolloverCount = (task.rolloverCount || 0) + 1;
      task.updatedAt = Date.now();
      await dbPut('tasks', task);
      rolled++;
    }
  }

  if (rolled > 0) {
    await loadAllTasks();
    await renderTaskList();
    await renderDashboardToday();
    showToast(rolled + ' task' + (rolled > 1 ? 's' : '') + ' rolled over from yesterday');
  }
}

function calDateStr(d) {
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

async function calNavPrev() {
  if (calViewMode === 'week') calDate.setDate(calDate.getDate() - 7);
  else calDate.setDate(calDate.getDate() - 1);
  await renderCalendar();
}

async function calNavNext() {
  if (calViewMode === 'week') calDate.setDate(calDate.getDate() + 7);
  else calDate.setDate(calDate.getDate() + 1);
  await renderCalendar();
}

async function calGoToday() {
  calDate = new Date();
  await renderCalendar();
}

async function calToggleView() {
  calViewMode = calViewMode === 'day' ? 'week' : 'day';
  document.getElementById('cal-view-toggle').textContent = calViewMode === 'day' ? 'Week' : 'Day';
  await renderCalendar();
}

/* ─── Get week dates from a date ─── */
function getWeekDates(d) {
  var day = d.getDay();
  var monday = new Date(d);
  monday.setDate(d.getDate() - ((day + 6) % 7));
  var dates = [];
  for (var i = 0; i < 7; i++) {
    var dd = new Date(monday);
    dd.setDate(monday.getDate() + i);
    dates.push(dd);
  }
  return dates;
}

/* ─── Parse wake/sleep into hours ─── */
function getWakeHour() {
  var t = (appSettings && appSettings.wakeTime) || '06:00';
  return parseInt(t.split(':')[0]) || 6;
}

function getSleepHour() {
  var t = (appSettings && appSettings.sleepTime) || '23:00';
  var h = parseInt(t.split(':')[0]);
  if (isNaN(h)) return 23;
  return h === 0 ? 24 : h;
}

/* ─── Main render ─── */
async function renderCalendar() {
  // Generate recurring slots for the visible week before rendering
  var weekDates = getWeekDates(calDate);
  await generateRecurringSlots(weekDates[0], weekDates[6]);

  var dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var today = new Date();
  var todayStr = calDateStr(today);
  var selectedStr = calDateStr(calDate);

  // Header label
  document.getElementById('cal-date-label').textContent =
    dayNames[calDate.getDay()] + ', ' + monthNames[calDate.getMonth()] + ' ' + calDate.getDate();
  document.getElementById('cal-date-sub').textContent = calDate.getFullYear();

  // Week strip
  var weekDates = getWeekDates(calDate);
  var weekStripHtml = '';

  // Get all calendar slots for this week to show dots
  var allSlots = await dbGetAll('calendar_slots');

  weekDates.forEach(function(wd) {
    var ds = calDateStr(wd);
    var isActive = ds === selectedStr;
    var isToday = ds === todayStr;

    // Count slots for this day and get domain colors
    var daySlots = allSlots.filter(function(s) { return s.date === ds; });
    var dotColors = [];
    daySlots.forEach(function(s) {
      if (s.domainColor && dotColors.indexOf(s.domainColor) < 0 && dotColors.length < 3) {
        dotColors.push(s.domainColor);
      }
    });

    weekStripHtml += '<div class="cal-week-day' + (isActive ? ' active' : '') + (isToday ? ' today' : '') + '" onclick="calSelectDay(\'' + ds + '\')">' +
      '<div class="day-name">' + dayNames[wd.getDay()] + '</div>' +
      '<div class="day-num">' + wd.getDate() + '</div>' +
      '<div class="day-dots">' +
        dotColors.map(function(c) { return '<span style="background:' + c + '"></span>'; }).join('') +
      '</div>' +
    '</div>';
  });

  document.getElementById('cal-week-strip').innerHTML = weekStripHtml;

  // Time grid
  var wakeHour = getWakeHour();
  var sleepHour = getSleepHour();
  var gridHtml = '';

  // Get slots for the selected day
  var daySlots = allSlots.filter(function(s) { return s.date === selectedStr; });

  // Get task data for those slots
  var slotTaskMap = {};
  for (var si = 0; si < daySlots.length; si++) {
    var slot = daySlots[si];
    var task = await dbGet('tasks', slot.taskId);
    if (task) {
      var domain = appDomains.find(function(d) { return d.id === task.domain; });
      slotTaskMap[slot.id] = {
        slot: slot,
        task: task,
        domain: domain
      };
    }
  }

  // Generate hour list, handling sleep times that cross midnight
  var hours = [];
  if (sleepHour > wakeHour) {
    // Normal case: wake at 8, sleep at 23
    for (var h = wakeHour; h < sleepHour; h++) {
      hours.push(h);
    }
  } else {
    // Midnight wraparound: wake at 22, sleep at 6
    for (var h = wakeHour; h <= 23; h++) {
      hours.push(h);
    }
    for (var h = 0; h < sleepHour; h++) {
      hours.push(h);
    }
  }

  hours.forEach(function(h) {
    var label = (h < 10 ? '0' : '') + h + ':00';
    gridHtml += '<div class="cal-hour-row" data-hour="' + h + '">' +
      '<div class="cal-hour-label">' + label + '</div>' +
      '<div class="cal-hour-slots" onclick="onSlotTap(\'' + selectedStr + '\',' + h + ')">';

    // Render task blocks for this hour
    daySlots.forEach(function(slot) {
      if (slot.startHour === h && slotTaskMap[slot.id]) {
        var info = slotTaskMap[slot.id];
        var color = info.domain ? info.domain.color : '#555';
        var dur = info.task.duration || 30;
        var heightPx = Math.max(28, (dur / 60) * 60); // 60px per hour
        var isDone = info.task.status === 'done';

        gridHtml += '<div class="cal-block' + (isDone ? ' is-done' : '') + '" ' +
          'style="top:0;height:' + heightPx + 'px;background:' + color + '33;border-color:' + color + '44;" ' +
          'onclick="event.stopPropagation();openTaskForm(\'' + info.task.id + '\')">' +
          '<div class="cal-block-title" style="color:' + color + '">' + escapeHtml(info.task.title) + '</div>' +
          '<div class="cal-block-time">' + formatSlotTime(slot.startHour, slot.startMin) + ' – ' + formatSlotTime(slot.endHour, slot.endMin) + '</div>' +
          (slot.anchored ? '<div class="cal-block-pin">📌</div>' : '') +
        '</div>';
      }
    });

    gridHtml += '</div></div>';
  });

  // Now-line for today
  if (selectedStr === todayStr) {
    var now = new Date();
    var nowHour = now.getHours();
    var nowMin = now.getMinutes();
    var isNowInRange = false;
    if (sleepHour > wakeHour) {
      isNowInRange = nowHour >= wakeHour && nowHour < sleepHour;
    } else {
      // Midnight wraparound
      isNowInRange = nowHour >= wakeHour || nowHour < sleepHour;
    }
    if (isNowInRange) {
      var offsetHour = (sleepHour > wakeHour) ? (nowHour - wakeHour) :
                       (nowHour >= wakeHour) ? (nowHour - wakeHour) : (24 - wakeHour + nowHour);
      var topPx = (offsetHour * 60) + nowMin;
      gridHtml += '<div class="cal-now-line" style="top:' + topPx + 'px;"></div>';
    }
  }

  document.getElementById('cal-grid').innerHTML = gridHtml;
}

function formatSlotTime(h, m) {
  return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + (m || 0);
}

function calSelectDay(dateStr) {
  var parts = dateStr.split('-');
  calDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  renderCalendar();
}

/* ─── Slot tap → open picker ─── */
function onSlotTap(dateStr, hour) {
  calSlotTarget = { date: dateStr, hour: hour };
  openSlotPicker(dateStr, hour);
}

async function openSlotPicker(dateStr, hour) {
  var backdrop = document.getElementById('slot-picker-backdrop');
  var list = document.getElementById('slot-picker-list');
  var label = formatSlotTime(hour, 0);

  document.getElementById('slot-picker-title').textContent = 'Assign to ' + label;
  document.getElementById('slot-picker-sub').textContent = dateStr + ' at ' + label;

  // Get unscheduled tasks (Todo or Reported)

  var available = allTasks.filter(function(t) {
    return !t.archived && (t.status === 'todo' || t.status === 'reported');
  });

  var html = '';
  if (available.length === 0) {
    html = '<div style="padding:20px;text-align:center;color:var(--text-tertiary);font-size:13px;">No unscheduled tasks. Create one below.</div>';
  } else {
    available.forEach(function(task) {
      var domain = appDomains.find(function(d) { return d.id === task.domain; });
      var domainColor = domain ? domain.color : '#555';
      var durLabel = task.duration ? (DURATION_LABELS[task.duration] || task.duration + 'm') : '30m';

      html += '<div class="slot-picker-item" onclick="assignTaskToSlot(\'' + task.id + '\')">' +
        '<div class="spi-color" style="background:' + domainColor + '"></div>' +
        '<div class="spi-info">' +
          '<div class="spi-title">' + escapeHtml(task.title) + '</div>' +
          '<div class="spi-meta">' + (domain ? domain.icon + ' ' + domain.name : '') + ' · ' + durLabel + '</div>' +
        '</div>' +
      '</div>';
    });
  }

  list.innerHTML = html;
  backdrop.classList.add('open');
}

function closeSlotPicker() {
  document.getElementById('slot-picker-backdrop').classList.remove('open');
  calSlotTarget = null;
}

/* ─── Assign task to calendar slot ─── */
async function assignTaskToSlot(taskId) {
  if (!calSlotTarget) return;

  var task = await dbGet('tasks', taskId);
  if (!task) return;

  try {
    var duration = task.duration || 30;
    var startHour = calSlotTarget.hour;
    var startMin = 0;
    var endMin = startMin + duration;
    var endHour = startHour + Math.floor(endMin / 60);
    endMin = endMin % 60;

    var domain = appDomains.find(function(d) { return d.id === task.domain; });

    var slot = {
      id: genId(),
      taskId: taskId,
      date: calSlotTarget.date,
      startHour: startHour,
      startMin: startMin,
      endHour: endHour,
      endMin: endMin,
      anchored: false,
      domainColor: domain ? domain.color : '#555'
    };

    await dbPut('calendar_slots', slot);

    task.status = 'scheduled';
    task.updatedAt = Date.now();
    await dbPut('tasks', task);
    await loadAllTasks();

    await scheduleAlarmsForSlot(slot, task);

    closeSlotPicker();
    await renderCalendar();
    await renderTaskList();
    await renderDashboardToday();
    await updateCalBadge();
    showToast('Task scheduled');
  } catch (err) {
    console.error('[assignTaskToSlot]', err);
    showToast('Schedule failed — try again');
  }
}

/* ─── Create new task for a slot ─── */
function createTaskForSlot() {
  closeSlotPicker();
  // Open the task form, after save we'll schedule it
  openTaskForm();
  // Store slot target for after save
  window._pendingSlotTarget = calSlotTarget ? { date: calSlotTarget.date, hour: calSlotTarget.hour } : null;
}

/* ─── Remove task from calendar slot (auto-status → Todo) ─── */
async function removeSlot(slotId) {
  var slot = await dbGet('calendar_slots', slotId);
  if (!slot) return;

  try {
    var task = await dbGet('tasks', slot.taskId);
    if (task && task.status === 'scheduled') {
      task.status = 'todo';
      task.updatedAt = Date.now();
      await dbPut('tasks', task);
    }
    await dbDelete('calendar_slots', slotId);
    await removeAlarmsForSlot(slotId);
    await loadAllTasks();
    await renderCalendar();
    await renderTaskList();
    await renderDashboardToday();
    await updateCalBadge();
    showToast('Removed from calendar');
  } catch (err) {
    console.error('[removeSlot]', err);
    showToast('Action failed — try again');
  }
}

/* ─── Update now line every minute ─── */
setInterval(function() {
  var todayStr = calDateStr(new Date());
  var selectedStr = calDateStr(calDate);
  if (todayStr === selectedStr) {
    renderCalendar();
  }
}, 60000);

/* ═══════════════════════════════════════════
   RITUAL SYSTEM
   ═══════════════════════════════════════════ */
var ritualType = null; // 'morning' or 'shutdown'
var ritualStep = 0;
var ritualTotalSteps = 4;
var ritualData = {}; // temp data for the current ritual

function closeRitual() {
  document.getElementById('ritual-overlay').classList.remove('open');
  ritualType = null;
}

function renderRitualStepDots() {
  var html = '';
  for (var i = 0; i < ritualTotalSteps; i++) {
    var cls = i < ritualStep ? 'done' : (i === ritualStep ? 'active' : '');
    html += '<div class="ritual-step-dot ' + cls + '"></div>';
  }
  document.getElementById('ritual-step-dots').innerHTML = html;
}

/* ─── MORNING RITUAL ─── */
async function openMorningRitual() {
  ritualType = 'morning';
  ritualStep = 0;
  ritualTotalSteps = 4;
  document.getElementById('ritual-overlay-title').textContent = '☀️ Morning Ritual';
  document.getElementById('ritual-overlay').classList.add('open');

  // Load yesterday's data
  var yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  var yStr = calDateStr(yesterday);


  var allSlots = await dbGetAll('calendar_slots');
  var ySlots = allSlots.filter(function(s) { return s.date === yStr; });

  var completed = [];
  var rolledOver = [];

  for (var i = 0; i < ySlots.length; i++) {
    var task = allTasks.find(function(t) { return t.id === ySlots[i].taskId; });
    if (!task) continue;
    if (task.status === 'done') completed.push(task);
    else rolledOver.push(task);
  }

  var todayStr = calDateStr(new Date());
  var todaySlots = allSlots.filter(function(s) { return s.date === todayStr; });
  var todayTasks = [];
  for (var j = 0; j < todaySlots.length; j++) {
    var tt = allTasks.find(function(t) { return t.id === todaySlots[j].taskId; });
    if (tt) todayTasks.push({ task: tt, slot: todaySlots[j] });
  }
  todayTasks.sort(function(a, b) {
    return (a.slot.startHour * 60 + (a.slot.startMin || 0)) - (b.slot.startHour * 60 + (b.slot.startMin || 0));
  });

  ritualData = { completed: completed, rolledOver: rolledOver, todayTasks: todayTasks };
  renderMorningStep();
}

function renderMorningStep() {
  renderRitualStepDots();
  var body = document.getElementById('ritual-body');
  var footer = document.getElementById('ritual-footer');

  if (ritualStep === 0) {
    // Step 1: Yesterday recap
    var html = '<p class="ritual-step-title">Step 1 — Yesterday Recap</p>';
    html += '<div class="ritual-stat-row"><span class="ritual-stat-label">Tasks completed</span><span class="ritual-stat-value">' + ritualData.completed.length + '</span></div>';
    html += '<div class="ritual-stat-row"><span class="ritual-stat-label">Rolled over</span><span class="ritual-stat-value" style="color:#A855F7;">' + ritualData.rolledOver.length + '</span></div>';

    if (ritualData.completed.length > 0) {
      html += '<div style="margin-top:16px;">';
      ritualData.completed.forEach(function(t) {
        var d = appDomains.find(function(dd) { return dd.id === t.domain; });
        html += '<div class="ritual-task-item is-done"><div class="rti-check checked"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><polyline points="20 6 9 17 4 12"></polyline></svg></div>' +
          '<div class="rti-color" style="background:' + (d ? d.color : '#555') + '"></div>' +
          '<div class="rti-title">' + escapeHtml(t.title) + '</div></div>';
      });
      html += '</div>';
    }

    if (ritualData.rolledOver.length > 0) {
      html += '<div style="margin-top:12px;">';
      ritualData.rolledOver.forEach(function(t) {
        var d = appDomains.find(function(dd) { return dd.id === t.domain; });
        html += '<div class="ritual-task-item"><div class="rti-color" style="background:' + (d ? d.color : '#555') + '"></div>' +
          '<div class="rti-title">' + escapeHtml(t.title) + '</div>' +
          '<span class="rti-badge">↻' + (t.rolloverCount || 0) + '</span></div>';
      });
      html += '</div>';
    }

    if (ritualData.completed.length === 0 && ritualData.rolledOver.length === 0) {
      html += '<div style="margin-top:16px;color:var(--text-tertiary);font-size:13px;">No scheduled tasks yesterday.</div>';
    }

    body.innerHTML = html;
    footer.innerHTML = '<button class="ritual-btn ritual-btn-primary" onclick="ritualStep=1;renderMorningStep();">Next →</button>';

  } else if (ritualStep === 1) {
    // Step 2: Today's plan
    var html = '<p class="ritual-step-title">Step 2 — Today\'s Plan</p>';
    if (ritualData.todayTasks.length === 0) {
      html += '<div style="color:var(--text-tertiary);font-size:13px;">Nothing scheduled today. Use the Calendar tab to add tasks.</div>';
    } else {
      ritualData.todayTasks.forEach(function(item) {
        var d = appDomains.find(function(dd) { return dd.id === item.task.domain; });
        var time = formatSlotTime(item.slot.startHour, item.slot.startMin);
        html += '<div class="ritual-task-item"><div style="font-family:var(--font-display);font-size:11px;color:var(--text-tertiary);width:44px;flex-shrink:0;text-align:center;">' + time + '</div>' +
          '<div class="rti-color" style="background:' + (d ? d.color : '#555') + '"></div>' +
          '<div class="rti-title">' + escapeHtml(item.task.title) + '</div>' +
          '<span class="rti-badge">' + (item.task.duration || 30) + 'm</span></div>';
      });
    }
    body.innerHTML = html;
    footer.innerHTML = '<button class="ritual-btn ritual-btn-secondary" onclick="ritualStep=0;renderMorningStep();">← Back</button>' +
      '<button class="ritual-btn ritual-btn-primary" onclick="ritualStep=2;renderMorningStep();">Next →</button>';

  } else if (ritualStep === 2) {
    // Step 3: Quick adjustments
    var html = '<p class="ritual-step-title">Step 3 — Quick Adjustments</p>';
    html += '<div style="color:var(--text-secondary);font-size:13px;margin-bottom:16px;">Need to add, remove, or reschedule? Use the buttons below.</div>';
    html += '<div style="display:flex;gap:8px;flex-wrap:wrap;">';
    html += '<button class="ritual-btn ritual-btn-secondary" style="flex:none;padding:10px 16px;font-size:13px;" onclick="closeRitual();switchTab(\'calendar\',2);">📅 Open Calendar</button>';
    html += '<button class="ritual-btn ritual-btn-secondary" style="flex:none;padding:10px 16px;font-size:13px;" onclick="closeRitual();openTaskForm();">+ New Task</button>';
    html += '</div>';
    body.innerHTML = html;
    footer.innerHTML = '<button class="ritual-btn ritual-btn-secondary" onclick="ritualStep=1;renderMorningStep();">← Back</button>' +
      '<button class="ritual-btn ritual-btn-primary" onclick="ritualStep=3;renderMorningStep();">Next →</button>';

  } else if (ritualStep === 3) {
    // Step 4: Commit
    var html = '<p class="ritual-step-title">Step 4 — Commit Your Day</p>';
    html += '<div style="text-align:center;padding:30px 0;">';
    html += '<div style="font-size:40px;margin-bottom:16px;">🚀</div>';
    html += '<div style="font-size:16px;color:var(--text-primary);font-weight:500;margin-bottom:8px;">Ready to go, Krasbauer</div>';
    html += '<div style="font-size:13px;color:var(--text-secondary);">' + ritualData.todayTasks.length + ' tasks scheduled today</div>';
    html += '</div>';
    body.innerHTML = html;
    footer.innerHTML = '<button class="ritual-btn ritual-btn-secondary" onclick="ritualStep=2;renderMorningStep();">← Back</button>' +
      '<button class="ritual-btn ritual-btn-success" onclick="commitMorningRitual();">✓ Commit Day</button>';
  }
}

async function commitMorningRitual() {
  // Save morning log
  var todayStr = calDateStr(new Date());
  var log = await dbGet('daily_logs', todayStr) || { date: todayStr };
  log.morningCommit = true;
  log.morningCommitTime = Date.now();
  await dbPut('daily_logs', log);

  closeRitual();
  // Fade the morning card
  var card = document.getElementById('morning-ritual-card');
  if (card) card.classList.add('faded');
  showToast('Day committed. Let\'s go.');
}

/* ─── SHUTDOWN RITUAL ─── */
async function openShutdownRitual() {
  ritualType = 'shutdown';
  ritualStep = 0;
  ritualTotalSteps = 4;
  document.getElementById('ritual-overlay-title').textContent = '🌙 Shutdown Ritual';
  document.getElementById('ritual-overlay').classList.add('open');

  var todayStr = calDateStr(new Date());

  var allSlots = await dbGetAll('calendar_slots');
  var todaySlots = allSlots.filter(function(s) { return s.date === todayStr; });

  var todayItems = [];
  for (var i = 0; i < todaySlots.length; i++) {
    var task = allTasks.find(function(t) { return t.id === todaySlots[i].taskId; });
    if (task) todayItems.push({ task: task, slot: todaySlots[i] });
  }
  todayItems.sort(function(a, b) {
    return (a.slot.startHour * 60 + (a.slot.startMin || 0)) - (b.slot.startHour * 60 + (b.slot.startMin || 0));
  });

  ritualData = { todayItems: todayItems, reflection: '' };
  renderShutdownStep();
}

function renderShutdownStep() {
  renderRitualStepDots();
  var body = document.getElementById('ritual-body');
  var footer = document.getElementById('ritual-footer');

  if (ritualStep === 0) {
    // Step 1: Review
    var html = '<p class="ritual-step-title">Step 1 — Review Today</p>';
    html += '<div style="font-size:13px;color:var(--text-secondary);margin-bottom:12px;">Check off completed tasks. Leave unfinished ones unchecked.</div>';

    ritualData.todayItems.forEach(function(item, idx) {
      var d = appDomains.find(function(dd) { return dd.id === item.task.domain; });
      var isDone = item.task.status === 'done';
      html += '<div class="ritual-task-item' + (isDone ? ' is-done' : '') + '">' +
        '<button class="rti-check' + (isDone ? ' checked' : '') + '" onclick="toggleShutdownTask(' + idx + ')">' +
          (isDone ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><polyline points="20 6 9 17 4 12"></polyline></svg>' : '') +
        '</button>' +
        '<div class="rti-color" style="background:' + (d ? d.color : '#555') + '"></div>' +
        '<div class="rti-title">' + escapeHtml(item.task.title) + '</div></div>';
    });

    if (ritualData.todayItems.length === 0) {
      html += '<div style="color:var(--text-tertiary);font-size:13px;">No tasks were scheduled today.</div>';
    }

    body.innerHTML = html;
    footer.innerHTML = '<button class="ritual-btn ritual-btn-primary" onclick="ritualStep=1;renderShutdownStep();">Next →</button>';

  } else if (ritualStep === 1) {
    // Step 2: Rollover
    var incomplete = ritualData.todayItems.filter(function(item) { return item.task.status !== 'done'; });
    var html = '<p class="ritual-step-title">Step 2 — Rollover</p>';

    if (incomplete.length === 0) {
      html += '<div style="text-align:center;padding:20px 0;"><div style="font-size:30px;margin-bottom:8px;">🎉</div><div style="font-size:14px;color:var(--status-done);">All tasks completed today!</div></div>';
    } else {
      html += '<div style="font-size:13px;color:var(--text-secondary);margin-bottom:12px;">' + incomplete.length + ' task' + (incomplete.length > 1 ? 's' : '') + ' will roll over to tomorrow.</div>';
      incomplete.forEach(function(item) {
        var d = appDomains.find(function(dd) { return dd.id === item.task.domain; });
        html += '<div class="ritual-task-item">' +
          '<div class="rti-color" style="background:' + (d ? d.color : '#555') + '"></div>' +
          '<div class="rti-title">' + escapeHtml(item.task.title) + '</div>' +
          '<span class="rti-badge">→ tomorrow</span></div>';
      });
    }

    body.innerHTML = html;
    footer.innerHTML = '<button class="ritual-btn ritual-btn-secondary" onclick="ritualStep=0;renderShutdownStep();">← Back</button>' +
      '<button class="ritual-btn ritual-btn-primary" onclick="ritualStep=2;renderShutdownStep();">Next →</button>';

  } else if (ritualStep === 2) {
    // Step 3: Reflection
    var html = '<p class="ritual-step-title">Step 3 — Reflection</p>';
    html += '<div style="font-size:13px;color:var(--text-secondary);margin-bottom:4px;">How was today? (optional)</div>';
    html += '<input type="text" class="ritual-reflection-input" id="shutdown-reflection" placeholder="One line about your day..." value="' + escapeHtml(ritualData.reflection || '') + '" oninput="ritualData.reflection=this.value">';
    body.innerHTML = html;
    footer.innerHTML = '<button class="ritual-btn ritual-btn-secondary" onclick="ritualStep=1;renderShutdownStep();">← Back</button>' +
      '<button class="ritual-btn ritual-btn-primary" onclick="ritualStep=3;renderShutdownStep();">Next →</button>';

  } else if (ritualStep === 3) {
    // Step 4: Close day
    var doneCount = ritualData.todayItems.filter(function(i) { return i.task.status === 'done'; }).length;
    var totalCount = ritualData.todayItems.length;
    var html = '<p class="ritual-step-title">Step 4 — Close Day</p>';
    html += '<div style="text-align:center;padding:20px 0;">';
    html += '<div style="font-size:40px;margin-bottom:16px;">🌙</div>';
    html += '<div style="font-size:16px;color:var(--text-primary);font-weight:500;margin-bottom:8px;">Day complete, Krasbauer</div>';
    html += '<div style="font-size:13px;color:var(--text-secondary);">' + doneCount + '/' + totalCount + ' tasks done</div>';
    if (ritualData.reflection) {
      html += '<div style="font-size:12px;color:var(--text-tertiary);margin-top:12px;font-style:italic;">"' + escapeHtml(ritualData.reflection) + '"</div>';
    }
    html += '</div>';
    body.innerHTML = html;
    footer.innerHTML = '<button class="ritual-btn ritual-btn-secondary" onclick="ritualStep=2;renderShutdownStep();">← Back</button>' +
      '<button class="ritual-btn ritual-btn-success" onclick="commitShutdownRitual();">✓ Close Day</button>';
  }
}

async function toggleShutdownTask(idx) {
  var item = ritualData.todayItems[idx];
  if (!item) return;
  item.task.status = item.task.status === 'done' ? 'todo' : 'done';
  if (item.task.status === 'done') item.task.completedAt = Date.now();
  await dbPut('tasks', item.task);
  renderShutdownStep();
}

async function commitShutdownRitual() {
  var todayStr = calDateStr(new Date());
  var tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  var tomorrowStr = calDateStr(tomorrowDate);

  // Rollover incomplete tasks
  var incomplete = ritualData.todayItems.filter(function(i) { return i.task.status !== 'done'; });
  for (var i = 0; i < incomplete.length; i++) {
    var item = incomplete[i];
    // Increment rollover count
    item.task.rolloverCount = (item.task.rolloverCount || 0) + 1;
    item.task.status = 'reported';
    item.task.updatedAt = Date.now();
    await dbPut('tasks', item.task);

    // Move calendar slot to tomorrow (same time)
    var oldSlot = item.slot;
    await removeAlarmsForSlot(oldSlot.id);
    await dbDelete('calendar_slots', oldSlot.id);

    var newSlot = {
      id: genId(),
      taskId: item.task.id,
      date: tomorrowStr,
      startHour: oldSlot.startHour,
      startMin: oldSlot.startMin || 0,
      endHour: oldSlot.endHour,
      endMin: oldSlot.endMin || 0,
      anchored: oldSlot.anchored,
      domainColor: oldSlot.domainColor
    };
    await dbPut('calendar_slots', newSlot);

    // Set status back to scheduled for tomorrow
    item.task.status = 'scheduled';
    await dbPut('tasks', item.task);

    // Schedule alarms for new slot
    await scheduleAlarmsForSlot(newSlot, item.task);
  }

  // Save daily log
  var log = await dbGet('daily_logs', todayStr) || { date: todayStr };
  log.shutdownDone = true;
  log.shutdownTime = Date.now();
  log.reflection = ritualData.reflection || '';
  log.tasksCompleted = ritualData.todayItems.filter(function(i) { return i.task.status === 'done' || i.task.completedAt; }).length;
  log.tasksRolledOver = incomplete.length;
  await dbPut('daily_logs', log);

  closeRitual();
  await renderTaskList();
  await renderCalendar();
  await renderDashboardToday();
  renderDomainBars();
  showToast(incomplete.length > 0 ? incomplete.length + ' tasks rolled to tomorrow' : 'Perfect day! All done.');
}

/* ─── Ritual card visibility logic ─── */
function updateRitualCards() {
  var now = new Date();
  var hour = now.getHours();
  var morningCard = document.getElementById('morning-ritual-card');
  var shutdownCard = document.getElementById('shutdown-ritual-card');

  // Morning card: visible before noon, faded after noon
  if (hour >= 12) {
    morningCard.classList.add('faded');
  }

  // Shutdown card: visible in the evening (after ritual alarm time)
  var ritualHour = 21;
  if (appSettings && appSettings.ritualAlarmTime) {
    ritualHour = parseInt(appSettings.ritualAlarmTime.split(':')[0]) || 21;
  }
  if (hour >= ritualHour - 1) {
    shutdownCard.style.display = '';
  }

  // Check if morning was already committed today
  dbGet('daily_logs', calDateStr(now)).then(function(log) {
    if (log && log.morningCommit) {
      morningCard.classList.add('faded');
    }
    if (log && log.shutdownDone) {
      shutdownCard.style.display = 'none';
    }
  });
}

// Check ritual card visibility on load and every minute
setTimeout(updateRitualCards, 1500);
setInterval(updateRitualCards, 60000);

/* ═══════════════════════════════════════════
   RECURRING TASKS
   ═══════════════════════════════════════════ */

/* ─── Show/hide recurrence fields based on task type ─── */
function setupTypeToggle() {
  var typeContainer = document.getElementById('tf-type-chips');
  if (!typeContainer) return;
  typeContainer.addEventListener('click', function(e) {
    var chip = e.target.closest('.chip-option');
    if (!chip) return;
    var recGroup = document.getElementById('tf-recurrence-group');
    if (chip.dataset.value === 'recurring') {
      recGroup.style.display = '';
    } else {
      recGroup.style.display = 'none';
    }
  });
}
setupTypeToggle();

/* ─── Auto-generate recurring task slots for a date range ─── */
async function generateRecurringSlots(startDate, endDate) {

  var recurring = allTasks.filter(function(t) {
    return t.type === 'recurring' && !t.archived && t.recurrence;
  });

  var allSlots = await dbGetAll('calendar_slots');

  for (var i = 0; i < recurring.length; i++) {
    var task = recurring[i];
    var d = new Date(startDate);

    while (d <= endDate) {
      var ds = calDateStr(d);
      var dayOfWeek = d.getDay(); // 0=Sun, 6=Sat

      var shouldSchedule = false;
      if (task.recurrence === 'daily') shouldSchedule = true;
      else if (task.recurrence === 'weekly') shouldSchedule = (dayOfWeek === 1); // Monday
      else if (task.recurrence === 'monthly') shouldSchedule = (d.getDate() === 1);
      else if (task.recurrence === 'weekdays') shouldSchedule = (dayOfWeek >= 1 && dayOfWeek <= 5);

      if (shouldSchedule) {
        // Check if slot already exists for this task on this date
        var exists = allSlots.some(function(s) { return s.taskId === task.id && s.date === ds; });

        if (!exists) {
          // Determine start time from preferredTime or default 08:00
          var startH = 8;
          var startM = 0;
          if (task.preferredTime) {
            var pParts = task.preferredTime.split(':');
            startH = parseInt(pParts[0]) || 8;
            startM = parseInt(pParts[1]) || 0;
          }

          var dur = task.duration || 30;
          var endMin = startH * 60 + startM + dur;
          var endH = Math.floor(endMin / 60);
          endMin = endMin % 60;

          var domain = appDomains.find(function(dd) { return dd.id === task.domain; });

          var newSlot = {
            id: genId(),
            taskId: task.id,
            date: ds,
            startHour: startH,
            startMin: startM,
            endHour: endH,
            endMin: endMin,
            anchored: false,
            domainColor: domain ? domain.color : '#555'
          };
          await dbPut('calendar_slots', newSlot);
          allSlots.push(newSlot);
        }
      }
      d.setDate(d.getDate() + 1);
    }
  }
}


/* ═══════════════════════════════════════════
   ALARM / NOTIFICATION SYSTEM
   ═══════════════════════════════════════════ */

/* ─── Schedule alarms for a calendar slot ─── */
async function scheduleAlarmsForSlot(slot, task) {
  if (!slot || !task) return;
  if (task.muted) return;

  var dateparts = slot.date.split('-');
  var year = parseInt(dateparts[0]);
  var month = parseInt(dateparts[1]) - 1;
  var day = parseInt(dateparts[2]);

  // Start alarm
  var startTime = new Date(year, month, day, slot.startHour, slot.startMin || 0);
  if (startTime.getTime() > Date.now()) {
    await dbPut('alarms', {
      id: 'start-' + slot.id,
      taskId: task.id,
      slotId: slot.id,
      type: 'start',
      triggerTime: startTime.getTime(),
      fired: false,
      title: '▶ ' + task.title,
      body: 'Starting now — ' + (task.duration || 30) + ' min'
    });
  }

  // End alarm
  var endTime = new Date(year, month, day, slot.endHour, slot.endMin || 0);
  if (endTime.getTime() > Date.now()) {
    await dbPut('alarms', {
      id: 'end-' + slot.id,
      taskId: task.id,
      slotId: slot.id,
      type: 'end',
      triggerTime: endTime.getTime(),
      fired: false,
      title: '⏱ Time\'s up: ' + task.title,
      body: 'Duration reached'
    });
  }
}

/* ─── Remove alarms for a slot ─── */
async function removeAlarmsForSlot(slotId) {
  var ids = ['start-' + slotId, 'end-' + slotId];
  for (var i = 0; i < ids.length; i++) {
    try { await dbDelete('alarms', ids[i]); } catch(e) {}
  }
}

/* ─── Remove all alarms for a task ─── */
async function removeAlarmsForTask(taskId) {
  var all = await dbGetAll('alarms');
  for (var i = 0; i < all.length; i++) {
    if (all[i].taskId === taskId) {
      await dbDelete('alarms', all[i].id);
    }
  }
}

/* ─── Schedule shutdown ritual alarm ─── */
async function scheduleRitualAlarm() {
  var ritualTime = (appSettings && appSettings.ritualAlarmTime) || '21:00';
  var parts = ritualTime.split(':');
  var now = new Date();
  var trigger = new Date(now.getFullYear(), now.getMonth(), now.getDate(), parseInt(parts[0]), parseInt(parts[1]));

  // If already passed today, schedule for tomorrow
  if (trigger.getTime() <= Date.now()) {
    trigger.setDate(trigger.getDate() + 1);
  }

  await dbPut('alarms', {
    id: 'ritual-shutdown',
    taskId: null,
    slotId: null,
    type: 'ritual',
    triggerTime: trigger.getTime(),
    fired: false,
    title: '🌙 Shutdown Ritual',
    body: 'Time to close your day, Krasbauer'
  });
}

/* ─── Check quiet hours ─── */
function isQuietHours() {
  if (!appSettings) return false;
  var qStart = appSettings.quietHoursStart || appSettings.sleepTime || '23:00';
  var qEnd = appSettings.quietHoursEnd || appSettings.wakeTime || '06:00';
  var now = new Date();
  var h = now.getHours();
  var m = now.getMinutes();
  var current = h * 60 + m;
  var start = parseInt(qStart.split(':')[0]) * 60 + parseInt(qStart.split(':')[1] || 0);
  var end = parseInt(qEnd.split(':')[0]) * 60 + parseInt(qEnd.split(':')[1] || 0);

  if (start > end) {
    // Crosses midnight (e.g. 23:00 - 06:00)
    return current >= start || current < end;
  }
  return current >= start && current < end;
}

/* ─── Fire a notification ─── */
function fireNotification(alarm) {
  // Via Service Worker (works in background too)
  if (navigator.serviceWorker && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'SHOW_NOTIFICATION',
      payload: {
        title: alarm.title,
        body: alarm.body,
        tag: alarm.id,
        data: {
          taskId: alarm.taskId,
          action: alarm.type === 'ritual' ? 'OPEN_SHUTDOWN_RITUAL' : null
        }
      }
    });
  }

  // In-app banner
  showAlarmBanner(alarm);
}

/* ─── In-app alarm banner ─── */
var alarmBannerTimeout = null;

function showAlarmBanner(alarm) {
  var banner = document.getElementById('alarm-banner');
  document.getElementById('alarm-banner-title').textContent = alarm.title;
  document.getElementById('alarm-banner-sub').textContent = alarm.body;
  banner.classList.add('show');

  clearTimeout(alarmBannerTimeout);
  alarmBannerTimeout = setTimeout(function() {
    banner.classList.remove('show');
  }, 15000); // Auto-dismiss after 15s
}

function dismissAlarmBanner() {
  document.getElementById('alarm-banner').classList.remove('show');
  clearTimeout(alarmBannerTimeout);
}

/* ─── Alarm checker — runs every 30 seconds ─── */
async function checkAlarms() {
  if (!db) return;
  var now = Date.now();
  var allAlarms = await dbGetAll('alarms');

  for (var i = 0; i < allAlarms.length; i++) {
    var alarm = allAlarms[i];
    if (alarm.fired) continue;
    if (alarm.triggerTime > now) continue;

    // Alarm is due
    // Check quiet hours (skip ritual — that always fires)
    if (alarm.type !== 'ritual' && isQuietHours()) continue;

    // Check per-task mute and completion
    if (alarm.taskId) {
      var task = await dbGet('tasks', alarm.taskId);
      if (task && (task.muted || task.status === 'done')) continue;
    }

    // Fire it
    fireNotification(alarm);

    // Mark as fired
    alarm.fired = true;
    await dbPut('alarms', alarm);

    // If ritual alarm, reschedule for tomorrow
    if (alarm.type === 'ritual') {
      setTimeout(scheduleRitualAlarm, 2000);
    }
  }

  // Update tab badge
  updateCalBadge();
}

/* ─── Tab badge: show if there are upcoming alarms today ─── */
async function updateCalBadge() {
  var badge = document.getElementById('cal-tab-badge');
  if (!badge || !db) return;

  var now = Date.now();
  var endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  var allAlarms = await dbGetAll('alarms');
  var upcoming = allAlarms.filter(function(a) {
    return !a.fired && a.triggerTime > now && a.triggerTime <= endOfDay.getTime() && a.type === 'start';
  });

  badge.classList.toggle('show', upcoming.length > 0);
}

// Start alarm checker
setInterval(checkAlarms, 30000);
// Initial check after a short delay
setTimeout(checkAlarms, 3000);
// Schedule ritual alarm on boot
setTimeout(scheduleRitualAlarm, 2000);

/* ─── Handle SW messages ─── */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', function(event) {
    var data = event.data || {};
    if (data.type === 'OPEN_TASK' && data.taskId) {
      openTaskForm(data.taskId);
    }
    if (data.type === 'MARK_DONE' && data.taskId) {
      toggleTaskDone(data.taskId);
    }
    if (data.type === 'OPEN_SHUTDOWN_RITUAL') {
      switchTab('dashboard', 0);
    }
  });
}

/* ═══════════════════════════════════════════
   SETTINGS PANEL
   ═══════════════════════════════════════════ */
document.getElementById('settings-btn').addEventListener('click', openSettings);
document.getElementById('refresh-btn').addEventListener('click', refreshAllData);

function openSettings() {
  document.getElementById('settings-overlay').classList.add('open');
  document.getElementById('settings-panel').classList.add('open');
  renderCacheVersion();
  renderPatchnotes();
}

function closeSettings() {
  document.getElementById('settings-overlay').classList.remove('open');
  document.getElementById('settings-panel').classList.remove('open');
  // Save settings on close
  saveSettings();
}

function loadSettingsUI() {
  if (!appSettings) return;
  document.getElementById('setting-wake').value = appSettings.wakeTime || '06:00';
  document.getElementById('setting-sleep').value = appSettings.sleepTime || '23:00';
  document.getElementById('setting-ritual').value = appSettings.ritualAlarmTime || '21:00';
  renderBackupStatus();
}

async function saveSettings() {
  appSettings.wakeTime = document.getElementById('setting-wake').value;
  appSettings.sleepTime = document.getElementById('setting-sleep').value;
  appSettings.ritualAlarmTime = document.getElementById('setting-ritual').value;
  await dbPut('settings', appSettings);
  await renderCalendar();
  await renderDashboardToday();
}

/* ─── Domain List in Settings ─── */
function renderSettingsDomainList() {
  var container = document.getElementById('domain-list');
  var html = '';

  appDomains.forEach(function(d) {
    html += '<div class="domain-item" data-id="' + d.id + '">' +
      '<input type="color" class="domain-color-picker" value="' + d.color + '" ' +
        'onchange="quickUpdateDomainColor(\'' + d.id + '\', this.value)">' +
      '<div class="domain-item-info">' +
        '<div class="domain-item-name">' + d.icon + ' ' + d.name + '</div>' +
        '<div class="domain-item-icon">Alert after ' + d.alertDays + ' days</div>' +
      '</div>' +
      '<div class="domain-item-actions">' +
        '<button class="domain-edit-btn" onclick="openDomainModal(\'' + d.id + '\')" title="Edit">✎</button>' +
        '<button class="domain-delete-btn" onclick="deleteDomain(\'' + d.id + '\')" title="Delete">✕</button>' +
      '</div>' +
    '</div>';
  });

  container.innerHTML = html;
  renderDomainFilterPills();
}

async function quickUpdateDomainColor(domainId, newColor) {
  var domain = appDomains.find(function(d) { return d.id === domainId; });
  if (domain) {
    domain.color = newColor;
    await dbPut('domains', domain);
    renderDomainBars();
    showToast('Color updated');
  }
}

/* ─── Domain Edit Modal ─── */
function openDomainModal(editId) {
  var modal = document.getElementById('domain-modal');
  var titleEl = document.getElementById('domain-modal-title');

  if (editId) {
    var domain = appDomains.find(function(d) { return d.id === editId; });
    if (!domain) return;
    titleEl.textContent = 'Edit Domain';
    document.getElementById('domain-edit-id').value = editId;
    document.getElementById('domain-edit-name').value = domain.name;
    document.getElementById('domain-edit-icon').value = domain.icon;
    document.getElementById('domain-edit-color').value = domain.color;
    document.getElementById('domain-edit-color-hex').textContent = domain.color;
    document.getElementById('domain-edit-alert').value = domain.alertDays;
  } else {
    titleEl.textContent = 'Add Domain';
    document.getElementById('domain-edit-id').value = '';
    document.getElementById('domain-edit-name').value = '';
    document.getElementById('domain-edit-icon').value = '';
    document.getElementById('domain-edit-color').value = '#3B82F6';
    document.getElementById('domain-edit-color-hex').textContent = '#3B82F6';
    document.getElementById('domain-edit-alert').value = 5;
  }

  modal.classList.add('open');
}

function closeDomainModal() {
  document.getElementById('domain-modal').classList.remove('open');
}

// Update hex display when color changes
document.getElementById('domain-edit-color').addEventListener('input', function() {
  document.getElementById('domain-edit-color-hex').textContent = this.value.toUpperCase();
});

async function saveDomain() {
  var editId = document.getElementById('domain-edit-id').value;
  var name = document.getElementById('domain-edit-name').value.trim();
  var icon = document.getElementById('domain-edit-icon').value.trim();
  var color = document.getElementById('domain-edit-color').value;
  var alertDays = parseInt(document.getElementById('domain-edit-alert').value) || 5;

  if (!name) {
    showToast('Name is required');
    return;
  }

  if (editId) {
    // Update existing
    var domain = appDomains.find(function(d) { return d.id === editId; });
    if (domain) {
      domain.name = name;
      domain.icon = icon || domain.icon;
      domain.color = color;
      domain.alertDays = alertDays;
      await dbPut('domains', domain);
      showToast('Domain updated');
    }
  } else {
    // Create new
    var newDomain = {
      id: genId(),
      name: name,
      icon: icon || '📌',
      color: color,
      alertDays: alertDays,
      order: appDomains.length
    };
    await dbPut('domains', newDomain);
    appDomains.push(newDomain);
    showToast('Domain added');
  }

  // Refresh
  appDomains = await dbGetAll('domains');
  appDomains.sort(function(a, b) { return a.order - b.order; });
  renderSettingsDomainList();
  renderDomainBars();
  closeDomainModal();
}

async function deleteDomain(domainId) {
  if (appDomains.length <= 1) {
    showToast('Cannot delete last domain');
    return;
  }
  if (!confirm('Delete this domain? Tasks in this domain will become unassigned.')) return;

  await dbDelete('domains', domainId);
  appDomains = appDomains.filter(function(d) { return d.id !== domainId; });

  // Reorder
  for (var i = 0; i < appDomains.length; i++) {
    appDomains[i].order = i;
    await dbPut('domains', appDomains[i]);
  }

  renderSettingsDomainList();
  renderDomainBars();
  showToast('Domain deleted');
}

/* ═══════════════════════════════════════════
   PROJECTS — Phase 8
   ═══════════════════════════════════════════ */
var allProjects = [];
var showArchivedProjects = false;
var currentProjectId = null;

async function loadProjects() {
  allProjects = await dbGetAll('projects');
  allProjects.sort(function(a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
}

/* ─── Render project list (Projects tab) ─── */
async function renderProjectList() {
  await loadProjects();

  var container = document.getElementById('proj-list-container');
  var emptyEl = document.getElementById('proj-empty');
  var countEl = document.getElementById('proj-count');
  if (!container) return;



  var visible = allProjects.filter(function(p) {
    return showArchivedProjects ? true : !p.archived;
  });

  var total = allProjects.filter(function(p) { return !p.archived; }).length;
  var archived = allProjects.filter(function(p) { return p.archived; }).length;
  countEl.textContent = total + ' active' + (archived ? ' · ' + archived + ' archived' : '');

  // Archive toggle text
  var toggleText = document.getElementById('proj-archive-toggle-text');
  if (toggleText) toggleText.textContent = showArchivedProjects ? 'Hide archived' : 'Show archived';

  if (visible.length === 0) {
    container.innerHTML = '';
    emptyEl.style.display = '';
    return;
  }
  emptyEl.style.display = 'none';

  var html = '<div class="proj-list">';
  visible.forEach(function(proj) {
    var domain = appDomains.find(function(d) { return d.id === proj.domain; });
    var color = domain ? domain.color : '#555';
    var domainLabel = domain ? (domain.icon + ' ' + domain.name) : '';
    var subtasks = allTasks.filter(function(t) { return t.projectId === proj.id && !t.archived; });
    var done = subtasks.filter(function(t) { return t.status === 'done'; }).length;
    var total2 = subtasks.length;
    var pct = total2 > 0 ? Math.round((done / total2) * 100) : 0;

    html += '<div class="proj-card' + (proj.archived ? ' is-archived' : '') + '" onclick="openProjectDetail(\'' + proj.id + '\')">' +
      '<div class="proj-swipe-hint">Archive</div>' +
      '<div class="proj-card-inner" data-proj-id="' + proj.id + '">' +
        '<div class="proj-card-top">' +
          '<div class="proj-domain-dot" style="background:' + color + '"></div>' +
          '<div class="proj-card-title">' + escapeHtml(proj.title) + '</div>' +
          (proj.archived ? '<span class="proj-card-archived-badge">archived</span>' : '<div class="proj-card-domain">' + domainLabel + '</div>') +
        '</div>' +
        '<div class="proj-progress-row">' +
          '<div class="proj-progress-track">' +
            '<div class="proj-progress-fill" style="width:' + pct + '%;background:' + color + '"></div>' +
          '</div>' +
          '<div class="proj-progress-label">' + done + '/' + total2 + '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  });
  html += '</div>';
  container.innerHTML = html;

  // Swipe-to-archive on project cards
  initProjectSwipe();

  // Refresh overview panel
  renderActiveProjectsSummary();
}

/* ─── Swipe left = archive on project cards ─── */
function initProjectSwipe() {
  var cards = document.querySelectorAll('.proj-card-inner');
  cards.forEach(function(inner) {
    var startX = 0, swiping = false;
    inner.addEventListener('touchstart', function(e) {
      startX = e.touches[0].clientX;
      swiping = true;
    }, { passive: true });
    inner.addEventListener('touchmove', function(e) {
      if (!swiping) return;
      var dx = e.touches[0].clientX - startX;
      if (dx < 0) inner.style.transform = 'translateX(' + Math.max(dx, -80) + 'px)';
    }, { passive: true });
    inner.addEventListener('touchend', function(e) {
      if (!swiping) return;
      swiping = false;
      var dx = e.changedTouches[0].clientX - startX;
      if (dx < -60) {
        var projId = inner.dataset.projId;
        inner.style.transform = 'translateX(-80px)';
        setTimeout(function() {
          inner.style.transform = '';
          archiveProject(projId, true);
        }, 200);
      } else {
        inner.style.transform = '';
      }
    }, { passive: true });
  });
}

/* ─── Open project detail overlay ─── */
async function openProjectDetail(projectId) {
  currentProjectId = projectId;
  document.getElementById('proj-overlay').classList.add('open');
  await renderProjectDetail(projectId);
}

function closeProjectDetail() {
  document.getElementById('proj-overlay').classList.remove('open');
  currentProjectId = null;
}

async function renderProjectDetail(projectId) {
  var proj = await dbGet('projects', projectId);
  if (!proj) return;

  var domain = appDomains.find(function(d) { return d.id === proj.domain; });
  var color = domain ? domain.color : '#555';

  // Header
  document.getElementById('proj-overlay-title').textContent = proj.title;
  var archiveBtn = document.getElementById('proj-overlay-archive-btn');
  archiveBtn.textContent = proj.archived ? 'Unarchive' : 'Archive';

  // Get subtasks

  var subtasks = allTasks.filter(function(t) { return t.projectId === projectId && !t.archived; });
  subtasks.sort(function(a, b) { return (a.createdAt || 0) - (b.createdAt || 0); });
  var done = subtasks.filter(function(t) { return t.status === 'done'; }).length;
  var total = subtasks.length;
  var pct = total > 0 ? Math.round((done / total) * 100) : 0;

  // Get related calendar slots
  var allSlots = await dbGetAll('calendar_slots');
  var subtaskIds = subtasks.map(function(t) { return t.id; });
  var relatedSlots = allSlots.filter(function(s) { return subtaskIds.indexOf(s.taskId) >= 0; });
  var today = new Date();
  var todayStr = calDateStr(today);
  var upcoming = relatedSlots.filter(function(s) { return s.date >= todayStr; }).sort(function(a, b) { return a.date.localeCompare(b.date) || (a.startHour - b.startHour); });
  var past = relatedSlots.filter(function(s) { return s.date < todayStr; }).sort(function(a, b) { return b.date.localeCompare(a.date); }).slice(0, 5);

  // Build body HTML
  var html = '';

  // Domain + progress
  html += '<div class="proj-detail-domain-row">' +
    '<div class="proj-detail-domain-pill" style="background:' + color + '22;color:' + color + ';border:1px solid ' + color + '44;">' +
      (domain ? domain.icon + ' ' + domain.name : 'No domain') +
    '</div>' +
    (proj.archived ? '<span style="font-size:11px;color:var(--text-tertiary);background:var(--bg-tertiary);padding:4px 10px;border-radius:12px;">Archived</span>' : '') +
  '</div>';

  html += '<div class="proj-detail-progress">' +
    '<div class="proj-detail-progress-label">Progress</div>' +
    '<div class="proj-detail-progress-nums">' +
      '<span class="big">' + done + '</span>' +
      '<span class="small">/ ' + total + ' tasks</span>' +
    '</div>' +
    '<div class="proj-progress-row">' +
      '<div class="proj-progress-track">' +
        '<div class="proj-progress-fill" style="width:' + pct + '%;background:' + color + '"></div>' +
      '</div>' +
      '<div class="proj-progress-label">' + pct + '%</div>' +
    '</div>' +
  '</div>';

  // Notes
  html += '<div class="proj-section">' +
    '<div class="proj-section-title">Notes</div>' +
    '<textarea class="proj-notes-area" id="proj-detail-notes" oninput="projNotesChanged()" placeholder="Goals, context, links...">' + escapeHtml(proj.notes || '') + '</textarea>' +
    '<button class="proj-notes-save-btn" id="proj-notes-save-btn" onclick="saveProjNotes(\'' + projectId + '\')">Save notes</button>' +
  '</div>';

  // Subtasks
  html += '<div class="proj-section">' +
    '<div class="proj-section-title">Subtasks</div>';

  if (subtasks.length > 0) {
    html += '<div class="subtask-list">';
    subtasks.forEach(function(t) {
      var isDone = t.status === 'done';
      html += '<div class="subtask-item' + (isDone ? ' is-done' : '') + '">' +
        '<button class="subtask-check' + (isDone ? ' checked' : '') + '" onclick="toggleSubtaskDone(\'' + t.id + '\',\'' + projectId + '\')">' +
          (isDone ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"><polyline points="20 6 9 17 4 12"></polyline></svg>' : '') +
        '</button>' +
        '<div class="subtask-title" onclick="openTaskForm(\'' + t.id + '\')">' + escapeHtml(t.title) + '</div>' +
        '<div class="subtask-meta">' + (DURATION_LABELS[t.duration] || (t.duration ? t.duration + 'm' : '')) + '</div>' +
        '<button class="subtask-open" onclick="openTaskForm(\'' + t.id + '\')" title="Edit">' +
          '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>' +
        '</button>' +
      '</div>';
    });
    html += '</div>';
  }

  html += '<button class="proj-add-subtask-btn" onclick="addSubtaskToProject(\'' + projectId + '\')">' +
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>' +
    '+ Add Subtask' +
  '</button>' +
  '</div>';

  // Related calendar slots
  if (upcoming.length > 0 || past.length > 0) {
    html += '<div class="proj-section">' +
      '<div class="proj-section-title">Calendar</div>';

    if (upcoming.length > 0) {
      html += '<div style="font-size:11px;color:var(--text-tertiary);margin-bottom:6px;">Upcoming</div>';
      upcoming.forEach(function(slot) {
        var task = subtasks.find(function(t) { return t.id === slot.taskId; });
        if (!task) return;
        html += '<div class="cal-slot-mini">' +
          '<div class="cal-slot-mini-color" style="background:' + color + '"></div>' +
          '<div class="cal-slot-mini-info">' +
            '<div class="cal-slot-mini-title">' + escapeHtml(task.title) + '</div>' +
            '<div class="cal-slot-mini-time">' + slot.date + ' at ' + formatSlotTime(slot.startHour, slot.startMin) + '</div>' +
          '</div>' +
        '</div>';
      });
    }

    if (past.length > 0) {
      html += '<div style="font-size:11px;color:var(--text-tertiary);margin-bottom:6px;margin-top:' + (upcoming.length ? '10px' : '0') + ';">Past</div>';
      past.forEach(function(slot) {
        var task = subtasks.find(function(t) { return t.id === slot.taskId; });
        if (!task) return;
        html += '<div class="cal-slot-mini" style="opacity:0.5;">' +
          '<div class="cal-slot-mini-color" style="background:' + color + '"></div>' +
          '<div class="cal-slot-mini-info">' +
            '<div class="cal-slot-mini-title">' + escapeHtml(task.title) + '</div>' +
            '<div class="cal-slot-mini-time">' + slot.date + ' at ' + formatSlotTime(slot.startHour, slot.startMin) + '</div>' +
          '</div>' +
        '</div>';
      });
    }
    html += '</div>';
  }

  document.getElementById('proj-overlay-body').innerHTML = html;
}

function projNotesChanged() {
  document.getElementById('proj-notes-save-btn').style.display = '';
}

async function saveProjNotes(projectId) {
  var proj = await dbGet('projects', projectId);
  if (!proj) return;
  proj.notes = document.getElementById('proj-detail-notes').value;
  proj.updatedAt = Date.now();
  await dbPut('projects', proj);
  document.getElementById('proj-notes-save-btn').style.display = 'none';
  showToast('Notes saved');
  await renderProjectList();
}

/* ─── Add subtask to project ─── */
function addSubtaskToProject(projectId) {
  var proj = allProjects.find(function(p) { return p.id === projectId; });
  if (!proj) return;
  // Pre-set domain from project
  openTaskForm(null, projectId);
  // After form opens, pre-select domain
  setTimeout(function() {
    selectChip('tf-domain-chips', proj.domain);
    selectChip('tf-type-chips', 'project');
  }, 50);
}

/* ─── Toggle subtask done ─── */
async function toggleSubtaskDone(taskId, projectId) {
  var task = await dbGet('tasks', taskId);
  if (!task) return;
  try {
    task.status = task.status === 'done' ? 'todo' : 'done';
    task.completedAt = task.status === 'done' ? Date.now() : null;
    task.updatedAt = Date.now();
    await dbPut('tasks', task);
    await loadAllTasks();
    await renderProjectDetail(projectId);
    await renderProjectList();
    renderDomainBars();
  } catch (err) {
    console.error('[toggleSubtaskDone]', err);
    showToast('Action failed — try again');
  }
}

/* ─── Project CRUD ─── */
function openProjectModal(editId) {
  var modal = document.getElementById('proj-modal');
  var titleEl = document.getElementById('proj-modal-title');

  // Populate domain chips
  var chipsContainer = document.getElementById('proj-domain-chips');
  var html = '';
  appDomains.forEach(function(d) {
    html += '<button class="chip-option" data-value="' + d.id + '" style="--dc:' + d.color + '">' + d.icon + ' ' + d.name + '</button>';
  });
  chipsContainer.innerHTML = html;
  initChipSelector('proj-domain-chips');

  if (editId) {
    var proj = allProjects.find(function(p) { return p.id === editId; });
    if (!proj) return;
    titleEl.textContent = 'Edit Project';
    document.getElementById('proj-edit-id').value = proj.id;
    document.getElementById('proj-edit-name').value = proj.title;
    document.getElementById('proj-edit-notes').value = proj.notes || '';
    setTimeout(function() { selectChip('proj-domain-chips', proj.domain); }, 20);
  } else {
    titleEl.textContent = 'New Project';
    document.getElementById('proj-edit-id').value = '';
    document.getElementById('proj-edit-name').value = '';
    document.getElementById('proj-edit-notes').value = '';
    setTimeout(function() { selectChip('proj-domain-chips', appDomains.length > 0 ? appDomains[0].id : ''); }, 20);
  }

  modal.classList.add('open');
  setTimeout(function() { document.getElementById('proj-edit-name').focus(); }, 300);
}

function closeProjectModal() {
  document.getElementById('proj-modal').classList.remove('open');
}

async function saveProjectModal() {
  var editId = document.getElementById('proj-edit-id').value;
  var title = document.getElementById('proj-edit-name').value.trim();
  var domain = getSelectedChip('proj-domain-chips');
  var notes = document.getElementById('proj-edit-notes').value.trim();

  if (!title) { showToast('Title is required'); return; }
  if (!domain) { showToast('Pick a domain'); return; }

  if (editId) {
    var proj = await dbGet('projects', editId);
    if (proj) {
      proj.title = title;
      proj.domain = domain;
      proj.notes = notes;
      proj.updatedAt = Date.now();
      await dbPut('projects', proj);
      showToast('Project updated');
      if (currentProjectId === editId) {
        document.getElementById('proj-overlay-title').textContent = title;
        await renderProjectDetail(editId);
      }
    }
  } else {
    var newProj = {
      id: genId(),
      title: title,
      domain: domain,
      notes: notes,
      archived: false,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    await dbPut('projects', newProj);
    showToast('Project created');
  }

  closeProjectModal();
  await renderProjectList();
}

function editCurrentProject() {
  if (currentProjectId) openProjectModal(currentProjectId);
}

async function archiveCurrentProject() {
  if (!currentProjectId) return;
  await archiveProject(currentProjectId);
  await renderProjectDetail(currentProjectId);
}

async function archiveProject(projectId, silent) {
  var proj = await dbGet('projects', projectId);
  if (!proj) return;
  proj.archived = !proj.archived;
  proj.updatedAt = Date.now();
  await dbPut('projects', proj);
  if (!silent) showToast(proj.archived ? 'Project archived' : 'Project unarchived');
  await renderProjectList();
}

async function deleteCurrentProject() {
  if (!currentProjectId) return;
  if (!confirm('Delete this project? Subtasks will not be deleted.')) return;
  try {
    await dbDelete('projects', currentProjectId);
    for (var i = 0; i < allTasks.length; i++) {
      if (allTasks[i].projectId === currentProjectId) {
        allTasks[i].projectId = null;
        await dbPut('tasks', allTasks[i]);
      }
    }
    await loadAllTasks();
    showToast('Project deleted');
    closeProjectDetail();
    await renderProjectList();
  } catch (err) {
    console.error('[deleteCurrentProject]', err);
    showToast('Delete failed — try again');
  }
}

function toggleShowArchivedProjects() {
  showArchivedProjects = !showArchivedProjects;
  renderProjectList();
}

/* ─── Dashboard overview: active projects summary ─── */
async function renderActiveProjectsSummary() {
  var container = document.getElementById('active-projects-list');
  if (!container) return;


  var active = allProjects.filter(function(p) { return !p.archived; });

  if (active.length === 0) {
    container.innerHTML = '<div class="empty-state" style="padding:20px 0;">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>' +
      '<h3>No projects yet</h3><p>Create one in the Projects tab.</p></div>';
    return;
  }

  var html = '';
  active.slice(0, 5).forEach(function(proj) {
    var domain = appDomains.find(function(d) { return d.id === proj.domain; });
    var color = domain ? domain.color : '#555';
    var subtasks = allTasks.filter(function(t) { return t.projectId === proj.id && !t.archived; });
    var done = subtasks.filter(function(t) { return t.status === 'done'; }).length;
    var total = subtasks.length;
    var pct = total > 0 ? Math.round((done / total) * 100) : 0;

    html += '<div class="dash-proj-card" onclick="openProjectDetail(\'' + proj.id + '\')">' +
      '<div class="dash-proj-top">' +
        '<div class="proj-domain-dot" style="background:' + color + '"></div>' +
        '<div class="dash-proj-name">' + escapeHtml(proj.title) + '</div>' +
        '<div class="dash-proj-pct">' + pct + '%</div>' +
      '</div>' +
      '<div class="proj-progress-row">' +
        '<div class="proj-progress-track">' +
          '<div class="proj-progress-fill" style="width:' + pct + '%;background:' + color + '"></div>' +
        '</div>' +
        '<div class="proj-progress-label">' + done + '/' + total + '</div>' +
      '</div>' +
    '</div>';
  });

  if (active.length > 5) {
    html += '<div style="text-align:center;font-size:11px;color:var(--text-tertiary);padding:6px;">+' + (active.length - 5) + ' more in Projects tab</div>';
  }

  container.innerHTML = html;
}

/* ═══════════════════════════════════════════
   EXPORT / IMPORT — Phase 9
   ═══════════════════════════════════════════ */
async function exportData() {
  try {
    var allStores = ['tasks', 'projects', 'calendar_slots', 'routines', 'domains', 'daily_logs', 'settings', 'alarms'];
    var exportObj = { _meta: { app: 'KrasbauerOS', version: '1.0', exportedAt: new Date().toISOString() } };

    for (var i = 0; i < allStores.length; i++) {
      exportObj[allStores[i]] = await dbGetAll(allStores[i]);
    }

    var blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'KrasbauerOS_backup_' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    URL.revokeObjectURL(url);

    // Record last backup time
    if (appSettings) {
      appSettings.lastBackupAt = Date.now();
      await dbPut('settings', appSettings);
    }

    showToast('Data exported');
    renderBackupStatus();
  } catch (err) {
    console.error('[Export]', err);
    showToast('Export failed');
  }
}

/* ─── Import: parse file then show preview modal ─── */
var _pendingImportData = null;

async function importData(event) {
  var file = event.target.files[0];
  if (!file) return;
  event.target.value = '';

  try {
    var text = await file.text();
    var data = JSON.parse(text);

    if (!data._meta || data._meta.app !== 'KrasbauerOS') {
      showToast('Invalid backup file');
      return;
    }

    _pendingImportData = data;
    openImportPreview(data);
  } catch (err) {
    console.error('[Import parse]', err);
    showToast('Could not read file');
  }
}

function openImportPreview(data) {
  var modal = document.getElementById('import-preview-modal');

  // Export date
  var dateEl = document.getElementById('import-preview-date');
  if (data._meta && data._meta.exportedAt) {
    var d = new Date(data._meta.exportedAt);
    dateEl.textContent = 'Exported: ' + d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) + ' at ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  } else {
    dateEl.textContent = 'Export date unknown';
  }

  // Preview rows
  var rows = [
    { icon: '☑️', label: 'Tasks',     store: 'tasks' },
    { icon: '📁', label: 'Projects',  store: 'projects' },
    { icon: '🌐', label: 'Domains',   store: 'domains' },
    { icon: '📅', label: 'Calendar slots', store: 'calendar_slots' },
    { icon: '🔄', label: 'Routines',  store: 'routines' },
    { icon: '📓', label: 'Daily logs', store: 'daily_logs' }
  ];

  var html = '';
  rows.forEach(function(row) {
    var count = (data[row.store] && Array.isArray(data[row.store])) ? data[row.store].length : 0;
    html += '<div class="import-preview-row">' +
      '<div class="import-preview-label">' + row.icon + ' ' + row.label + '</div>' +
      '<div class="import-preview-count">' + count + '</div>' +
    '</div>';
  });
  document.getElementById('import-preview-rows').innerHTML = html;

  modal.classList.add('open');
}

function closeImportPreview() {
  document.getElementById('import-preview-modal').classList.remove('open');
  _pendingImportData = null;
}

async function confirmImport() {
  var data = _pendingImportData;
  if (!data) return;
  closeImportPreview();

  try {
    var stores = ['tasks', 'projects', 'calendar_slots', 'routines', 'domains', 'daily_logs', 'settings', 'alarms'];
    for (var i = 0; i < stores.length; i++) {
      var storeName = stores[i];
      if (data[storeName] && Array.isArray(data[storeName])) {
        await dbClear(storeName);
        for (var j = 0; j < data[storeName].length; j++) {
          await dbPut(storeName, data[storeName][j]);
        }
      }
    }

    // Reload app state
    appDomains = await dbGetAll('domains');
    appDomains.sort(function(a, b) { return a.order - b.order; });
    appSettings = await dbGet('settings', 'main');
    await loadAllTasks();

    renderDomainBars();
    renderSettingsDomainList();
    loadSettingsUI();
    await renderTaskList();
    await renderCalendar();
    await renderDashboardToday();
    await renderProjectList();

    showToast('Data imported successfully');
  } catch (err) {
    console.error('[Import]', err);
    showToast('Import failed');
  }
}

/* ─── Backup reminder ─── */
async function renderCacheVersion() {
  var el = document.getElementById('cache-version-label');
  if (!el) return;
  if ('caches' in window) {
    var keys = await caches.keys();
    var kosCache = keys.find(function(k) { return k.startsWith('krasbauer-os-'); });
    el.textContent = kosCache || 'no cache';
  } else {
    el.textContent = 'not cached';
  }
}

function renderPatchnotes() {
  var badge = document.getElementById('header-version-badge');
  if (badge) badge.textContent = 'v' + APP_VERSION;
  var aboutVer = document.getElementById('app-version-label');
  if (aboutVer) aboutVer.textContent = ' v' + APP_VERSION;
  var el = document.getElementById('patchnotes-list');
  if (!el) return;
  el.innerHTML = PATCHNOTES.map(function(entry) {
    return '<div class="patchnote-entry">' +
      '<div class="patchnote-header">' +
        '<span class="patchnote-version">v' + entry.version + '</span>' +
        '<span class="patchnote-date">' + entry.date + '</span>' +
      '</div>' +
      '<ul class="patchnote-changes">' +
        entry.changes.map(function(c) { return '<li>' + escapeHtml(c) + '</li>'; }).join('') +
      '</ul>' +
    '</div>';
  }).join('');
}

function renderBackupStatus() {
  var card = document.getElementById('backup-status-card');
  if (!card) return;

  var lastBackup = appSettings && appSettings.lastBackupAt;
  var now = Date.now();
  var sevenDays = 7 * 24 * 60 * 60 * 1000;
  var isOverdue = !lastBackup || (now - lastBackup) > sevenDays;

  var labelText, subText;
  if (!lastBackup) {
    labelText = 'Never backed up';
    subText = 'Export your data to keep it safe.';
  } else {
    var daysAgo = Math.floor((now - lastBackup) / (24 * 60 * 60 * 1000));
    if (daysAgo === 0) {
      labelText = 'Backed up today';
      subText = 'Your data is safe.';
    } else if (daysAgo === 1) {
      labelText = 'Last backup: yesterday';
      subText = isOverdue ? 'Consider exporting soon.' : '';
    } else {
      labelText = 'Last backup: ' + daysAgo + ' days ago';
      subText = isOverdue ? 'Time to export your data.' : '';
    }
  }

  card.style.display = '';
  card.innerHTML = '<div class="backup-status' + (isOverdue ? ' overdue' : '') + '">' +
    '<div class="backup-status-text">' +
      '<strong>' + labelText + '</strong>' +
      (subText ? subText : '') +
    '</div>' +
    (isOverdue ? '<button class="backup-status-export-btn" onclick="exportData()">Export now</button>' : '') +
  '</div>';
}

async function confirmResetData() {
  if (!confirm('This will permanently delete ALL your data. This cannot be undone.')) return;
  if (!confirm('Are you absolutely sure?')) return;

  try {
    var stores = ['tasks', 'projects', 'calendar_slots', 'routines', 'domains', 'daily_logs', 'settings', 'alarms'];
    for (var i = 0; i < stores.length; i++) {
      await dbClear(stores[i]);
    }
    await seedDefaults();
    appDomains = await dbGetAll('domains');
    appDomains.sort(function(a, b) { return a.order - b.order; });
    appSettings = await dbGet('settings', 'main');
    await loadAllTasks();
    renderDomainBars();
    renderSettingsDomainList();
    loadSettingsUI();
    showToast('All data reset');
  } catch (err) {
    console.error('[confirmResetData]', err);
    showToast('Reset failed — try again');
  }
}

/* ═══════════════════════════════════════════
   TOAST
   ═══════════════════════════════════════════ */
var toastTimeout = null;

function showToast(msg) {
  var toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(function() {
    toast.classList.remove('show');
  }, 2500);
}

/* ═══════════════════════════════════════════
   NOTIFICATIONS
   ═══════════════════════════════════════════ */
var notifRequested = false;

document.addEventListener('click', function() {
  if (notifRequested) return;
  notifRequested = true;
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission().then(function(perm) {
      console.log('[Notifications]', perm);
    });
  }
}, { once: true });

/* ═══════════════════════════════════════════
   REFRESH DATA
   ═══════════════════════════════════════════ */
async function refreshAllData() {
  try {
    await loadAllTasks();
    await loadProjects();
    appSettings = await dbGet('settings', 'main');
    appDomains = await dbGetAll('domains');
    appDomains.sort(function(a, b) { return a.order - b.order; });
    await renderCalendar();
    await renderDashboardToday();
    renderDomainBars();
    await applyFilters();
    showToast('Data refreshed');
  } catch (err) {
    console.error('[refreshAllData]', err);
    showToast('Refresh failed — try again');
  }
}

/* ═══════════════════════════════════════════
   ONBOARDING — Phase 10
   ═══════════════════════════════════════════ */
var onboardingStep = 0;
var _obTimes = {};

function showOnboarding() {
  onboardingStep = 0;
  document.getElementById('onboarding-overlay').classList.add('open');
  renderOnboardingStep();
}

function renderOnboardingStep() {
  var dots = document.getElementById('onboarding-step-dots');
  var body = document.getElementById('onboarding-body');
  var footer = document.getElementById('onboarding-footer');

  // Step dots
  var dotHtml = '';
  for (var i = 0; i < 3; i++) {
    dotHtml += '<div class="ritual-step-dot' + (i === onboardingStep ? ' active' : '') + '"></div>';
  }
  dots.innerHTML = dotHtml;

  if (onboardingStep === 0) {
    body.innerHTML =
      '<div class="onboarding-logo">KrasbauerOS</div>' +
      '<div class="onboarding-tagline">Your personal Life OS.</div>' +
      '<div class="onboarding-desc">One cockpit for every task, project, and domain in your life. Built for clarity, built for you.</div>';
    footer.innerHTML =
      '<button class="ritual-btn ritual-btn-primary" onclick="onboardingNext()">Get Started →</button>';

  } else if (onboardingStep === 1) {
    var wake = (appSettings && appSettings.wakeTime) || '07:00';
    var sleep = (appSettings && appSettings.sleepTime) || '23:00';
    var ritual = (appSettings && appSettings.ritualAlarmTime) || '21:00';
    body.innerHTML =
      '<div class="onboarding-tagline">Set your schedule</div>' +
      '<div class="onboarding-desc">KrasbauerOS uses these times to build your day.</div>' +
      '<div class="onboarding-schedule-form">' +
        '<div class="form-row"><span class="form-label">Wake time</span><input type="time" id="ob-wake" value="' + wake + '" class="form-input"></div>' +
        '<div class="form-row"><span class="form-label">Sleep time</span><input type="time" id="ob-sleep" value="' + sleep + '" class="form-input"></div>' +
        '<div class="form-row"><span class="form-label">Shutdown alarm</span><input type="time" id="ob-ritual" value="' + ritual + '" class="form-input"></div>' +
      '</div>';
    footer.innerHTML =
      '<button class="ritual-btn ritual-btn-secondary" onclick="onboardingBack()">← Back</button>' +
      '<button class="ritual-btn ritual-btn-primary" onclick="onboardingNext()">Next →</button>';

  } else if (onboardingStep === 2) {
    body.innerHTML =
      '<div class="onboarding-ready-icon">🚀</div>' +
      '<div class="onboarding-ready-title">You\'re all set, Krasbauer.</div>' +
      '<div class="onboarding-ready-sub">Your cockpit is ready. Start by adding your first task or project.</div>';
    footer.innerHTML =
      '<button class="ritual-btn ritual-btn-secondary" onclick="onboardingBack()">← Back</button>' +
      '<button class="ritual-btn ritual-btn-primary" onclick="completeOnboarding()">Let\'s go ✓</button>';
  }
}

function onboardingNext() {
  if (onboardingStep === 1) {
    var wakeEl = document.getElementById('ob-wake');
    var sleepEl = document.getElementById('ob-sleep');
    var ritualEl = document.getElementById('ob-ritual');
    if (wakeEl) _obTimes.wake = wakeEl.value;
    if (sleepEl) _obTimes.sleep = sleepEl.value;
    if (ritualEl) _obTimes.ritual = ritualEl.value;
  }
  if (onboardingStep < 2) { onboardingStep++; renderOnboardingStep(); }
}

function onboardingBack() {
  if (onboardingStep > 0) { onboardingStep--; renderOnboardingStep(); }
}

async function completeOnboarding() {
  if (_obTimes.wake) appSettings.wakeTime = _obTimes.wake;
  if (_obTimes.sleep) appSettings.sleepTime = _obTimes.sleep;
  if (_obTimes.ritual) appSettings.ritualAlarmTime = _obTimes.ritual;
  await dbPut('settings', appSettings);
  loadSettingsUI();
  localStorage.setItem('kos-onboarded', 'true');
  _obTimes = {};
  document.getElementById('onboarding-overlay').classList.remove('open');
}

/* ═══════════════════════════════════════════
   BOOT
   ═══════════════════════════════════════════ */
initApp();

console.log('%c KrasbauerOS v' + APP_VERSION + ' ', 'background: #0a0a0f; color: #3B82F6; font-size: 14px; font-weight: bold; padding: 8px 12px; border: 1px solid #3B82F6; border-radius: 4px;');
