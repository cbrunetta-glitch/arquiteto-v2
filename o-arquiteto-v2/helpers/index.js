// helpers/index.js — utilitários compartilhados por todas as funções serverless.
// Conecta no Redis via REDIS_URL (variável criada automaticamente pela Vercel).

const crypto = require('crypto');
const { createClient } = require('redis');

// ============================================================
//  REDIS — cliente reutilizado entre invocations quentes
// ============================================================

const REDIS_URL = process.env.REDIS_URL || process.env.KV_URL;

let _client = null;

async function getClient() {
  if (_client && _client.isReady) return _client;
  if (_client) {
    try { await _client.disconnect(); } catch {}
    _client = null;
  }
  if (!REDIS_URL) throw new Error('REDIS_URL não configurada no servidor.');
  _client = createClient({
    url: REDIS_URL,
    socket: { connectTimeout: 10000, reconnectStrategy: false }
  });
  _client.on('error', () => { /* evita crash por erro não tratado */ });
  await _client.connect();
  return _client;
}

async function kvGet(key) {
  const c = await getClient();
  const raw = await c.get(key);
  if (raw === null || raw === undefined) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

async function kvSet(key, value, ttlSeconds) {
  const c = await getClient();
  const v = JSON.stringify(value);
  if (ttlSeconds) await c.set(key, v, { EX: ttlSeconds });
  else await c.set(key, v);
  return 'OK';
}

async function kvDel(key) {
  const c = await getClient();
  return c.del(key);
}

async function kvExpire(key, seconds) {
  const c = await getClient();
  return c.expire(key, seconds);
}

async function kvSAdd(set, value) {
  const c = await getClient();
  return c.sAdd(set, value);
}

async function kvSRem(set, value) {
  const c = await getClient();
  return c.sRem(set, value);
}

async function kvSMembers(set) {
  const c = await getClient();
  const r = await c.sMembers(set);
  return Array.isArray(r) ? r : [];
}

// ============================================================
//  Criptografia
// ============================================================

const ENC_KEY_HEX = process.env.ENCRYPTION_KEY;

function getEncKey() {
  if (!ENC_KEY_HEX) throw new Error('ENCRYPTION_KEY não configurada.');
  const buf = Buffer.from(ENC_KEY_HEX, 'hex');
  if (buf.length !== 32) throw new Error('ENCRYPTION_KEY deve ter 64 caracteres hex (32 bytes).');
  return buf;
}

function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function hashCPF(cpf) {
  const clean = String(cpf).replace(/\D/g, '');
  return sha256('arquiteto-cpf-v1:' + clean);
}

function encryptCPF(cpf) {
  const clean = String(cpf).replace(/\D/g, '');
  const key = getEncKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(clean, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

function decryptCPF(encoded) {
  const key = getEncKey();
  const buf = Buffer.from(encoded, 'base64');
  const iv = buf.slice(0, 12);
  const tag = buf.slice(12, 28);
  const enc = buf.slice(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(enc, null, 'utf8') + decipher.final('utf8');
}

function hashPassword(password, salt) {
  if (!salt) salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(String(password), salt, 100000, 64, 'sha256').toString('hex');
  return { salt, hash };
}

function verifyPassword(password, salt, expectedHash) {
  const { hash } = hashPassword(password, salt);
  try {
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(expectedHash, 'hex'));
  } catch {
    return false;
  }
}

function timingSafeEqualString(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function randomToken() {
  return crypto.randomBytes(32).toString('hex');
}

// ============================================================
//  Validações
// ============================================================

function formatCPF(cpf) {
  const c = String(cpf).replace(/\D/g, '');
  if (c.length !== 11) return cpf;
  return `${c.slice(0,3)}.${c.slice(3,6)}.${c.slice(6,9)}-${c.slice(9,11)}`;
}

function validateCPF(cpf) {
  const c = String(cpf).replace(/\D/g, '');
  if (c.length !== 11) return false;
  if (/^(\d)\1+$/.test(c)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(c[i], 10) * (10 - i);
  let d1 = 11 - (sum % 11);
  if (d1 >= 10) d1 = 0;
  if (d1 !== parseInt(c[9], 10)) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(c[i], 10) * (11 - i);
  let d2 = 11 - (sum % 11);
  if (d2 >= 10) d2 = 0;
  if (d2 !== parseInt(c[10], 10)) return false;

  return true;
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email).trim());
}

const PINS_OBVIOS = new Set([
  '0000','1111','2222','3333','4444','5555','6666','7777','8888','9999',
  '1234','2345','3456','4567','5678','6789','0123',
  '4321','5432','6543','7654','8765','9876','3210',
  '1212','2121','1010','0101','2020','1313','6969'
]);

function validatePIN(pin) {
  const p = String(pin || '');
  if (!/^\d{4}$/.test(p)) return { ok: false, reason: 'A senha deve ter exatamente 4 dígitos.' };
  if (PINS_OBVIOS.has(p)) return { ok: false, reason: 'Senha óbvia demais. Escolha outra combinação.' };
  return { ok: true };
}

// ============================================================
//  Autenticação por token (Bearer)
// ============================================================

const TOKEN_TTL_ALUNO = 7 * 24 * 60 * 60;
const TOKEN_TTL_PAINEL = 12 * 60 * 60;

async function authenticateRequest(req) {
  const auth = req.headers && req.headers.authorization ? req.headers.authorization : '';
  if (!auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  const cpfHash = await kvGet('token:' + token);
  if (!cpfHash) return null;
  const aluno = await kvGet('aluno:' + cpfHash);
  if (!aluno) return null;
  await kvExpire('token:' + token, TOKEN_TTL_ALUNO);
  aluno.ultimoAcesso = Date.now();
  await kvSet('aluno:' + cpfHash, aluno);
  return { cpfHash, aluno, token };
}

async function authenticatePainel(req) {
  const auth = req.headers && req.headers.authorization ? req.headers.authorization : '';
  if (!auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  const v = await kvGet('painel_token:' + token);
  if (!v) return null;
  await kvExpire('painel_token:' + token, TOKEN_TTL_PAINEL);
  return { token };
}

// ============================================================
//  Exports
// ============================================================

module.exports = {
  kvGet, kvSet, kvDel, kvExpire, kvSAdd, kvSRem, kvSMembers,
  sha256, hashCPF, encryptCPF, decryptCPF,
  hashPassword, verifyPassword, timingSafeEqualString, randomToken,
  formatCPF, validateCPF, validateEmail, validatePIN,
  authenticateRequest, authenticatePainel,
  TOKEN_TTL_ALUNO, TOKEN_TTL_PAINEL
};
