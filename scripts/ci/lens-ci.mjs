import { spawn } from "node:child_process";

const TOKEN = "ci_temp_token_123";
const PORT = "3001";

function run(cmd, args, opts = {}) {
  if (cmd === "npm" && process.env.npm_execpath) {
    return spawn(process.execPath, [process.env.npm_execpath, ...args], {
      stdio: "inherit",
      shell: false,
      ...opts
    });
  }
  return spawn(cmd, args, { stdio: "inherit", shell: false, ...opts });
}

async function waitForHealth(url, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {}
    await new Promise(r => setTimeout(r, 250));
  }
  return false;
}

async function main() {
  // Install lens-core deps (isolated)
  let p = run("npm", ["--prefix", "packages/lens-core", "install"]);
  const code0 = await new Promise(r => p.on("exit", r));
  if (code0 !== 0) process.exit(code0);

  // Build lens-core
  p = run("npm", ["--prefix", "packages/lens-core", "run", "build"]);
  const code1 = await new Promise(r => p.on("exit", r));
  if (code1 !== 0) process.exit(code1);

  // Start lens-core
  const env = {
    ...process.env,
    LENS_PORT: PORT,
    LENS_TOKEN: TOKEN,
    LENS_CI_SERVER: "true",
    LENS_ALLOW_QUERY_TOKEN: "false",
    LENS_ALLOWED_ORIGINS: "http://localhost:3000"
  };

  const server = run("node", ["packages/lens-core/dist/index.js"], { env });

  const ready = await waitForHealth(`http://localhost:${PORT}/health`);
  if (!ready) {
    server.kill();
    console.error("lens-core did not become healthy in time");
    process.exit(1);
  }

  // Run lens-core tests (smoke + configuration security)
  p = run("npm", ["--prefix", "packages/lens-core", "run", "test"], { env });
  const code2 = await new Promise(r => p.on("exit", r));
  if (code2 !== 0) {
    server.kill();
    process.exit(code2);
  }

  // Validate that browser-rendered upstream content remains text-only.
  p = run("npm", ["--prefix", "packages/lens-ext", "run", "test"], { env });
  const code3 = await new Promise(r => p.on("exit", r));

  server.kill();
  process.exit(code3 ?? 1);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
