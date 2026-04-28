const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("pointCloudDesktop", {
  readText: async (relativePath) => {
    return await ipcRenderer.invoke("asset:read-text", relativePath);
  },
  readJson: async (relativePath) => {
    return await ipcRenderer.invoke("asset:read-json", relativePath);
  },
});
