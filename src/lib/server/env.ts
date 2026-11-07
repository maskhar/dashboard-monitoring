export function validateProductionEnvironment(env: Record<string, string | undefined> = process.env) {
  if (env.AUTH_MODE !== "production") return;

  const failures: string[] = [];
  if (env.AUTH_DEMO_ENABLED !== "false") failures.push("disable demo authentication");
  if (!env.AUTH_GOOGLE_ID || !env.AUTH_GOOGLE_SECRET) failures.push("set Google OAuth credentials");
  if (!env.AUTH_SECRET || env.AUTH_SECRET.length < 32 || env.AUTH_SECRET === "replace-with-generated-secret") failures.push("set a strong AUTH_SECRET");
  try {
    const authUrl = new URL(env.NEXTAUTH_URL ?? "");
    if (authUrl.protocol !== "https:" || authUrl.username || authUrl.password || authUrl.search || authUrl.hash || authUrl.pathname !== "/") {
      failures.push("use an HTTPS origin for NEXTAUTH_URL");
    }
  } catch {
    failures.push("use an HTTPS origin for NEXTAUTH_URL");
  }
  if (!env.CLAMAV_HOST) failures.push("configure the malware scanner");
  if ((env.EMAIL_WEBHOOK_URL || env.WHATSAPP_WEBHOOK_URL) && !env.NOTIFICATION_WEBHOOK_TOKEN) {
    failures.push("set NOTIFICATION_WEBHOOK_TOKEN when notification webhooks are enabled");
  }
  if (failures.length) throw new Error(`Unsafe production configuration: ${failures.join(", ")}`);
}
