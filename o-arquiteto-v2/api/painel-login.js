// api/painel-login.js — login da professora.
// A senha é comparada como string, sem limite de formato ou tamanho: use uma
// frase longa em PROFESSORA_PIN. O painel dá acesso aos dados de toda a turma.
//
// O contador de tentativas é único para o painel (chave 'painel_tentativas'),
// não por usuário nem por IP: 5 erros bloqueiam o painel por 5 minutos, venham
// de quem vierem. É proposital — contar por IP seria contornável trocando de IP.
// O efeito colateral é que um estranho tentando adivinhar a senha deixa a
// professora esperando 5 minutos. O login dos alunos é independente disto e
// tem contador por CPF (ver login.js).

const h = require('../helpers/index.js');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  try {
    const { pin } = req.body || {};
    if (!pin) return res.status(400).json({ error: 'Informe a senha.' });

    const expectedPin = process.env.PROFESSORA_PIN;
    if (!expectedPin) {
      return res.status(500).json({ error: 'PROFESSORA_PIN não configurada no servidor.' });
    }

    const tentativas = await h.kvGet('painel_tentativas');
    if (tentativas && tentativas.bloqueadoAte && tentativas.bloqueadoAte > Date.now()) {
      const min = Math.ceil((tentativas.bloqueadoAte - Date.now()) / 60000);
      return res.status(429).json({ error: `Painel bloqueado por ${min} minuto(s).` });
    }

    if (!h.timingSafeEqualString(String(pin), String(expectedPin))) {
      const contador = (tentativas && tentativas.contador ? tentativas.contador : 0) + 1;
      const nova = { contador };
      if (contador >= 5) {
        nova.bloqueadoAte = Date.now() + 5 * 60 * 1000;
        nova.contador = 0;
      }
      await h.kvSet('painel_tentativas', nova, 600);
      return res.status(401).json({ error: 'Senha incorreta.' });
    }

    await h.kvDel('painel_tentativas');
    const token = h.randomToken();
    await h.kvSet('painel_token:' + token, '1', h.TOKEN_TTL_PAINEL);

    return res.status(200).json({ token });
  } catch (err) {
    return res.status(500).json({ error: 'Erro: ' + err.message });
  }
};
