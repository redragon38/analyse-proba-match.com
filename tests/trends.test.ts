import { it, expect } from "vitest";
import { parseCSV, parseTrends } from "../app/trends";
it("conserve les cellules entre guillemets et les lignes multi colonnes", () => {
  expect(parseCSV('Date,"Terme, composé"\r\n2026-01-01,10')).toEqual([
    ["Date", "Terme, composé"],
    ["2026-01-01", "10"],
  ]);
});
it("parse les CSV Trends avec métadonnées sans inventer les indices <1", () => {
  const result = parseTrends(
    "Catégorie : Toutes\n\nSemaine,Terme\n2026-01-01,42\n2026-01-08,<1",
  );
  expect(result.temporal).toBe(true);
  expect(result.entries.map((r) => r.values[0].value)).toEqual([42, null]);
});
it("refuse les CSV sans observations et les guillemets incomplets", () => {
  expect(() => parseTrends("aucune donnée")).toThrow();
  expect(() => parseCSV('a,"non terminé')).toThrow();
});
