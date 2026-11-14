import "server-only";

import { betterAuth } from "better-auth";
import { username } from "better-auth/plugins";

import { getDatabase } from "./server/db";

const defaultTrustedOrigins = [
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3001",
  "http://192.168.*.*:8080",
  "http://10.*.*.*:8080",
  "http://172.16.*.*:8080",
  "http://172.17.*.*:8080",
  "http://172.18.*.*:8080",
  "http://172.19.*.*:8080",
  "http://172.2*.*.*:8080",
  "http://172.30.*.*:8080",
  "http://172.31.*.*:8080",
];

const trustedOrigins = [
  ...defaultTrustedOrigins,
  ...(process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
];

export const auth = betterAuth({
  database: getDatabase(),
  ...(process.env.BETTER_AUTH_URL ? { baseURL: process.env.BETTER_AUTH_URL } : {}),
  secret:
    process.env.BETTER_AUTH_SECRET ??
    "desenvolvimento-apenas-troque-esta-chave-antes-de-expor",
  trustedOrigins,
  emailAndPassword: {
    enabled: true,
    // Appliance with a single operator: there is no public sign-up. The admin
    // account is inserted by ensureInitialAdmin() on first boot.
    disableSignUp: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    autoSignIn: true,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    // No cookie cache: the mustChangePassword flag is checked on every request
    // and must take effect immediately after the password is changed.
  },
  user: {
    additionalFields: {
      mustChangePassword: {
        type: "boolean",
        required: false,
        defaultValue: true,
        input: false,
      },
    },
  },
  plugins: [
    username({
      minUsernameLength: 3,
      maxUsernameLength: 32,
    }),
  ],
  rateLimit: {
    enabled: true,
    window: 60,
    max: 20,
  },
  advanced: {
    cookiePrefix: "zima-hotspot",
    useSecureCookies:
      process.env.NODE_ENV === "production" &&
      process.env.BETTER_AUTH_SECURE === "true",
    defaultCookieAttributes: {
      sameSite: "lax",
      httpOnly: true,
    },
  },
});

export type AuthSession = typeof auth.$Infer.Session;
