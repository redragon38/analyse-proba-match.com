import { writeFile } from "node:fs/promises";
import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";
import type { Site, RecordData } from "./contracts";
export function escapeHTML(s: unknown) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
export function csvCell(s: unknown) {
  let v = String(s ?? "");
  if (/^[=+@\-\t\r]/.test(v)) v = "'" + v;
  return '"' + v.replace(/"/g, '""') + '"';
}
export async function exportReport(
  file: string,
  format: string,
  site: Site,
  records: RecordData[],
) {
  const crawls = records.filter((r) => r.kind === "crawl");
  const issues = crawls[0]?.data.issues ?? [];
  const rows = issues.map((i: any) => [
    i.severity,
    i.category,
    i.url,
    i.description,
    i.evidence,
    i.recommendation,
  ]);
  const headings = [
    "Gravité",
    "Catégorie",
    "URL",
    "Problème",
    "Preuve",
    "Recommandation",
  ];
  const generatedAt = new Date().toISOString();
  const source = records.map((r) => `${r.kind} : ${r.createdAt}`).join("\n");
  if (format === "json") {
    await writeFile(
      file,
      JSON.stringify({ site, generatedAt, records }, null, 2),
    );
    return;
  }
  if (format === "csv") {
    await writeFile(
      file,
      "\ufeff" +
        [headings, ...rows].map((r) => r.map(csvCell).join(";")).join("\r\n"),
    );
    return;
  }
  if (format === "html") {
    await writeFile(
      file,
      `<!doctype html><html lang="fr"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>Rapport SEO</title><style>body{font:15px system-ui;max-width:1100px;margin:60px auto;color:#17212e}td,th{padding:10px;border-bottom:1px solid #ddd;text-align:left}pre{white-space:pre-wrap}h1{color:#206f57}</style><h1>${escapeHTML(site.name)}</h1><p>${escapeHTML(site.url)} · ${generatedAt}</p><h2>Problèmes du dernier crawl</h2><table><tr>${headings.map((h) => `<th>${h}</th>`).join("")}</tr>${rows.map((r: any[]) => `<tr>${r.map((c) => `<td>${escapeHTML(c)}</td>`).join("")}</tr>`).join("")}</table><h2>Sources et mesures enregistrées</h2><pre>${escapeHTML(source || "Aucune donnée enregistrée.")}</pre><h2>Résultats complets</h2><pre>${escapeHTML(JSON.stringify(records, null, 2))}</pre></html>`,
    );
    return;
  }
  if (format === "xlsx") {
    const book = new ExcelJS.Workbook();
    book.creator = "SEO Control Studio";
    const summary = book.addWorksheet("Sources");
    summary.addRows([
      ["Site", site.name],
      ["URL", site.url],
      ["Généré", generatedAt],
      ["Source", "Collecte"],
      ...records.map((r) => [r.kind, r.createdAt]),
    ]);
    const sheet = book.addWorksheet("Problèmes");
    sheet.addRows([headings, ...rows]);
    sheet.columns.forEach((c) => (c.width = 32));
    const raw = book.addWorksheet("Mesures");
    raw.addRow([
      "Source",
      "Date",
      "Résultat JSON (tronqué à 30000 caractères par cellule)",
    ]);
    for (const r of records)
      raw.addRow([r.kind, r.createdAt, JSON.stringify(r.data).slice(0, 30000)]);
    await book.xlsx.writeFile(file);
    return;
  }
  if (format === "pdf") {
    const doc = new PDFDocument({ margin: 40, size: "A4" });
    const chunks: Buffer[] = [];
    const result = new Promise<Buffer>((resolve, reject) => {
      doc.on("data", (c) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);
    });
    doc
      .fontSize(24)
      .text("SEO Control Studio")
      .moveDown()
      .fontSize(18)
      .text(site.name)
      .fontSize(10)
      .text(site.url)
      .text(generatedAt)
      .moveDown()
      .text("Sources et collectes")
      .text(source || "Aucune donnée enregistrée.")
      .moveDown();
    for (const row of rows) doc.fontSize(10).text(row.join(" | ")).moveDown();
    for (const r of records.filter((r) => r.kind !== "crawl"))
      doc
        .addPage()
        .fontSize(16)
        .text(r.kind)
        .fontSize(9)
        .text(JSON.stringify(r.data, null, 2));
    doc.end();
    await writeFile(file, await result);
    return;
  }
  throw Error("Format inconnu.");
}
