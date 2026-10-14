import { store } from "./_lib.js";

const SESSION_PER_MINUTE = 60;
// 9/8 実測: KV は結果整合で連打を数えられない → 同一拠点で即時反映される Cache API の分カウンタ。拠点をまたぐ分散取得は Cloudflare のレート制限ルール(CEO 操作済み)が本命。
export async function sessionLimited(env, sid) {
  const minute = Math.floor(Date.now() / 60000);
  let n = 1;
  try {
    const cache = caches.default; const key = new Request(`https://signal-rl.invalid/rlq/${sid}/${minute}`);
    const hit = await cache.match(key); if (hit) n = (parseInt(await hit.text(), 10) || 0) + 1;
    await cache.put(key, new Response(String(n), { headers: { "cache-control": "max-age=120", "content-type": "text/plain" } }));
  } catch (e) { n = 1; }
  try {
    const kv = store(env);
    if (kv && (n === 1 || n % 10 === 0)) {
      const day = new Date().toISOString().slice(0, 10);
      for (let i = 0; i < (n === 1 ? 1 : 10); i++) await kv.bumpDl(day, sid);
    }
  } catch (e) { /* 控えは best effort */ }
  return n > SESSION_PER_MINUTE;
}
