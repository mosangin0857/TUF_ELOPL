import "server-only"
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto"
import { promisify } from "node:util"

const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>
const KEY_LEN = 32

/** PIN 규칙: 숫자 4~8자리 */
export const PIN_PATTERN = /^\d{4,8}$/

/** 저장 형식: scrypt$<salt base64>$<hash base64> */
export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16)
  const hash = await scryptAsync(pin, salt, KEY_LEN)
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const [scheme, saltB64, hashB64] = stored.split("$")
  if (scheme !== "scrypt" || !saltB64 || !hashB64) return false
  const expected = Buffer.from(hashB64, "base64")
  const actual = await scryptAsync(pin, Buffer.from(saltB64, "base64"), expected.length)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
