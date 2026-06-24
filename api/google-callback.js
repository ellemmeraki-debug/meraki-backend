// Recebe o código OAuth do Google e salva o refresh_token no Redis

async function kvGet(kvUrl, kvToken, key) {
  try {
    const r = await fetch(`${kvUrl}/get/${key}`, {
      headers: { Authorization: `Bearer ${kvToken}` },
      signal: AbortSignal.timeout(4000)
    });
    return (await r.json()).result ?? null;
  } catch { return null; }
}

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
  const KV_URL   = process.env.KV_REST_API_URL;
  const KV_TOKEN = process.env.KV_REST_API_TOKEN;

  const { code, error } = req.query;
  if (error) return res.status(400).json({ erro: `Google recusou: ${error}` });
  if (!code)  return res.status(400).json({ erro: 'Código OAuth ausente' });

  const [clientId, clientSecret] = await Promise.all([
    kvGet(KV_URL, KV_TOKEN, 'google_client_id'),
    kvGet(KV_URL, KV_TOKEN, 'google_client_secret')
  ]);

  const redirectUri = `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}/api/google-callback`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, client_id: clientId, client_secret: clientSecret,
      redirect_uri: redirectUri, grant_type: 'authorization_code'
    }),
    signal: AbortSignal.timeout(10000)
  });

  const tokens = await tokenRes.json();
  if (tokens.error) return res.status(400).json({ erro: tokens.error_description || tokens.error });

  await kvSet(KV_URL, KV_TOKEN, 'google_refresh_token', tokens.refresh_token);

  return res.status(200).send(`
    <html><body style="font-family:sans-serif;padding:40px;text-align:center">
      <h2>Google Ads autorizado!</h2>
      <p>Refresh token salvo. Acesse <a href="/api/google">/api/google</a> para testar.</p>
    </body></html>
  `);
}
