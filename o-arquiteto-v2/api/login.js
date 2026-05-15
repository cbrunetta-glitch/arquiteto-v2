// api/login.js — login do aluno com CPF + PIN.
// Bloqueia o CPF por 5 minutos após 5 tentativas falhas.

const h = require('../helpers/index.js');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  try {
    const { cpf, pin } = req.body || {};
    if (!cpf || !pin) {
      return res.status(400).json({ error: 'Informe CPF e senha.' });
    }
    if (!h.validateCPF(cpf)) {
      return res.status(400).json({ error: 'CPF inválido.' });
    }

    const cpfHash = h.hashCPF(cpf);
    const tentativasKey = 'tentativas:' + cpfHash;

    const tentativas = await h.kvGet(tentativasKey);
    if (tentativas && tentativas.bloqueadoAte && tentativas.bloqueadoAte > Date.now()) {
      const min = Math.ceil((tentativas.bloqueadoAte - Date.now()) / 60000);
      return res.status(429).json({ error: `Bloqueado por ${min} minuto(s) após tentativas falhas.` });
    }

    const aluno = await h.kvGet('aluno:' + cpfHash);

    // Não revelar se CPF existe: mensagem genérica
    const credenciaisInvalidas = () => {
      const contador = (tentativas && tentativas.contador ? tentativas.contador : 0) + 1;
      const nova = { contador };
      if (contador >= 5) {
        nova.bloqueadoAte = Date.now() + 5 * 60 * 1000;
        nova.contador = 0;
      }
      // 10 min de janela para zerar tentativas sem bloqueio
      return h.kvSet(tentativasKey, nova, 600).then(() => {
        return res.status(401).json({ error: 'CPF ou senha incorretos.' });
      });
    };

    if (!aluno) return credenciaisInvalidas();

    const ok = h.verifyPassword(pin, aluno.senhaSalt, aluno.senhaHash);
    if (!ok) return credenciaisInvalidas();

    await h.kvDel(tentativasKey);

    aluno.ultimoAcesso = Date.now();
    await h.kvSet('aluno:' + cpfHash, aluno);

    const token = h.randomToken();
    await h.kvSet('token:' + token, cpfHash, h.TOKEN_TTL_ALUNO);

    return res.status(200).json({
      token,
      aluno: { nome: aluno.nome, email: aluno.email }
    });
  } catch (err) {
    return res.status(500).json({ error: 'Erro no login: ' + err.message });
  }
};
