// Salva credenciais do Google Ads no Redis
// Uso: /api/google-setup?client_id=X&client_secret=Y&developer_token=Z&customer_id=W

async function kvSet(kvUrl, kvToken, key, value) {
  try {
    const r = await fetch(`${kvUrl}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${kvToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([['SET', key, value]]),
      signal: AbortSignal.timeout(5000)
    });
    const data = await r.json();
    return data[0]?.result === 'OK';
  } catch { return false; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const KV_URL   = process.env.KV_REST_API_URL;
  const KV_TOKEN = process.env.KV_REST_API_TOKEN;

  const { client_id, client_secret, developer_token, customer_id } = req.query;

  if (!client_id || !client_secret || !developer_token || !customer_id) {
    return res.status(400).json({
      erro: 'Parâmetros obrigatórios: client_id, client_secret, developer_token, customer_id'
    });
  }

  const cleanCustomerId = customer_id.replace(/-/g, '');

  const results = await Promise.all([
    kvSet(KV_URL, KV_TOKEN, 'google_client_id',       client_id),
    kvSet(KV_URL, KV_TOKEN, 'google_client_secret',   client_secret),
    kvSet(KV_URL, KV_TOKEN, 'google_developer_token', developer_token),
    kvSet(KV_URL, KV_TOKEN, 'google_customer_id',     cleanCustomerId)
  ]);

  if (results.every(Boolean)) {
    return res.status(200).json({
      ok: true,
      mensagem: 'Credenciais salvas! Agora acesse /api/google-oauth para autorizar sua conta.',
      proximo: 'https://meraki-backend-i8fo.vercel.app/api/google-oauth'
    });
  }
  return res.status(500).json({ erro: 'Falha ao salvar no Redis' });
}
