export default async function handler(req, res) {
  const KV_URL   = process.env.KV_REST_API_URL;
  const KV_TOKEN = process.env.KV_REST_API_TOKEN;
  const key      = req.query.key;

  if (!KV_URL) return res.json({ erro: 'KV_URL não definida' });

  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 4000);
    const endpoint = key ? `${KV_URL}/get/${key}` : `${KV_URL}/ping`;
    const r = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${KV_TOKEN}` },
      signal: ctrl.signal
    });
    const data = await r.json();
    return res.json({ ok: true, chave: key || 'ping', resultado: data.result });
  } catch (err) {
    return res.json({ erro: err.message });
  }
}
