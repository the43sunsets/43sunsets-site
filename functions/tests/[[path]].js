export const onRequest = () => new Response("not found", { status: 404, headers: { "cache-control": "no-store" } });
