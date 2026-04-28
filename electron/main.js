const { app, BrowserWindow, ipcMain, shell } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");

const APP_ROOT = path.resolve(__dirname, "..");

function createWindow() {
  const window = new BrowserWindow({
    width: 1680,
    height: 1050,
    minWidth: 1280,
    minHeight: 820,
    title: "Discover PointCloud",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  window.loadFile(path.join(APP_ROOT, "index.html"));

  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

function resolveAssetPath(relativePath) {
  const normalized = path.normalize(relativePath);
  const absolutePath = path.resolve(APP_ROOT, normalized);
  if (!absolutePath.startsWith(APP_ROOT)) {
    throw new Error(`非法路径: ${relativePath}`);
  }
  return absolutePath;
}

ipcMain.handle("asset:read-text", async (_event, relativePath) => {
  const absolutePath = resolveAssetPath(relativePath);
  return await fs.readFile(absolutePath, "utf8");
});

ipcMain.handle("asset:read-json", async (_event, relativePath) => {
  const absolutePath = resolveAssetPath(relativePath);
  const raw = await fs.readFile(absolutePath, "utf8");
  return JSON.parse(raw);
});

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
