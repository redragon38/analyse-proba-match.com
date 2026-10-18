export function parseCSV(text: string): string[][] {
  const delimiter = text
    .split(/\r?\n/)
    .find((line) => /[,;]/.test(line))
    ?.includes(";")
    ? ";"
    : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const input = text.replace(/^\ufeff/, "");
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (c === '"') {
      if (quoted && input[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === delimiter && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && input[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (quoted) throw Error("CSV invalide : guillemets non fermés.");
  row.push(cell);
  if (row.some(Boolean)) rows.push(row);
  return rows;
}
export function parseTrends(text: string) {
  const rows = parseCSV(text);
  const headerIndex = rows.findIndex(
    (r, i) =>
      r.length >= 2 &&
      rows[i + 1]?.length === r.length &&
      rows[i + 1].slice(1).some((v) => /^(?:\d+(?:\.\d+)?|<1)$/.test(v.trim())),
  );
  if (headerIndex < 0)
    throw Error("Aucun tableau Google Trends avec indices numériques détecté.");
  const headers = rows[headerIndex];
  const entries = rows
    .slice(headerIndex + 1)
    .filter((r) => r.length === headers.length)
    .map((r) => ({
      label: r[0],
      values: r.slice(1).map((raw) => ({
        raw,
        value:
          /^\d+(?:\.\d+)?$/.test(raw.trim()) && Number(raw) <= 100
            ? Number(raw)
            : null,
      })),
    }));
  if (!entries.length)
    throw Error("Le fichier ne contient aucune observation.");
  return {
    headers,
    entries,
    temporal: entries.every((e) => /^\d{4}(?:-\d{2}){0,2}$/.test(e.label)),
    warnings:
      "Indices relatifs Google Trends. Les valeurs « <1 » et les valeurs absentes restent non numériques ; elles ne sont pas remplacées par zéro.",
  };
}
