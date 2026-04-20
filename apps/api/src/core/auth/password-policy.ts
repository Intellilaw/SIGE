import { AppError } from "../errors/app-error";

export const PASSWORD_POLICY_MESSAGE =
  "Password must be at least 10 characters and include uppercase, lowercase, number, and symbol.";

export function assertStrongPassword(password: string) {
  const value = password.trim();
  const isLongEnough = value.length >= 10;
  const hasUppercase = /[A-Z]/.test(value);
  const hasLowercase = /[a-z]/.test(value);
  const hasNumber = /\d/.test(value);
  const hasSymbol = /[^A-Za-z0-9]/.test(value);

  if (!(isLongEnough && hasUppercase && hasLowercase && hasNumber && hasSymbol)) {
    throw new AppError(400, "WEAK_PASSWORD", PASSWORD_POLICY_MESSAGE);
  }
}
