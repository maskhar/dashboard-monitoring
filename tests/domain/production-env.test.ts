import { describe, expect, it } from "vitest";
import { validateProductionEnvironment } from "../../src/lib/server/env";
const secure = { AUTH_MODE: "production", AUTH_DEMO_ENABLED: "false", AUTH_GOOGLE_ID: "google-id", AUTH_GOOGLE_SECRET: "google-secret", AUTH_SECRET: "x".repeat(40), NEXTAUTH_URL: "https://dash-monitor.carubra.com", CLAMAV_HOST: "clamav" };
describe("production startup gate", () => {
  it("rejects default production settings without credentials", () => expect(() => validateProductionEnvironment({ AUTH_MODE: "production" })).toThrow("Unsafe production configuration"));
  it("rejects demo auth", () => expect(() => validateProductionEnvironment({ ...secure, AUTH_DEMO_ENABLED: "true" })).toThrow("disable demo authentication"));
  it("rejects HTTP callback", () => expect(() => validateProductionEnvironment({ ...secure, NEXTAUTH_URL: "http://localhost:3010" })).toThrow("HTTPS"));
  it("rejects callback paths and query strings", () => {
    expect(() => validateProductionEnvironment({ ...secure, NEXTAUTH_URL: "https://dash-monitor.carubra.com/login" })).toThrow("HTTPS origin");
    expect(() => validateProductionEnvironment({ ...secure, NEXTAUTH_URL: "https://dash-monitor.carubra.com?preview=1" })).toThrow("HTTPS origin");
  });
  it("requires a signing token when external notification webhooks are enabled", () => expect(() => validateProductionEnvironment({ ...secure, EMAIL_WEBHOOK_URL: "https://notify.example.test/email" })).toThrow("NOTIFICATION_WEBHOOK_TOKEN"));
  it("allows signed notification webhooks", () => expect(() => validateProductionEnvironment({ ...secure, EMAIL_WEBHOOK_URL: "https://notify.example.test/email", NOTIFICATION_WEBHOOK_TOKEN: "x".repeat(32) })).not.toThrow());
  it("allows complete production settings", () => expect(() => validateProductionEnvironment(secure)).not.toThrow());
});
