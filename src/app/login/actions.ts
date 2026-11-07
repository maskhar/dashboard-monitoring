"use server";

import { signIn } from "@/auth";

export async function credentialsLogin(formData: FormData) {
  if (process.env.AUTH_MODE === "production" || process.env.AUTH_DEMO_ENABLED === "false") throw new Error("Local login disabled");
  await signIn("credentials", {
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
    redirectTo: "/",
  });
}

export async function demoLogin() {
  if (process.env.AUTH_MODE === "production" || process.env.AUTH_DEMO_ENABLED === "false") throw new Error("Demo login disabled");
  await signIn("credentials", {
    email: process.env.DEMO_ADMIN_EMAIL ?? "admin@utero.local",
    password: process.env.DEMO_ADMIN_PASSWORD ?? "admin123",
    redirectTo: "/",
  });
}

export async function googleLogin() {
  await signIn("google", { redirectTo: "/" });
}
