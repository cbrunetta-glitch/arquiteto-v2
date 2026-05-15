// api/me.js — valida token (GET) e faz logout (DELETE).

const h = require('../helpers/index.js');

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const auth = await h.authenticateRequest(req);
      if (!auth) return res.status(401).json({ error: 'Não autenticado.' });
      return res.status(200).json({
        aluno: {
          nome: auth.aluno.nome,
          email: auth.aluno.email,
          criadoEm: auth.aluno.criadoEm,
          ultimoAcesso: auth.aluno.ultimoAcesso
        }
      });
    }
    if (req.method === 'DELETE') {
      const authHeader = req.headers.authorization || '';
      if (authHeader.startsWith('Bearer ')) {
        const token = authHeader.slice(7);
        await h.kvDel('token:' + token);
      }
      return res.status(200).json({ ok: true });
    }
    return res.status(405).json({ error: 'Método não permitido.' });
  } catch (err) {
    return res.status(500).json({ error: 'Erro: ' + err.message });
  }
};
