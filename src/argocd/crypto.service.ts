import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'crypto';

// AES-256-GCM con key derivada por scrypt de ENCRYPTION_KEY.
//
// Formato del payload almacenado en DB (string base64-url-safe-ish):
//   v1:<salt_b64>:<iv_b64>:<tag_b64>:<ciphertext_b64>
//
// Prefijo "v1" deja la puerta abierta a rotar el algoritmo más adelante sin
// romper rows existentes.

const ALGO = 'aes-256-gcm';
const KEY_LEN = 32;
const IV_LEN = 12; // GCM recomienda 96 bits
const SALT_LEN = 16;
const SCRYPT_N = 16384; // 2^14, OWASP mínimo para 2025+
const TAG_LEN = 16;

@Injectable()
export class CryptoService {
  private readonly logger = new Logger(CryptoService.name);
  private readonly secret: Buffer;

  constructor() {
    const raw = process.env.ENCRYPTION_KEY;
    if (!raw || raw.length < 16) {
      // No abortamos en boot porque hay paths del back que no necesitan crypto.
      // Sí logueamos y reventamos cuando alguien intente encrypt/decrypt.
      this.logger.warn(
        'ENCRYPTION_KEY no seteada o muy corta (<16 chars). El cifrado de secrets no funcionará.',
      );
      this.secret = Buffer.alloc(0);
    } else {
      this.secret = Buffer.from(raw, 'utf8');
    }
  }

  encrypt(plaintext: string): string {
    if (this.secret.length === 0) {
      throw new InternalServerErrorException(
        'ENCRYPTION_KEY no configurada — no se puede cifrar secrets',
      );
    }
    const salt = randomBytes(SALT_LEN);
    const key = scryptSync(this.secret, salt, KEY_LEN, { N: SCRYPT_N });
    const iv = randomBytes(IV_LEN);
    const cipher = createCipheriv(ALGO, key, iv, { authTagLength: TAG_LEN });
    const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1:${salt.toString('base64')}:${iv.toString('base64')}:${tag.toString(
      'base64',
    )}:${enc.toString('base64')}`;
  }

  decrypt(payload: string): string {
    if (this.secret.length === 0) {
      throw new InternalServerErrorException(
        'ENCRYPTION_KEY no configurada — no se puede descifrar secrets',
      );
    }
    const parts = payload.split(':');
    if (parts.length !== 5 || parts[0] !== 'v1') {
      throw new InternalServerErrorException('Formato de cifrado inválido');
    }
    const [, saltB64, ivB64, tagB64, encB64] = parts;
    const salt = Buffer.from(saltB64, 'base64');
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const enc = Buffer.from(encB64, 'base64');
    const key = scryptSync(this.secret, salt, KEY_LEN, { N: SCRYPT_N });
    const decipher = createDecipheriv(ALGO, key, iv, { authTagLength: TAG_LEN });
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
  }
}
