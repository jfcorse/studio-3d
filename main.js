// Studio 3D : application Windows (Electron) autour de studio-3d.html.
//
// Le code affiché vient :
//  - de la copie modifiable dans « Documents\Studio 3D » si elle existe (menu Code > Modifier le code),
//  - sinon du fichier livré avec l'application.
// Quand la copie modifiable change sur le disque, la fenêtre se recharge toute seule.
const { app, BrowserWindow, Menu, shell, dialog, ipcMain, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { autoUpdater } = require('electron-updater');

const BUNDLED_DIR = __dirname;
const HTML = 'studio-3d.html';
const USER_DIR = path.join(app.getPath('documents'), 'Studio 3D');
const USER_HTML = path.join(USER_DIR, HTML);

let win = null;
let watcher = null;
let reloadTimer = null;

/* ---------- Journal de l'application (Aide > Ouvrir le journal) ----------
   Chaque étape des opérations sur les fichiers y est notée : si l'application se fige, le journal dit où. */
const fsp = fs.promises;
const LOG_FILE = path.join(app.getPath('userData'), 'journal.txt');
function log(...a) {
  const line = new Date().toISOString().replace('T', ' ').slice(0, 23) + '  ' + a.map(x => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ') + '\n';
  fsp.appendFile(LOG_FILE, line).catch(() => {});
}
// une opération sur un fichier qui ne répond pas (dossier synchronisé, antivirus…) ne doit jamais figer l'application
const withTimeout = (p, ms, what) => Promise.race([
  p, new Promise((_, rej) => setTimeout(() => rej(new Error(what + ' : pas de réponse après ' + ms / 1000 + ' s')), ms)),
]);

/* ---------- Plans (menu Fichier) ---------- */
// Les plans s'enregistrent en fichiers .json, par défaut dans « Documents\Studio 3D\Plans ».
// Si ce dossier ne répond pas ou refuse l'écriture, ils vont dans un dossier de secours de l'application.
const PLANS_DIR = path.join(USER_DIR, 'Plans');
const FALLBACK_DIR = path.join(app.getPath('userData'), 'Plans');
let plansDir = PLANS_DIR;
async function ensurePlansDir() {
  try {
    await withTimeout(fsp.mkdir(plansDir, { recursive: true }), 5000, 'Création du dossier ' + plansDir);
  } catch (e) {
    log('dossier des plans indisponible :', e.message);
    if (plansDir === FALLBACK_DIR) throw e;
    plansDir = FALLBACK_DIR;
    await withTimeout(fsp.mkdir(plansDir, { recursive: true }), 5000, 'Création du dossier ' + plansDir);
    log('dossier de secours :', plansDir);
  }
  return plansDir;
}
const exists = f => withTimeout(fsp.access(f).then(() => true, () => false), 5000, 'Accès à ' + f).catch(() => false);
const RECENT_FILE = path.join(app.getPath('userData'), 'plans-recents.json');
let doc = { name: '', path: null, dirty: false };   // plan ouvert, pour le titre de la fenêtre
let appPlans = [];                                   // plans gardés dans l'application (ancienne liste « Mes plans »)
let recent = [];
try { recent = JSON.parse(fs.readFileSync(RECENT_FILE, 'utf8')).filter(f => typeof f === 'string'); } catch (e) { recent = []; }

function addRecent(file) {
  recent = [file, ...recent.filter(f => f !== file)].slice(0, 8);
  fsp.writeFile(RECENT_FILE, JSON.stringify(recent)).catch(() => { /* liste non gardée */ });
  refreshMenu();
}

function updateTitle() {
  if (!win) return;
  const name = doc.name ? doc.name + (doc.dirty ? ' •' : '') + ' — ' : '';
  win.setTitle(name + 'Studio 3D' + (usingUserCopy() ? ' (version modifiée)' : ''));
}

const sendMenu = (cmd, arg) => { if (win) win.webContents.send('menu', cmd, arg); };

// Une seule boîte de fichiers de Windows à la fois ; la barre de menus n'est pas reconstruite pendant
// qu'elle est ouverte (sous Windows, ces deux situations peuvent figer l'application).
let dialogOpen = false;
// la barre de menus n'est reconstruite qu'une fois les boîtes de dialogue fermées
let menuPending = false, menuTimer = null;
function refreshMenu() {
  if (dialogOpen) { menuPending = true; return; }
  menuPending = false;
  clearTimeout(menuTimer);
  menuTimer = setTimeout(buildMenu, 50);
}

// La page doit savoir gérer le menu Fichier ; une ancienne copie modifiée du code (menu Code) ne le sait pas.
let pageReady = false;
ipcMain.on('plan:ready', () => { pageReady = true; });
function checkPage() {
  if (pageReady) return true;
  dialog.showMessageBox(win, {
    type: 'warning', message: 'Cette version du code ne gère pas encore le menu Fichier.',
    detail: usingUserCopy() ? 'Tu utilises une copie modifiée du code, plus ancienne que l’application. Fais Code > Revenir à la version d’origine, ou recopie tes changements dans la nouvelle version.' : 'Recharge la page (Ctrl+R) puis réessaie.',
  });
  return false;
}

const safeName = n => (String(n || '').replace(/[<>:"/\\|?*\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Plan du studio').slice(0, 80);
const planDir = () => (doc.path ? path.dirname(doc.path) : plansDir);

async function openPlanFile(file) {
  if (!checkPage()) return;
  log('ouvrir récent', file);
  try {
    const data = await withTimeout(fsp.readFile(file, 'utf8'), 10000, 'Lecture de ' + file);
    sendMenu('opened', { path: file, data });
    addRecent(file);
  } catch (e) {
    log('erreur', e.message);
    recent = recent.filter(f => f !== file); refreshMenu();
    dialog.showErrorBox('Studio 3D', 'Impossible d’ouvrir ce plan :\n' + e.message);
  }
}

// « Ouvrir », « Enregistrer sous » et « Nouveau plan » s'affichent dans la page (fenêtres intégrées) :
// les boîtes de dialogue de fichiers de Windows peuvent figer l'application sur certains PC.
function openPlan() { log('menu : Ouvrir'); if (checkPage()) sendMenu('openDialog'); }
function saveAs() { log('menu : Enregistrer sous'); if (checkPage()) sendMenu('saveAsDialog'); }
function save() {
  log('menu : Enregistrer', doc.path || '(pas encore de fichier)');
  if (!checkPage()) return;
  if (doc.path) sendMenu('saveTo', doc.path);
  else sendMenu('saveAsDialog');
}
function newPlan() { log('menu : Nouveau plan'); if (checkPage()) sendMenu('newDialog'); }

// fichier de plan correspondant à un nom, dans le dossier des plans
ipcMain.handle('plan:target', async (_, name) => {
  log('cible', name);
  if (!doc.path) await ensurePlansDir();
  const file = path.join(planDir(), safeName(name) + '.json');
  const r = { path: file, exists: await exists(file), dir: planDir(), fallback: plansDir === FALLBACK_DIR };
  log('cible prête', r);
  return r;
});
// plans du dossier, les plus récents d'abord
ipcMain.handle('plan:files', async () => {
  log('liste des plans');
  await ensurePlansDir().catch(() => {});
  const dirs = [...new Set([PLANS_DIR, FALLBACK_DIR, planDir()])];
  const out = [];
  const add = async p => {
    if (out.some(o => o.path === p)) return;
    try { const st = await withTimeout(fsp.stat(p), 3000, 'Accès à ' + p); out.push({ name: path.basename(p).replace(/\.json$/i, ''), path: p, mtime: st.mtimeMs }); } catch (e) { /* absent */ }
  };
  for (const d of dirs) {
    try {
      const names = await withTimeout(fsp.readdir(d), 5000, 'Lecture du dossier ' + d);
      for (const f of names) if (/\.json$/i.test(f)) await add(path.join(d, f));
    } catch (e) { log('dossier illisible :', e.message); }
  }
  for (const p of recent) await add(p);
  log('liste prête :', out.length, 'plan(s)');
  return out.sort((x, y) => y.mtime - x.mtime);
});
ipcMain.handle('plan:read', async (_, file) => {
  log('lecture', file);
  const data = await withTimeout(fsp.readFile(file, 'utf8'), 10000, 'Lecture de ' + file);
  addRecent(file);
  return data;
});
ipcMain.on('app:log', (_, msg) => log('page :', String(msg).slice(0, 300)));
// dernier recours : boîte de fichiers de Windows, sans fenêtre parente (elle ne peut pas bloquer la fenêtre principale)
ipcMain.handle('plan:browse', async (_, { mode, name }) => {
  if (dialogOpen) return null;
  dialogOpen = true;
  try {
    const filters = [{ name: 'Plans du studio', extensions: ['json'] }];
    if (mode === 'save') {
      const r = await dialog.showSaveDialog({ title: 'Enregistrer le plan sous', defaultPath: path.join(planDir(), safeName(name) + '.json'), filters });
      return r.canceled ? null : r.filePath;
    }
    const r = await dialog.showOpenDialog({ title: 'Ouvrir un plan', defaultPath: planDir(), filters, properties: ['openFile'] });
    return r.canceled ? null : r.filePaths[0];
  } finally {
    dialogOpen = false;
    if (menuPending) refreshMenu();
  }
});

// la page envoie le contenu du plan : on l'écrit dans le fichier choisi
ipcMain.handle('plan:write', async (_, { path: file, data }) => {
  log('écriture', file);
  try {
    await withTimeout(fsp.mkdir(path.dirname(file), { recursive: true }), 5000, 'Création du dossier ' + path.dirname(file));
    await withTimeout(fsp.writeFile(file, data), 10000, 'Écriture de ' + file);
    addRecent(file);
    log('écrit');
    return { path: file };
  } catch (e) {
    log('erreur', e.message);
    dialog.showErrorBox('Studio 3D', 'Impossible d’enregistrer le plan :\n' + e.message);
    return null;
  }
});
ipcMain.on('plan:document', (_, d) => { doc = { name: String(d.name || ''), path: d.path || null, dirty: !!d.dirty }; updateTitle(); });
ipcMain.on('plan:list', (_, list) => { appPlans = Array.isArray(list) ? list.slice(0, 50) : []; refreshMenu(); });
// Connexion GitHub des plans (dépôt et jeton) : gardée chiffrée par Windows dans le dossier de l'application
const SECRET_FILE = path.join(app.getPath('userData'), 'github.bin');
ipcMain.handle('secret:get', async () => {
  try {
    const buf = await fsp.readFile(SECRET_FILE);
    return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(buf) : null;
  } catch (e) { return null; }
});
ipcMain.handle('secret:set', async (_, value) => {
  try {
    if (!value) { await fsp.unlink(SECRET_FILE).catch(() => {}); return true; }
    if (!safeStorage.isEncryptionAvailable()) return false;
    await fsp.writeFile(SECRET_FILE, safeStorage.encryptString(String(value)));
    return true;
  } catch (e) { log('secret:set', e.message); return false; }
});
ipcMain.on('app:alert', (_, msg) => { if (win) dialog.showMessageBox(win, { type: 'warning', message: String(msg) }); });

let userCopy = null;   // mémorisé : évite d'interroger le dossier Documents à chaque changement de titre
const usingUserCopy = () => (userCopy === null ? (userCopy = fs.existsSync(USER_HTML)) : userCopy);
const currentHtml = () => (usingUserCopy() ? USER_HTML : path.join(BUNDLED_DIR, HTML));

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else if (!fs.existsSync(d)) fs.copyFileSync(s, d);
  }
}

// Crée la copie modifiable (HTML + three.js) si elle n'existe pas encore.
function ensureUserCopy() {
  fs.mkdirSync(USER_DIR, { recursive: true });
  if (!fs.existsSync(USER_HTML)) fs.copyFileSync(path.join(BUNDLED_DIR, HTML), USER_HTML);
  copyDir(path.join(BUNDLED_DIR, 'vendor'), path.join(USER_DIR, 'vendor'));
}

function load() {
  if (!win) return;
  pageReady = false;
  userCopy = null;
  log('chargement', currentHtml());
  win.loadFile(currentHtml());
  updateTitle();
  watch();
}

// Recharge automatiquement quand on enregistre le fichier dans l'éditeur.
function watch() {
  if (watcher) { watcher.close(); watcher = null; }
  if (!usingUserCopy()) return;
  try {
    watcher = fs.watch(USER_DIR, (_, name) => {
      if (name && name !== HTML) return;
      clearTimeout(reloadTimer);
      reloadTimer = setTimeout(load, 400);
    });
  } catch (e) { /* pas de rechargement automatique, Ctrl+R reste possible */ }
}

function openInEditor(file) {
  if (process.platform === 'win32') {
    // VS Code s'il est installé, sinon le Bloc-notes
    const code = spawn('code', ['"' + file + '"'], { shell: true, detached: true, stdio: 'ignore', windowsHide: true });
    code.on('exit', c => { if (c !== 0) spawn('notepad.exe', [file], { detached: true, stdio: 'ignore' }).unref(); });
    code.unref();
  } else {
    shell.openPath(file);
  }
}

function editCode() {
  try {
    const fresh = !usingUserCopy();
    ensureUserCopy();
    if (fresh) load();
    openInEditor(USER_HTML);
    shell.showItemInFolder(USER_HTML);
  } catch (e) {
    dialog.showErrorBox('Studio 3D', 'Impossible de préparer la copie modifiable :\n' + e.message);
  }
}

async function restoreOriginal() {
  if (!usingUserCopy()) {
    await dialog.showMessageBox(win, { type: 'info', message: 'Tu utilises déjà la version d’origine.' });
    return;
  }
  const r = await dialog.showMessageBox(win, {
    type: 'warning',
    buttons: ['Revenir à l’origine', 'Annuler'],
    defaultId: 1, cancelId: 1,
    message: 'Revenir à la version d’origine du code ?',
    detail: 'Ta version modifiée sera gardée sous le nom « studio-3d.sauvegarde-<date>.html » dans ' + USER_DIR + '.\nTes plans et ton agencement ne sont pas touchés.',
  });
  if (r.response !== 0) return;
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  fs.renameSync(USER_HTML, path.join(USER_DIR, 'studio-3d.sauvegarde-' + stamp + '.html'));
  load();
}

/* ---------- Mises à jour automatiques (depuis les Releases GitHub) ----------
   Seule la version installée (Studio-3D-Setup) peut se mettre à jour ; la version portable non. */
const canUpdate = () => app.isPackaged && !process.env.PORTABLE_EXECUTABLE_DIR;
let manualCheck = false;

function setupUpdater() {
  if (!canUpdate()) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-not-available', () => {
    if (manualCheck) dialog.showMessageBox(win, { type: 'info', message: 'Studio 3D est à jour (version ' + app.getVersion() + ').' });
    manualCheck = false;
  });
  autoUpdater.on('error', e => {
    if (manualCheck) dialog.showMessageBox(win, { type: 'warning', message: 'Impossible de vérifier les mises à jour.', detail: String(e && e.message || e) });
    manualCheck = false;
  });
  autoUpdater.on('update-downloaded', async info => {
    manualCheck = false;
    const r = await dialog.showMessageBox(win, {
      type: 'info',
      buttons: ['Redémarrer maintenant', 'Plus tard'],
      defaultId: 0, cancelId: 1,
      message: 'La version ' + info.version + ' de Studio 3D est prête.',
      detail: 'Elle sera installée au redémarrage de l’application (sinon, à la prochaine fermeture). Tes plans sont conservés.' +
        (usingUserCopy() ? '\n\nTu utilises une version modifiée du code : pour voir la nouvelle version, fais ensuite Code > Revenir à la version d’origine.' : ''),
    });
    if (r.response === 0) autoUpdater.quitAndInstall();
  });
  autoUpdater.checkForUpdates().catch(() => {});
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 4 * 60 * 60 * 1000);
}

function checkUpdatesNow() {
  if (!canUpdate()) {
    dialog.showMessageBox(win, {
      type: 'info',
      message: 'Mise à jour automatique indisponible',
      detail: 'Seule la version installée (Studio-3D-Setup) se met à jour toute seule. Pour la version portable, télécharge la dernière version sur GitHub.',
      buttons: ['Ouvrir la page des versions', 'Fermer'], cancelId: 1,
    }).then(r => { if (r.response === 0) shell.openExternal(RELEASES_URL); });
    return;
  }
  manualCheck = true;
  autoUpdater.checkForUpdates().catch(() => {});
}

const RELEASES_URL = 'https://github.com/jfcorse/studio-3d/releases/latest';

function buildMenu() {
  const template = [
    {
      label: 'Fichier',
      submenu: [
        { label: 'Nouveau plan', accelerator: 'CmdOrCtrl+N', click: newPlan },
        { label: 'Ouvrir un plan…', accelerator: 'CmdOrCtrl+O', click: openPlan },
        {
          label: 'Ouvrir récent',
          submenu: recent.length
            ? recent.map(f => ({ label: path.basename(f, '.json'), sublabel: f, click: () => openPlanFile(f) }))
            : [{ label: 'Aucun plan récent', enabled: false }],
        },
        {
          label: 'Plans enregistrés dans l’application',
          submenu: appPlans.length
            ? appPlans.map(p => ({ label: p.name, click: () => { if (checkPage()) sendMenu('openPlan', p.id); } }))
            : [{ label: 'Aucun plan', enabled: false }],
        },
        { type: 'separator' },
        { label: 'Enregistrer', accelerator: 'CmdOrCtrl+S', click: save },
        { label: 'Enregistrer sous…', accelerator: 'CmdOrCtrl+Shift+S', click: saveAs },
        { label: 'Plans sur GitHub…', accelerator: 'CmdOrCtrl+G', click: () => { if (checkPage()) sendMenu('githubDialog'); } },
        { label: 'Ouvrir le dossier des plans', click: () => { ensurePlansDir().then(d => shell.openPath(d), e => dialog.showErrorBox('Studio 3D', e.message)); } },
        { type: 'separator' },
        { label: 'Recharger', accelerator: 'CmdOrCtrl+R', click: load },
        { type: 'separator' },
        { label: 'Quitter', role: 'quit' },
      ],
    },
    {
      label: 'Édition',
      submenu: [
        { label: 'Annuler', role: 'undo' },
        { label: 'Rétablir', role: 'redo' },
        { type: 'separator' },
        { label: 'Couper', role: 'cut' },
        { label: 'Copier', role: 'copy' },
        { label: 'Coller', role: 'paste' },
        { label: 'Tout sélectionner', role: 'selectAll' },
      ],
    },
    {
      label: 'Affichage',
      submenu: [
        { label: 'Plein écran', role: 'togglefullscreen' },
        { label: 'Zoom avant', role: 'zoomIn' },
        { label: 'Zoom arrière', role: 'zoomOut' },
        { label: 'Taille réelle', role: 'resetZoom' },
      ],
    },
    {
      label: 'Code',
      submenu: [
        { label: 'Modifier le code…', accelerator: 'CmdOrCtrl+E', click: editCode },
        { label: 'Ouvrir le dossier du code', click: () => { ensureUserCopy(); shell.openPath(USER_DIR); } },
        { label: 'Revenir à la version d’origine…', click: restoreOriginal },
        { type: 'separator' },
        { label: 'Outils de développement', accelerator: 'F12', role: 'toggleDevTools' },
      ],
    },
    {
      label: 'Aide',
      submenu: [
        { label: 'Rechercher les mises à jour…', click: checkUpdatesNow },
        { label: 'Toutes les versions sur GitHub', click: () => shell.openExternal(RELEASES_URL) },
        { label: 'Ouvrir le journal de l’application', click: () => shell.openPath(LOG_FILE) },
        { type: 'separator' },
        { label: 'Version ' + app.getVersion(), enabled: false },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 480,
    minHeight: 400,
    backgroundColor: '#dfe4e6',
    icon: path.join(BUNDLED_DIR, 'build', 'icon.png'),
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: path.join(BUNDLED_DIR, 'preload.js') },
  });
  // les liens externes s'ouvrent dans le navigateur
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (/^https?:/.test(url)) { e.preventDefault(); shell.openExternal(url); }
  });
  win.on('page-title-updated', e => e.preventDefault());
  win.on('unresponsive', () => log('la page ne répond plus'));
  win.on('responsive', () => log('la page répond de nouveau'));
  win.webContents.on('render-process-gone', (_, d) => log('page arrêtée :', d.reason));
  win.on('closed', () => { win = null; if (watcher) watcher.close(); });
  load();
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(() => { log('démarrage, version', app.getVersion()); buildMenu(); createWindow(); setupUpdater(); });
  app.on('window-all-closed', () => app.quit());
}
