export default async function handler(req, res) {
  const KV_URL   = process.env.KV_REST_API_URL;
  const KV_TOKEN = process.env.KV_REST_API_TOKEN;

  if (!KV_URL) {
    const kvVars = Object.keys(process.env).filter(k => k.includes('KV') || k.includes('REDIS') || k.includes('UPSTASH'));
    return res.json({ erro: 'KV_URL não definida', variaveis_disponiveis: kvVars });
  }

  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 4000);

    const r = await fetch(`${KV_URL}/ping`, {
      headers: { Authorization: `Bearer ${KV_TOKEN}` },
      signal: ctrl.signal
    });
    const text = await r.text();
    return res.json({ ok: true, status: r.status, resposta: text, url: KV_URL.slice(0, 40) });
  } catch (err) {
    return res.json({ erro: err.message, tipo: err.name });
  }
}
