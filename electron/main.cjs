const { app, BrowserWindow, ipcMain, dialog, protocol, shell, net, Menu } = require("electron");
const path = require("node:path");
const fs = require("node:fs/promises");
const crypto = require("node:crypto");
const { pathToFileURL } = require("node:url");

const isDev = !app.isPackaged && process.env.ATELIER_LOAD_DIST !== "1";
let mainWindow;

protocol.registerSchemesAsPrivileged([
  {
    scheme: "atelier",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: false,
    },
  },
]);

const defaultData = {
  company: {
    name: "L'Atelier du Bois",
    legalName: "L'Atelier du Bois",
    siret: "",
    vatNumber: "",
    address: "12 rue des Copeaux",
    postalCode: "75000",
    city: "Paris",
    phone: "01 23 45 67 89",
    email: "contact@atelier-du-bois.fr",
    website: "",
    iban: "",
    bic: "",
    paymentTerms: "30% d'acompte à la commande, solde à réception des travaux.",
    quoteValidityDays: 30,
    defaultVatRate: 20,
    defaultDepositRate: 30,
    notes: "Fabrication sur mesure en atelier, pose comprise selon descriptif.",
  },
  counters: {
    quote: 1,
    order: 1,
    invoice: 1,
    client: 1,
  },
  clients: [],
  documents: [],
  catalog: [
    { id: "cat-1", name: "Meuble sur mesure", unit: "u", price: 1450, vatRate: 20, category: "Fabrication" },
    { id: "cat-2", name: "Placard / dressing mélaminé", unit: "ml", price: 680, vatRate: 20, category: "Agencement" },
    { id: "cat-3", name: "Bibliothèque chêne plaqué", unit: "ml", price: 920, vatRate: 20, category: "Agencement" },
    { id: "cat-4", name: "Plan de travail bois massif", unit: "ml", price: 260, vatRate: 20, category: "Bois massif" },
    { id: "cat-5", name: "Pose et ajustements sur site", unit: "h", price: 58, vatRate: 10, category: "Pose" },
    { id: "cat-6", name: "Finition vernis mat / huile dure", unit: "m2", price: 42, vatRate: 20, category: "Finition" }
  ],
};

defaultData.company.paymentTerms = "30% d'acompte à la commande, solde à réception des travaux.";
defaultData.catalog = defaultData.catalog.map((item) => {
  if (item.id === "cat-2") return { ...item, name: "Placard / dressing mélaminé" };
  if (item.id === "cat-3") return { ...item, name: "Bibliothèque chêne plaqué" };
  return item;
});

function getDataPath() {
  return path.join(app.getPath("userData"), "atelier-du-bois-data.json");
}

async function ensureDataFile() {
  const file = getDataPath();
  try {
    await fs.access(file);
  } catch {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(defaultData, null, 2), "utf8");
  }
  return file;
}

async function readStore() {
  const file = await ensureDataFile();
  const raw = await fs.readFile(file, "utf8");
  const parsed = JSON.parse(raw);
  return {
    ...defaultData,
    ...parsed,
    company: { ...defaultData.company, ...(parsed.company || {}) },
    counters: { ...defaultData.counters, ...(parsed.counters || {}) },
    clients: Array.isArray(parsed.clients) ? parsed.clients : [],
    documents: Array.isArray(parsed.documents) ? parsed.documents : [],
    catalog: Array.isArray(parsed.catalog) && parsed.catalog.length ? parsed.catalog : defaultData.catalog,
  };
}

async function writeStore(data) {
  const file = await ensureDataFile();
  await fs.writeFile(file, JSON.stringify(data, null, 2), "utf8");
  return data;
}

function makeNumber(prefix, count) {
  const year = new Date().getFullYear();
  return `${prefix}-${year}-${String(count).padStart(4, "0")}`;
}

function createWindow() {
  Menu.setApplicationMenu(null);

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1120,
    minHeight: 740,
    title: "L'Atelier du Bois",
    backgroundColor: "#f6f3ee",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (!isDev) {
    mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          "Content-Security-Policy": [
            "default-src 'self' atelier:; script-src 'self' atelier:; style-src 'self' atelier:; img-src 'self' atelier: data: blob:; font-src 'self' atelier: data:; connect-src 'self' atelier:;",
          ],
        },
      });
    });
  }

  if (isDev) {
    mainWindow.loadURL("http://127.0.0.1:5173");
  } else {
    mainWindow.loadURL("atelier://app/index.html");
  }
}

app.whenReady().then(() => {
  protocol.handle("atelier", (request) => {
    const url = new URL(request.url);
    const relativePath = decodeURIComponent(url.pathname.replace(/^\/+/, "")) || "index.html";
    const filePath = path.join(__dirname, "../dist", relativePath);
    return net.fetch(pathToFileURL(filePath).toString());
  });

  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

ipcMain.handle("store:load", async () => readStore());
ipcMain.handle("store:save", async (_event, data) => writeStore(data));

ipcMain.handle("store:next-number", async (_event, type) => {
  const data = await readStore();
  const prefixes = { quote: "DEV", order: "BC", invoice: "FAC", client: "CLI" };
  return makeNumber(prefixes[type], data.counters[type] || 1);
});

ipcMain.handle("app:uuid", () => crypto.randomUUID());

ipcMain.handle("app:open-email", async (_event, { to, subject, body }) => {
  const params = new URLSearchParams({
    subject: subject || "",
    body: body || "",
  });
  await shell.openExternal(`mailto:${encodeURIComponent(to || "")}?${params.toString()}`);
  return { opened: true };
});

ipcMain.handle("dialog:save-pdf", async (_event, { html, defaultPath }) => {
  const target = await dialog.showSaveDialog(mainWindow, {
    title: "Exporter en PDF",
    defaultPath,
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
  if (target.canceled || !target.filePath) return { canceled: true };

  const pdfWindow = new BrowserWindow({
    show: false,
    width: 794,
    height: 1123,
    webPreferences: { offscreen: true },
  });
  await pdfWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  const pdf = await pdfWindow.webContents.printToPDF({
    printBackground: true,
    pageSize: "A4",
    margins: { marginType: "none" },
  });
  await fs.writeFile(target.filePath, pdf);
  pdfWindow.close();
  shell.showItemInFolder(target.filePath);
  return { canceled: false, filePath: target.filePath };
});

ipcMain.handle("dialog:export-json", async (_event, data) => {
  const target = await dialog.showSaveDialog(mainWindow, {
    title: "Sauvegarder les donnees",
    defaultPath: "atelier-du-bois-sauvegarde.json",
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (target.canceled || !target.filePath) return { canceled: true };
  await fs.writeFile(target.filePath, JSON.stringify(data, null, 2), "utf8");
  shell.showItemInFolder(target.filePath);
  return { canceled: false, filePath: target.filePath };
});
