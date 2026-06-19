const { app, BrowserWindow, ipcMain, dialog, protocol, shell, net, Menu } = require("electron");
const path = require("node:path");
const fs = require("node:fs/promises");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { pathToFileURL } = require("node:url");

const isDev = !app.isPackaged && process.env.ATELIER_LOAD_DIST !== "1";
const appProtocol = "atelier";
let mainWindow;
let pendingDeepLinkUrl = process.argv.find((arg) => arg.startsWith(`${appProtocol}://`)) || "";
const portableDataRoot = process.env.PORTABLE_EXECUTABLE_DIR
  ? path.join(process.env.PORTABLE_EXECUTABLE_DIR, "Devix-data")
  : "";

if (portableDataRoot) {
  app.setPath("userData", portableDataRoot);
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: appProtocol,
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
    name: "",
    legalName: "",
    siret: "",
    vatNumber: "",
    address: "",
    postalCode: "",
    city: "",
    phone: "",
    email: "",
    website: "",
    iban: "",
    bic: "",
    paymentTerms: "",
    quoteValidityDays: 30,
    defaultVatRate: 20,
    defaultDepositRate: 30,
    notes: "",
  },
  counters: {
    quote: 1,
    order: 1,
    invoice: 1,
    creditNote: 1,
    returnInvoice: 1,
    client: 1,
  },
  clients: [],
  documents: [],
  catalog: [],
};

function getDataPath() {
  return path.join(app.getPath("userData"), "atelier-du-bois-data.json");
}

function getBackupRoot() {
  return path.join(app.getPath("userData"), "backups");
}

function getOneDriveCandidates() {
  return [
    process.env.OneDriveCommercial,
    process.env.OneDriveConsumer,
    process.env.OneDrive,
    process.env.USERPROFILE ? path.join(process.env.USERPROFILE, "OneDrive") : "",
    process.env.USERPROFILE ? path.join(process.env.USERPROFILE, "OneDrive - Personal") : "",
  ].filter(Boolean);
}

function getAttachmentsDir(documentId) {
  return path.join(app.getPath("userData"), "attachments", String(documentId || "documents"));
}

function safeAttachmentName(fileName) {
  return path.basename(fileName || "piece-jointe").replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "-");
}

function mimeFromFileName(fileName) {
  const extension = path.extname(fileName || "").toLowerCase();
  const types = {
    ".pdf": "application/pdf",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".txt": "text/plain",
  };
  return types[extension] || "application/octet-stream";
}

function backupTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function copyDirectoryContents(source, target) {
  if (!(await pathExists(source))) return;
  await fs.rm(target, { recursive: true, force: true });
  await fs.cp(source, target, { recursive: true, force: true });
}

async function cleanupSnapshots(root, keep = 40) {
  const snapshotsDir = path.join(root, "snapshots");
  if (!(await pathExists(snapshotsDir))) return;
  const entries = await fs.readdir(snapshotsDir, { withFileTypes: true });
  const folders = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .reverse();
  await Promise.all(folders.slice(keep).map((name) => fs.rm(path.join(snapshotsDir, name), { recursive: true, force: true })));
}

async function writeBackupSet(root, data, makeSnapshot) {
  const latestDir = path.join(root, "latest");
  const attachmentsDir = path.join(app.getPath("userData"), "attachments");
  await fs.mkdir(latestDir, { recursive: true });
  await fs.writeFile(path.join(latestDir, "atelier-du-bois-data.json"), JSON.stringify(data, null, 2), "utf8");
  await copyDirectoryContents(attachmentsDir, path.join(latestDir, "attachments"));

  if (makeSnapshot) {
    const snapshotDir = path.join(root, "snapshots", backupTimestamp());
    await fs.mkdir(snapshotDir, { recursive: true });
    await fs.writeFile(path.join(snapshotDir, "atelier-du-bois-data.json"), JSON.stringify(data, null, 2), "utf8");
    await copyDirectoryContents(attachmentsDir, path.join(snapshotDir, "attachments"));
    await cleanupSnapshots(root);
  }
}

async function getOneDriveBackupRoot() {
  for (const candidate of getOneDriveCandidates()) {
    if (await pathExists(candidate)) {
      return path.join(candidate, "Devix", "Sauvegardes");
    }
  }
  return "";
}

let lastSnapshotAt = 0;
let backupQueue = Promise.resolve();

function scheduleAutomaticBackups(data) {
  const payload = JSON.parse(JSON.stringify(data));
  backupQueue = backupQueue
    .catch(() => undefined)
    .then(async () => {
      const now = Date.now();
      const makeSnapshot = now - lastSnapshotAt > 10 * 60 * 1000;
      if (makeSnapshot) lastSnapshotAt = now;

      await writeBackupSet(path.join(getBackupRoot(), "local"), payload, makeSnapshot);
      const oneDriveRoot = await getOneDriveBackupRoot();
      if (oneDriveRoot) {
        await writeBackupSet(oneDriveRoot, payload, makeSnapshot);
      }
    })
    .catch((error) => {
      console.warn("Sauvegarde automatique indisponible", error);
    });
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
    catalog: Array.isArray(parsed.catalog) ? parsed.catalog : defaultData.catalog,
  };
}

async function writeStore(data) {
  const file = await ensureDataFile();
  await fs.writeFile(file, JSON.stringify(data, null, 2), "utf8");
  scheduleAutomaticBackups(data);
  return data;
}

function makeNumber(prefix, count) {
  const year = new Date().getFullYear();
  return `${prefix}-${year}-${String(count).padStart(4, "0")}`;
}

function isAppDeepLink(value) {
  return typeof value === "string" && value.startsWith(`${appProtocol}://`);
}

function loadAppUrl(targetUrl = "") {
  if (!mainWindow) return;
  if (isDev) {
    mainWindow.loadURL("http://127.0.0.1:5173");
    return;
  }
  mainWindow.loadURL(isAppDeepLink(targetUrl) ? targetUrl : `${appProtocol}://app/index.html`);
}

function openDeepLink(targetUrl) {
  if (!isAppDeepLink(targetUrl)) return;
  pendingDeepLinkUrl = targetUrl;
  if (!mainWindow) return;
  loadAppUrl(targetUrl);
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
}

function createWindow() {
  Menu.setApplicationMenu(null);

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1120,
    minHeight: 740,
    title: "Devix",
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
            "default-src 'self' atelier:; script-src 'self' atelier:; style-src 'self' atelier:; img-src 'self' atelier: data: blob: https:; font-src 'self' atelier: data:; connect-src 'self' atelier: https://srfaeqhepmogxsdiympq.supabase.co https://*.supabase.co wss://srfaeqhepmogxsdiympq.supabase.co wss://*.supabase.co;",
          ],
        },
      });
    });
  }

  loadAppUrl(pendingDeepLinkUrl);
  pendingDeepLinkUrl = "";
}

app.whenReady().then(() => {
  if (!isDev) {
    app.setAsDefaultProtocolClient(appProtocol);
  }

  protocol.handle(appProtocol, (request) => {
    const url = new URL(request.url);
    const relativePath = decodeURIComponent(url.pathname.replace(/^\/+/, "")) || "index.html";
    const filePath = path.join(__dirname, "../dist", relativePath);
    return net.fetch(pathToFileURL(filePath).toString());
  });

  createWindow();
});

app.on("second-instance", (_event, commandLine) => {
  const targetUrl = commandLine.find(isAppDeepLink);
  if (targetUrl) openDeepLink(targetUrl);
  else if (mainWindow) mainWindow.focus();
});

app.on("open-url", (event, targetUrl) => {
  event.preventDefault();
  openDeepLink(targetUrl);
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
  const prefixes = { quote: "DEV", order: "BC", invoice: "FAC", creditNote: "AVO", returnInvoice: "RET", client: "CLI" };
  if (!prefixes[type]) throw new Error(`Type de compteur inconnu: ${type}`);
  return makeNumber(prefixes[type], data.counters[type] || 1);
});

ipcMain.handle("app:uuid", () => crypto.randomUUID());

function mailtoUrl({ to, subject, body }) {
  const params = [
    ["subject", subject || ""],
    ["body", body || ""],
  ]
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("&");
  return `mailto:${encodeURIComponent(to || "")}?${params}`;
}

ipcMain.handle("app:open-email", async (_event, { to, subject, body }) => {
  await shell.openExternal(mailtoUrl({ to, subject, body }));
  return { opened: true };
});

async function createPdfFile(html, filePath) {
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
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, pdf);
  pdfWindow.close();
}

async function openOutlookDraft({ to, subject, body, attachmentPath }) {
  const payload = JSON.stringify({ to: to || "", subject: subject || "", body: body || "", attachmentPath });
  const script = `
$ErrorActionPreference = "Stop"
$data = $env:ATELIER_MAIL_PAYLOAD | ConvertFrom-Json
$outlook = New-Object -ComObject Outlook.Application
$mail = $outlook.CreateItem(0)
if ($data.to) { $mail.To = $data.to }
$mail.Subject = $data.subject
$mail.Body = $data.body
$null = $mail.Attachments.Add($data.attachmentPath)
$mail.Display()
`;
  await new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", "-"], {
      windowsHide: true,
      env: { ...process.env, ATELIER_MAIL_PAYLOAD: payload },
      stdio: ["pipe", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr || `Outlook a refuse le brouillon email (${code}).`));
    });
    child.stdin.end(script);
  });
}

function encodeMailHeader(value) {
  const text = String(value || "");
  return /^[\x00-\x7F]*$/.test(text) ? text : `=?UTF-8?B?${Buffer.from(text, "utf8").toString("base64")}?=`;
}

function chunkBase64(value) {
  return value.match(/.{1,76}/g)?.join("\r\n") || "";
}

async function createEmlDraft({ to, subject, body, attachmentPath }) {
  const boundary = `----=_AtelierDuBois_${crypto.randomUUID()}`;
  const attachmentName = path.basename(attachmentPath);
  const attachment = await fs.readFile(attachmentPath);
  const emlPath = path.join(app.getPath("temp"), "atelier-du-bois", "emails", `${Date.now()}-message.eml`);
  const lines = [
    "X-Unsent: 1",
    to ? `To: ${to}` : "",
    `Subject: ${encodeMailHeader(subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="utf-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    body || "",
    "",
    `--${boundary}`,
    `Content-Type: application/pdf; name="${encodeMailHeader(attachmentName)}"`,
    `Content-Disposition: attachment; filename="${encodeMailHeader(attachmentName)}"`,
    "Content-Transfer-Encoding: base64",
    "",
    chunkBase64(attachment.toString("base64")),
    "",
    `--${boundary}--`,
    "",
  ].filter((line, index) => index !== 1 || Boolean(line));
  await fs.mkdir(path.dirname(emlPath), { recursive: true });
  await fs.writeFile(emlPath, lines.join("\r\n"), "utf8");
  const error = await shell.openPath(emlPath);
  if (error) throw new Error(error);
  return emlPath;
}

ipcMain.handle("dialog:save-pdf", async (_event, { html, defaultPath }) => {
  const target = await dialog.showSaveDialog(mainWindow, {
    title: "Exporter en PDF",
    defaultPath,
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
  if (target.canceled || !target.filePath) return { canceled: true };

  await createPdfFile(html, target.filePath);
  shell.showItemInFolder(target.filePath);
  return { canceled: false, filePath: target.filePath };
});

ipcMain.handle("app:email-pdf", async (_event, { html, defaultPath, to, subject, body }) => {
  const fileName = path.basename(defaultPath || "document.pdf").replace(/[<>:"/\\|?*]+/g, "-");
  const filePath = path.join(app.getPath("temp"), "atelier-du-bois", "emails", `${Date.now()}-${fileName}`);
  await createPdfFile(html, filePath);

  try {
    await openOutlookDraft({ to, subject, body, attachmentPath: filePath });
    return { opened: true, filePath };
  } catch (error) {
    console.warn("Ouverture Outlook COM impossible, creation d'un brouillon EML", error);
    try {
      const emlPath = await createEmlDraft({ to, subject, body, attachmentPath: filePath });
      return { opened: true, filePath, emlPath };
    } catch (emlError) {
      console.warn("Creation du brouillon EML impossible", emlError);
      return { opened: false, filePath, fallback: true };
    }
  }
});

ipcMain.handle("dialog:export-json", async (_event, data) => {
  const target = await dialog.showSaveDialog(mainWindow, {
    title: "Sauvegarder les donnees",
    defaultPath: "devix-sauvegarde.json",
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (target.canceled || !target.filePath) return { canceled: true };
  await fs.writeFile(target.filePath, JSON.stringify(data, null, 2), "utf8");
  shell.showItemInFolder(target.filePath);
  return { canceled: false, filePath: target.filePath };
});

ipcMain.handle("dialog:select-attachments", async (_event, documentId) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Ajouter une piece jointe",
    properties: ["openFile", "multiSelections"],
    filters: [
      { name: "Documents", extensions: ["pdf", "jpg", "jpeg", "png", "doc", "docx", "xls", "xlsx", "txt"] },
      { name: "Tous les fichiers", extensions: ["*"] },
    ],
  });
  if (result.canceled || !result.filePaths.length) return { canceled: true, attachments: [] };

  const targetDir = getAttachmentsDir(documentId);
  await fs.mkdir(targetDir, { recursive: true });
  const attachments = [];
  for (const sourcePath of result.filePaths) {
    const stat = await fs.stat(sourcePath);
    const originalName = path.basename(sourcePath);
    const id = crypto.randomUUID();
    const storedName = `${id}-${safeAttachmentName(originalName)}`;
    const filePath = path.join(targetDir, storedName);
    await fs.copyFile(sourcePath, filePath);
    const buffer = await fs.readFile(sourcePath);
    const mimeType = mimeFromFileName(originalName);
    attachments.push({
      id,
      name: originalName,
      filePath,
      dataUrl: `data:${mimeType};base64,${buffer.toString("base64")}`,
      mimeType,
      size: stat.size,
      addedAt: new Date().toISOString(),
    });
  }
  return { canceled: false, attachments };
});

ipcMain.handle("app:open-attachment", async (_event, attachment) => {
  if (!attachment?.filePath) return { opened: false };
  const error = await shell.openPath(attachment.filePath);
  return { opened: !error, error };
});

ipcMain.handle("app:delete-attachment", async (_event, attachment) => {
  if (!attachment?.filePath) return { deleted: false };
  try {
    await fs.unlink(attachment.filePath);
    return { deleted: true };
  } catch (error) {
    if (error?.code === "ENOENT") return { deleted: true };
    console.warn("Suppression piece jointe impossible", error);
    return { deleted: false };
  }
});
