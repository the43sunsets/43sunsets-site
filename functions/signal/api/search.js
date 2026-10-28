import { endpoint, checkNames, single, batch, fail } from "./_q.js";
export const onRequestGet = endpoint(async ({ db, paramsQuery }) => {
  checkNames(paramsQuery, ["q"]);
  const q = (single(paramsQuery, "q") ?? "").trim();
  if ([...q].length < 3) fail(400, "3 文字以上で検索してください");
  const [rows] = await batch(db, [["SELECT c.id, c.name, c.state, c.city FROM company_fts JOIN company c ON c.id=company_fts.id WHERE company_fts MATCH ? ORDER BY rank LIMIT ?", [`"${q.replace(/"/g, '""')}"`, 20]]]);
  return { rows };
});
