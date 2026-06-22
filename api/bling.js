function blingGet(path, accessToken) {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (fn, val) => { if (!done) { done = true; clearTimeout(dl); fn(val); } };

    const req = https.get({ hostname: 'www.bling.com.br', path, headers: { Authorization: `Bearer ${accessToken}` } }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => finish(resolve, { status: res.statusCode, body: d }));
    });
    req.on('error', err => finish(reject, err));

    // Timeout ABSOLUTO — destrói conexão após 10s independente de atividade
    const dl = setTimeout(() => { req.destroy(); finish(reject, new Error('Bling timeout absoluto 10s')); }, 10000);
  });
}
