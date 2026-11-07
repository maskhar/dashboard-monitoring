if (process.env.AUTH_MODE === "production") {
  const failures = [];
  if (process.env.AUTH_DEMO_ENABLED !== "false") failures.push("disable demo authentication");
  if (!process.env.AUTH_GOOGLE_ID || !process.env.AUTH_GOOGLE_SECRET) failures.push("set Google OAuth credentials");
  if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32 || process.env.AUTH_SECRET === "replace-with-generated-secret") failures.push("set a strong AUTH_SECRET");
  try {
    const authUrl = new URL(process.env.NEXTAUTH_URL ?? "");
    if (authUrl.protocol !== "https:" || authUrl.username || authUrl.password || authUrl.search || authUrl.hash || authUrl.pathname !== "/") {
      failures.push("use an HTTPS origin for NEXTAUTH_URL");
    }
  } catch {
    failures.push("use an HTTPS origin for NEXTAUTH_URL");
  }
  if (!process.env.CLAMAV_HOST) failures.push("configure the malware scanner");
  if ((process.env.EMAIL_WEBHOOK_URL || process.env.WHATSAPP_WEBHOOK_URL) && !process.env.NOTIFICATION_WEBHOOK_TOKEN) {
    failures.push("set NOTIFICATION_WEBHOOK_TOKEN when notification webhooks are enabled");
  }
  if (failures.length) {
    console.error(`Unsafe production configuration: ${failures.join(", ")}`);
    process.exit(1);
  }
}
