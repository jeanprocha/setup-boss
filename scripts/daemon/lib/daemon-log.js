const fs = require("fs");
const { getDaemonDirs } = require("./daemon-paths");

function appendDaemonLog(line) {
  try {
    const { logPath, daemonDir } = getDaemonDirs();
    if (!fs.existsSync(daemonDir))
      fs.mkdirSync(daemonDir, { recursive: true });
    const msg = `[${new Date().toISOString()}] ${line}\n`;
    fs.appendFileSync(logPath, msg, "utf-8");
  } catch (_) {
    /* swallow — logging não deve derrubar o daemon */
  }
}

module.exports = { appendDaemonLog };
