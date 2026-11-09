import type { User } from "@/types/models";

export const SESSION_COOKIE_NAME = "elitetime_session";
export const SESSION_MAX_AGE = 60 * 60 * 24; // 24h

const isProduction = process.env.NODE_ENV === "production";

const baseCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: isProduction,
  path: "/",
};

export const sessionCookieOptions = {
  ...baseCookieOptions,
  maxAge: SESSION_MAX_AGE,
};

export type SafeUser = Omit<User, "password">;

export const sanitizeUser = (user: User): SafeUser => {
  const { password: _password, ...safeUser } = user;
  return safeUser as SafeUser;
};

export const getDashboardPath = (role?: string | null) => {
  void role;
  return "/dashboard";
};
