// Studio 3D : application Windows (Electron) autour de studio-3d.html.
//
// Le code affiché vient :
//  - de la copie modifiable dans « Documents\Studio 3D » si elle existe (menu Code > Modifier le code),
//  - sinon du fichier livré avec l'application.
// Quand la copie modifiable change sur le disque, la fenêtre se recharge toute seule.
const { app, BrowserWindow, Menu, shell, dialog } = require('electron');
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

const usingUserCopy = () => fs.existsSync(USER_HTML);
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
  win.loadFile(currentHtml());
  win.setTitle(usingUserCopy() ? 'Studio 3D (version modifiée)' : 'Studio 3D');
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
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
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
  win.on('closed', () => { win = null; if (watcher) watcher.close(); });
  load();
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(() => { buildMenu(); createWindow(); setupUpdater(); });
  app.on('window-all-closed', () => app.quit());
}
