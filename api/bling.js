export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  const KV_URL   = process.env.KV_REST_API_URL;
  const KV_TOKEN = process.env.KV_REST_API_TOKEN;

  const t1 = Date.now();
  
  // Só lê do Redis, sem chamar o Bling
  try {
    const r = await fetch(`${KV_URL}/get/bling_access_token`, {
      headers: { Authorization: `Bearer ${KV_TOKEN}` }
    });
    const data = await r.json();
    const t2 = Date.now();
    
    return res.json({
      redis_ms: t2 - t1,
      token_existe: !!data.result,
      token_preview: data.result ? String(data.result).slice(0, 20) + '...' : 'null'
    });
  } catch (err) {
    return res.json({ erro: err.message, redis_ms: Date.now() - t1 });
  }
}
