// Endpoint para salvar o token do Meta e o Ad Account ID no Redis.
// Uso: GET /api/meta-setup?token=SEU_TOKEN&account_id=act_XXXXXXXXXX

async function kvSet(kvUrl, kvToken, key, value) {
  try {
    const r = await fetch(`${kvUrl}/set/${key}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${kvToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ value }),
      signal: AbortSignal.timeout(5000)
    });
    return (await r.json()).result === 'OK';
  } catch { return false; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const KV_URL   = process.env.KV_REST_API_URL;
  const KV_TOKEN = process.env.KV_REST_API_TOKEN;

  const { token, account_id } = req.query;

  if (!token || !account_id) {
    return res.status(400).json({
      erro: 'Parâmetros obrigatórios: token e account_id',
      exemplo: '/api/meta-setup?token=EAAxx...&account_id=act_123456789'
    });
  }

  const [okToken, okAccount] = await Promise.all([
    kvSet(KV_URL, KV_TOKEN, 'meta_access_token', token),
    kvSet(KV_URL, KV_TOKEN, 'meta_ad_account_id', account_id)
  ]);

  if (okToken && okAccount) {
    return res.status(200).json({
      ok: true,
      mensagem: 'Token e Ad Account ID salvos com sucesso!',
      proximo: 'Acesse /api/meta para testar'
    });
  }

  return res.status(500).json({ erro: 'Falha ao salvar no Redis' });
}
