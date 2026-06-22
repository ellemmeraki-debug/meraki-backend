export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const KV_URL   = process.env.KV_REST_API_URL;
  const KV_TOKEN = process.env.KV_REST_API_TOKEN;

  const results = {};
  const t0 = Date.now();

  // 1. Lê token do Redis
  try {
    const r = await fetch(`${KV_URL}/get/bling_access_token`, {
      headers: { Authorization: `Bearer ${KV_TOKEN}` },
      signal: AbortSignal.timeout(4000)
    });
    const j = await r.json();
    const token = j.result;
    results.redis_ms = Date.now() - t0;
    results.token_existe = !!token;
    results.token_preview = token ? token.slice(0, 20) + '...' : null;

    if (!token) return res.status(200).json({ ...results, erro: 'Token ausente no Redis' });

    // 2. Testa conexão TCP com Bling (HEAD simples)
    const t1 = Date.now();
    try {
      const rb = await fetch('https://www.bling.com.br/Api/v3/contas/receber?pagina=1&limite=1', {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'User-Agent': 'MerakiDashboard/1.0' },
        signal: AbortSignal.timeout(7000)
      });
      const body = await rb.text();
      results.bling_ms = Date.now() - t1;
      results.bling_status = rb.status;
      results.bling_preview = body.slice(0, 300);
    } catch (e) {
      results.bling_ms = Date.now() - t1;
      results.bling_erro = e.message;
    }

  } catch (e) {
    results.redis_erro = e.message;
  }

  return res.status(200).json(results);
}
