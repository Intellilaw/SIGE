import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, hash: string) {
  const [salt, stored] = hash.split(":");
  const derived = scryptSync(password, salt, 64);
  return timingSafeEqual(derived, Buffer.from(stored, "hex"));
}
