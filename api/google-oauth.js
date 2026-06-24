// Redireciona para o consent screen do Google OAuth
// Acesse: /api/google-oauth para autorizar

async function kvGet(kvUrl, kvToken, key) {
  try {
    const r = await fetch(`${kvUrl}/get/${key}`, {
      headers: { Authorization: `Bearer ${kvToken}` },
      signal: AbortSignal.timeout(4000)
    });
    return (await r.json()).result ?? null;
  } catch { return null; }
}

export default async function handler(req, res) {
  const KV_URL   = process.env.KV_REST_API_URL;
  const KV_TOKEN = process.env.KV_REST_API_TOKEN;

  const clientId = await kvGet(KV_URL, KV_TOKEN, 'google_client_id');
  if (!clientId) {
    return res.status(400).json({
      erro: 'Client ID não configurado.',
      instrucao: 'Primeiro acesse /api/google-setup?client_id=...&client_secret=...&developer_token=...&customer_id=...'
    });
  }

  const redirectUri = `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}/api/google-callback`;
  const scope = 'https://www.googleapis.com/auth/adwords';

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope,
    access_type: 'offline',
    prompt: 'consent'
  });

  return res.redirect(302, `https://accounts.google.com/o/oauth2/v2/auth?${params}`);
                                }
