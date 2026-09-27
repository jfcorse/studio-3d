// Pont entre la page (studio-3d.html) et l'application : menu Fichier, fichiers de plans, titre de la fenêtre.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('studioApp', {
  // commandes du menu Fichier : 'new', 'saveTo' (chemin du fichier), 'opened' ({path, data}), 'openPlan' (id)
  onMenu: cb => ipcRenderer.on('menu', (_, cmd, arg) => cb(cmd, arg)),
  // la page sait gérer le menu Fichier
  ready: () => ipcRenderer.send('plan:ready'),
  // écrit le plan dans le fichier choisi par l'application ; renvoie {path} ou null en cas d'erreur
  writeFile: (path, data) => ipcRenderer.invoke('plan:write', { path, data }),
  // nom du plan ouvert et modifications non enregistrées, pour le titre de la fenêtre
  setDocument: doc => ipcRenderer.send('plan:document', doc),
  // plans gardés dans l'application, listés dans Fichier > Plans enregistrés dans l'application
  setPlans: list => ipcRenderer.send('plan:list', list),
  alert: msg => ipcRenderer.send('app:alert', msg),
});
