// Proxy autenticado para a API da Anthropic.
// O modelo fica em variável de ambiente para poder ser trocado sem novo deploy.
const MODELO = process.env.ANTHROPIC_MODEL || 'claude-opus-5';
const ESFORCO = process.env.ANTHROPIC_EFFORT || 'medium';

const MAX_TENTATIVAS = 3;
const ORCAMENTO_MS = 40000; // depois disso não vale mais a pena tentar de novo
const STATUS_RETENTAVEL = new Set([408, 409, 429, 500, 502, 503, 529]);

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  const { messages, system, max_tokens, output_config } = req.body;

  if (!messages || !system) {
    return res.status(400).json({ error: 'Campos obrigatórios ausentes.' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Chave de API não configurada no servidor.' });
  }

  const corpo = {
    model: MODELO,
    max_tokens: max_tokens || 8000,
    system,
    messages,
    output_config: Object.assign({ effort: ESFORCO }, output_config || {}),
  };

  const inicio = Date.now();
  let ultimoErro = null;

  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
    const ultima = tentativa === MAX_TENTATIVAS;

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(corpo),
      });

      const data = await response.json();

      if (response.ok) {
        return res.status(200).json(data);
      }

      const podeRepetir =
        STATUS_RETENTAVEL.has(response.status) &&
        !ultima &&
        Date.now() - inicio < ORCAMENTO_MS;

      if (podeRepetir) {
        // A API sugere quanto esperar quando é limite de requisições (turma inteira usando junto).
        const sugerido = Number(response.headers.get('retry-after'));
        const espera =
          Number.isFinite(sugerido) && sugerido > 0
            ? sugerido * 1000
            : 800 * Math.pow(2, tentativa - 1);
        await esperar(Math.min(espera, 6000));
        continue;
      }

      if (response.status === 429) {
        return res.status(429).json({
          error: 'O sistema está recebendo muitos pedidos ao mesmo tempo. Espere alguns segundos e tente de novo.',
        });
      }

      return res
        .status(response.status)
        .json({ error: (data.error && data.error.message) || 'Erro na API.' });

    } catch (err) {
      ultimoErro = err;
      if (!ultima && Date.now() - inicio < ORCAMENTO_MS) {
        await esperar(800 * Math.pow(2, tentativa - 1));
        continue;
      }
    }
  }

  return res.status(502).json({
    error: 'A API não respondeu após várias tentativas. Tente novamente em instantes.'
      + (ultimoErro ? ` (${ultimoErro.message})` : ''),
  });
};

// O Opus 5 raciocina antes de responder, então uma resposta pode levar bem mais que os
// 10s que a Vercel dá por padrão. Sem isto, pedidos longos morrem por timeout.
module.exports.config = { maxDuration: 60 };
