function supportsColor() {
  if (process.env.NO_COLOR || process.env.TERM === "dumb") return false;
  return Boolean(process.stdout && process.stdout.isTTY);
}

function colorize(enabled, code, text) {
  if (!enabled) return text;
  return `\u001b[${code}m${text}\u001b[0m`;
}

const theme = (enabled) => ({
  dim: (t) => colorize(enabled, "90", t),
  bold: (t) => colorize(enabled, "1", t),
  green: (t) => colorize(enabled, "32", t),
  red: (t) => colorize(enabled, "31", t),
  yellow: (t) => colorize(enabled, "33", t),
  cyan: (t) => colorize(enabled, "36", t),
});

module.exports = { supportsColor, theme, colorize };
