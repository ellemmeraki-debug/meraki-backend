// Lê o gasto do Google Ads a partir de uma planilha Google Sheets pública
// A planilha é atualizada pelo Google Ads Script rodando dentro do Google Ads

const SHEET_ID = '1USMLshUYitLjhaAN9zWLJaVvdYl9P4SLQKDCPaWUVj0';
const CSV_URL  = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv`;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const agora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const anoParam = req.query.ano || String(agora.getFullYear());
  const mesParam = req.query.mes ? String(req.query.mes).padStart(2, '0')
                                 : String(agora.getMonth() + 1).padStart(2, '0');
  const mesAlvo = `${anoParam}-${mesParam}`;

  let csv;
  try {
    const r = await fetch(CSV_URL, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    csv = await r.text();
  } catch (e) {
    return res.status(200).json({
      erro: `Não foi possível ler a planilha: ${e.message}`,
      dica: 'Verifique se a planilha está compartilhada como pública (visualizador)'
    });
  }

  const linhas = csv.trim().split('\n').map(l => l.split(',').map(c => c.replace(/"/g, '').trim()));

  let gasto = null;
  let atualizadoEm = null;

  // Pega a ÚLTIMA linha do mês (mais recente, caso haja duplicatas)
  for (const linha of linhas) {
    if (linha[0] === mesAlvo) {
      gasto = parseFloat(linha[1]) || 0;
      atualizadoEm = linha[2] || null;
      // não faz break — continua para pegar a última ocorrência
    }
  }

  if (gasto === null) {
    return res.status(200).json({
      mes: `${mesParam}/${anoParam}`,
      gasto: 0,
      aviso: `Mês ${mesAlvo} não encontrado na planilha. O script do Google Ads já rodou hoje?`
    });
  }

  return res.status(200).json({
    mes: `${mesParam}/${anoParam}`,
    gasto: Math.round(gasto * 100) / 100,
    moeda: 'BRL',
    atualizado_em: atualizadoEm
  });
}
