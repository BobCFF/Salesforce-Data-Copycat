import crypto from 'node:crypto';

// ---------------------------------------------------------------------------
// Passphrase-encrypted export/import of connection credentials.
//
// The plaintext (a JSON array of connection credential objects) is encrypted
// with AES-256-GCM. The key is derived from a user passphrase with scrypt and
// a per-export random salt. The passphrase is never stored: a wrong one fails
// the GCM authentication tag, so decryption reveals nothing.
// ---------------------------------------------------------------------------

const FORMAT = 'scc-export';
const VERSION = 1;
// scrypt cost parameters. N=16384 keeps memory (~16MB) under Node's default
// 32MB maxmem while staying expensive enough to brute-force a passphrase.
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 };

function deriveKey(passphrase, salt) {
  return crypto.scryptSync(Buffer.from(passphrase, 'utf8'), salt, SCRYPT.keylen, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
    // 128 * N * r bytes, plus headroom.
    maxmem: 256 * SCRYPT.N * SCRYPT.r,
  });
}

/**
 * Encrypt an array of connection credential objects with a passphrase.
 * Returns a JSON-serialisable envelope (all binary fields base64-encoded).
 */
export function encryptExport(connections, passphrase) {
  if (!passphrase || String(passphrase).length < 8) {
    const err = new Error('A passphrase of at least 8 characters is required.');
    err.status = 400;
    throw err;
  }
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = deriveKey(passphrase, salt);
  const plaintext = Buffer.from(JSON.stringify(connections), 'utf8');
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    app: 'salesforce-data-copycat',
    format: FORMAT,
    version: VERSION,
    kdf: 'scrypt',
    scrypt: { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p },
    salt: salt.toString('base64'),
    cipher: 'aes-256-gcm',
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    count: Array.isArray(connections) ? connections.length : 0,
    exportedAt: new Date().toISOString(),
    data: data.toString('base64'),
  };
}

/**
 * Decrypt an export envelope with a passphrase. Throws a 400 on a malformed
 * envelope and a 401 on a wrong passphrase / tampered data.
 */
export function decryptExport(envelope, passphrase) {
  if (!envelope || typeof envelope !== 'object' || envelope.format !== FORMAT) {
    const err = new Error('This file is not a Salesforce Data Copycat connections export.');
    err.status = 400;
    throw err;
  }
  if (envelope.version !== VERSION) {
    const err = new Error(`Unsupported export version ${envelope.version}.`);
    err.status = 400;
    throw err;
  }
  if (!passphrase) {
    const err = new Error('A passphrase is required to import.');
    err.status = 400;
    throw err;
  }
  let salt;
  let iv;
  let tag;
  let data;
  try {
    salt = Buffer.from(envelope.salt, 'base64');
    iv = Buffer.from(envelope.iv, 'base64');
    tag = Buffer.from(envelope.tag, 'base64');
    data = Buffer.from(envelope.data, 'base64');
  } catch {
    const err = new Error('The export file is corrupted.');
    err.status = 400;
    throw err;
  }
  const params = envelope.scrypt || SCRYPT;
  const key = crypto.scryptSync(Buffer.from(passphrase, 'utf8'), salt, SCRYPT.keylen, {
    N: params.N,
    r: params.r,
    p: params.p,
    maxmem: 256 * params.N * params.r,
  });
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(data), decipher.final()]);
    const parsed = JSON.parse(plaintext.toString('utf8'));
    if (!Array.isArray(parsed)) throw new Error('bad payload');
    return parsed;
  } catch {
    const err = new Error('Incorrect passphrase, or the file has been altered.');
    err.status = 401;
    throw err;
  }
}
