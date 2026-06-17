const { spawn } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const viteCli = path.join(path.dirname(require.resolve("vite/package.json")), "bin", "vite.js");
const electronBin = require("electron");

const children = [];
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

function run(command, args) {
  const child = spawn(command, args, { cwd: root, stdio: "inherit", shell: false, env });
  children.push(child);
  child.on("exit", (code) => {
    if (code && !shuttingDown) process.exit(code);
  });
  return child;
}

function waitForVite(attempts = 80) {
  return new Promise((resolve, reject) => {
    const tick = () => {
      http
        .get("http://127.0.0.1:5173", (response) => {
          response.resume();
          resolve();
        })
        .on("error", () => {
          if (attempts <= 0) reject(new Error("Vite n'a pas demarre sur le port 5173."));
          else setTimeout(() => waitForVite(attempts - 1).then(resolve, reject), 250);
        });
    };
    tick();
  });
}

let shuttingDown = false;
function shutdown() {
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill();
  }
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

run(process.execPath, [viteCli, "--host", "127.0.0.1"]);
waitForVite()
  .then(() => run(electronBin, ["."]))
  .catch((error) => {
    console.error(error.message);
    shutdown();
    process.exit(1);
  });
