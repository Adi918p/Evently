#!/usr/bin/env node

/**
 * One command to bring up the whole stack.
 *
 * `npm start` used to be `node server.js`, and that is still what the host runs.
 * So this script cannot simply become "start the API and a Vite dev server":
 * Render's default start command for a Node service is `npm start`, and a
 * production box has no business running a dev server. It therefore does one of
 * two different things:
 *
 *   - on a host, or with NODE_ENV=production, it loads server.js in THIS process
 *     and nothing else, so signals, exit codes and memory use are identical to
 *     the plain `node server.js` it replaced;
 *   - anywhere else, it runs the API and Vite side by side and ties their
 *     lifetimes together.
 *
 * Which one it picked is printed on the first line, because a launcher that
 * silently guesses is worse than one that makes you type two commands.
 *
 * Children are spawned as `node <entry>` rather than through npm, for three
 * reasons: npm on Windows is npm.cmd and needs a shell, a shell adds a process
 * layer that swallows kill signals so Ctrl-C leaves orphans holding the ports,
 * and skipping npm removes a redundant process per child.
 */

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");

require("dotenv").config();

const ROOT = path.join(__dirname, "..");
const CLIENT_DIR = path.join(ROOT, "client");
const VITE_ENTRY = path.join(CLIENT_DIR, "node_modules", "vite", "bin", "vite.js");

/** Same default as server.js, so the preflight check names the real port. */
const API_PORT = Number(process.env.PORT) || 8000;
/** Fixed in client/vite.config.js. */
const WEB_PORT = 5173;

/**
 * Env vars set by the platform, not by us.
 *
 * NODE_ENV alone is not enough: it is easy to have production in a local shell
 * by accident, and a host that forgets to set it would otherwise boot a dev
 * server in production. Either signal is treated as "this is not a laptop".
 */
const HOST_MARKERS = [
  "RENDER",
  "DYNO",
  "K_SERVICE",
  "FLY_APP_NAME",
  "WEBSITE_INSTANCE_ID",
  "AWS_EXECUTION_ENV",
];

const useColour = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code, text) => (useColour ? `\x1b[${code}m${text}\x1b[0m` : text);

const LABELS = {
  start: (t) => paint("90", t),
  api: (t) => paint("36", t),
  web: (t) => paint("35", t),
};

const say = (who, message) => {
  process.stdout.write(`${LABELS[who](`[${who}]`)} ${message}\n`);
};

/**
 * Forwards a child's output a line at a time with its name in front.
 *
 * Buffered rather than written per chunk: a chunk boundary can land mid-line,
 * and prefixing raw chunks would print the label in the middle of a sentence.
 */
function forward(stream, who) {
  let carry = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    const lines = (carry + chunk).split(/\r?\n/);
    // The final element has no newline yet, so it waits for the next chunk.
    carry = lines.pop();
    for (const line of lines) process.stdout.write(`${LABELS[who](`[${who}]`)} ${line}\n`);
  });
  stream.on("end", () => {
    if (carry) process.stdout.write(`${LABELS[who](`[${who}]`)} ${carry}\n`);
  });
}

/** Resolves true if something is already serving on the port. */
function portInUse(port) {
  return new Promise((resolve) => {
    // Asks by connecting, not by binding. The obvious check - bind the port and
    // see if it errors - does not work on Windows: a listener on [::1]:5173 does
    // not stop you binding the wildcard address, so the probe reports the port
    // free and Vite then finds it busy a second later. Measured, not assumed.
    const socket = net.connect({ port, host: "localhost" });
    const done = (value) => {
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(700, () => done(true));
    socket.once("connect", () => done(true));
    // Anything other than "nobody home" is treated as occupied, since the point
    // is to avoid handing the port to a child that cannot have it.
    socket.once("error", (err) => done(err.code !== "ECONNREFUSED"));
  });
}

async function runDevPair() {
  if (!fs.existsSync(VITE_ENTRY)) {
    say("start", "The client's dependencies are not installed.");
    say("start", "Run this first:  npm --prefix client install");
    process.exitCode = 1;
    return;
  }

  // Checked up front because otherwise the failure arrives as a stack trace from
  // whichever child lost the race, which reads like a code problem rather than
  // "something else is already on that port".
  const busy = (
    await Promise.all(
      [
        { port: API_PORT, who: "api" },
        { port: WEB_PORT, who: "web" },
      ].map(async (entry) => ({ ...entry, code: await portInUse(entry.port) }))
    )
  ).filter((entry) => entry.code);

  if (busy.length) {
    for (const { port, who } of busy) {
      say("start", `Port ${port} (${who}) is already in use.`);
    }
    say("start", `Free them with:  npx kill-port ${busy.map((b) => b.port).join(" ")}`);
    process.exitCode = 1;
    return;
  }

  say("start", `dev mode - api on :${API_PORT}, web on :${WEB_PORT}`);
  say("start", `open http://localhost:${WEB_PORT}  (the web port, not the api one)`);

  const children = [];
  let shuttingDown = false;

  const launch = (who, args, cwd) => {
    const child = spawn(process.execPath, args, {
      cwd,
      // Inherit nothing: both streams are forwarded so they can be labelled.
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
    forward(child.stdout, who);
    forward(child.stderr, who);
    child.on("exit", (code, signal) => {
      if (shuttingDown) return;
      say("start", `${who} exited (${signal || `code ${code}`}) - stopping the other`);
      process.exitCode = code === null ? 1 : code;
      stopAll();
    });
    children.push({ who, child });
    return child;
  };

  function stopAll() {
    if (shuttingDown) return;
    shuttingDown = true;
    for (const { child } of children) {
      if (child.exitCode === null && child.signalCode === null) child.kill();
    }
  }

  launch("api", [path.join(ROOT, "server.js")], ROOT);
  // --no-clearScreen: Vite wipes the terminal on boot and on every HMR error,
  // which would erase the API's startup output and anything it logged since.
  launch("web", [VITE_ENTRY, "--no-clearScreen"], CLIENT_DIR);

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      say("start", "shutting down");
      stopAll();
    });
  }
}

function main() {
  const marker = HOST_MARKERS.find((key) => process.env[key]);
  const isProduction = marker || process.env.NODE_ENV === "production";

  if (isProduction) {
    say("start", `production mode - api only (${marker ? `${marker} is set` : "NODE_ENV=production"})`);
    // In-process on purpose: see the header comment.
    require(path.join(ROOT, "server.js"));
    return;
  }

  runDevPair();
}

main();
