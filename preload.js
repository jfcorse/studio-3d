// Pont entre la page (studio-3d.html) et l'application : menu Fichier, fichiers de plans, titre de la fenêtre.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('studioApp', {
  // commandes du menu Fichier : 'new', 'save', 'saveAs', 'opened' ({path, data}), 'openPlan' (id)
  onMenu: cb => ipcRenderer.on('menu', (_, cmd, arg) => cb(cmd, arg)),
  // enregistre data dans path (ou demande où enregistrer si path est vide) ; renvoie {path} ou null si annulé
  saveFile: opts => ipcRenderer.invoke('plan:save', opts),
  // nom du plan ouvert et modifications non enregistrées, pour le titre de la fenêtre
  setDocument: doc => ipcRenderer.send('plan:document', doc),
  // plans gardés dans l'application, listés dans Fichier > Plans enregistrés dans l'application
  setPlans: list => ipcRenderer.send('plan:list', list),
  alert: msg => ipcRenderer.send('app:alert', msg),
});
