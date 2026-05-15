// api/cadastrar.js — cadastra novo aluno.
// Espera no body: { cpf, nome, email, pin, consentimento }

const h = require('../helpers/index.js');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  try {
    const { cpf, nome, email, pin, consentimento } = req.body || {};

    if (!cpf || !nome || !email || !pin) {
      return res.status(400).json({ error: 'Preencha CPF, nome, email e senha.' });
    }
    if (!consentimento) {
      return res.status(400).json({ error: 'É necessário aceitar o termo de consentimento.' });
    }
    if (!h.validateCPF(cpf)) {
      return res.status(400).json({ error: 'CPF inválido.' });
    }
    if (!h.validateEmail(email)) {
      return res.status(400).json({ error: 'Email inválido.' });
    }
    if (String(nome).trim().length < 3) {
      return res.status(400).json({ error: 'Nome muito curto.' });
    }

    const pinCheck = h.validatePIN(pin);
    if (!pinCheck.ok) {
      return res.status(400).json({ error: pinCheck.reason });
    }

    const cpfHash = h.hashCPF(cpf);
    const emailLower = String(email).trim().toLowerCase();

    // Duplicatas
    const jaTem = await h.kvGet('aluno:' + cpfHash);
    if (jaTem) {
      return res.status(409).json({ error: 'Este CPF já está cadastrado. Faça login.' });
    }
    const emailExistente = await h.kvGet('email:' + emailLower);
    if (emailExistente) {
      return res.status(409).json({ error: 'Este email já está cadastrado com outro CPF.' });
    }

    const { salt, hash } = h.hashPassword(pin);
    const now = Date.now();

    const aluno = {
      cpfHash,
      cpfEnc: h.encryptCPF(cpf),
      nome: String(nome).trim(),
      email: emailLower,
      senhaSalt: salt,
      senhaHash: hash,
      consentimentoEm: now,
      criadoEm: now,
      ultimoAcesso: now
    };

    await h.kvSet('aluno:' + cpfHash, aluno);
    await h.kvSet('email:' + emailLower, cpfHash);
    await h.kvSAdd('alunos', cpfHash);

    const token = h.randomToken();
    await h.kvSet('token:' + token, cpfHash, h.TOKEN_TTL_ALUNO);

    return res.status(200).json({
      token,
      aluno: { nome: aluno.nome, email: aluno.email }
    });
  } catch (err) {
    return res.status(500).json({ error: 'Erro no cadastro: ' + err.message });
  }
};
