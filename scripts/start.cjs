const { spawn } = require("node:child_process");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const isWindows = process.platform === "win32";
const electronBin = path.join(root, "node_modules", ".bin", isWindows ? "electron.cmd" : "electron");
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronBin, ["."], { cwd: root, stdio: "inherit", shell: false, env });
child.on("exit", (code) => process.exit(code ?? 0));
