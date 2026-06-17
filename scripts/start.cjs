const { spawn } = require("node:child_process");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const electronBin = require("electron");
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
env.ATELIER_LOAD_DIST = "1";

const child = spawn(electronBin, ["."], { cwd: root, stdio: "inherit", shell: false, env });
child.on("exit", (code) => process.exit(code ?? 0));
