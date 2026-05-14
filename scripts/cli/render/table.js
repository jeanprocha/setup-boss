function padEnd(s, w) {
  const str = String(s ?? "");
  const len = [...str].length;
  if (len >= w) return str.slice(0, w);
  return str + " ".repeat(w - len);
}

function formatRow(cells, widths) {
  return cells.map((c, i) => padEnd(c, widths[i])).join("  ");
}

module.exports = { padEnd, formatRow };
