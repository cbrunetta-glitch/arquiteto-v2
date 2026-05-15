// api/excluir-conta.js — apaga todos os dados do aluno (LGPD).

const h = require('../helpers/index.js');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  try {
    const auth = await h.authenticateRequest(req);
    if (!auth) return res.status(401).json({ error: 'Não autenticado.' });

    const { cpfHash, aluno, token } = auth;

    // Apaga sessões do aluno
    const ids = await h.kvSMembers('aluno_sessoes:' + cpfHash);
    for (const id of ids) {
      await h.kvDel('sessao:' + id);
      await h.kvSRem('todas_sessoes', id);
    }
    await h.kvDel('aluno_sessoes:' + cpfHash);

    // Apaga índice de email e perfil
    if (aluno && aluno.email) {
      await h.kvDel('email:' + aluno.email);
    }
    await h.kvDel('aluno:' + cpfHash);
    await h.kvSRem('alunos', cpfHash);

    // Invalida token
    if (token) await h.kvDel('token:' + token);

    // Tentativas pendentes
    await h.kvDel('tentativas:' + cpfHash);

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Erro: ' + err.message });
  }
};
