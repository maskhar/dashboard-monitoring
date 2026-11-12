import { expect, test } from "@playwright/test";

async function login(page: import("@playwright/test").Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByText("Memuat data PostgreSQL...")).toBeHidden();
}

async function navigate(page: import("@playwright/test").Page, name: string, isMobile: boolean) {
  if (isMobile) await page.getByRole("button", { name: "Buka navigasi" }).click();
  await page.getByRole("button", { name }).click();
}

test("Admin melihat data template dan menu kontrol", async ({ page, isMobile }) => {
  await login(page, "admin@utero.local", "admin123");
  await navigate(page, "Proyek Desain", isMobile);
  const projects = await page.request.get("/api/projects?limit=100").then((response) => response.json()) as { data: unknown[] };
  await expect(page.getByText(`${projects.data.length} proyek`, { exact: true })).toBeVisible();
  await navigate(page, "Operasional", isMobile);
  await expect(page.getByRole("tab", { name: "Program 3 Bulan" })).toBeVisible();
  await navigate(page, "Migrasi Legacy", isMobile);
  await expect(page.getByRole("heading", { name: "Importer ruang proyek legacy" })).toBeVisible();
  await page.getByLabel("Pilih berkas JSON legacy").setInputFiles({
    name: "legacy-e2e.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ "legacy-e2e": { nama: "Proyek Legacy E2E" } })),
  });
  await page.getByRole("button", { name: "Preview di server" }).click();
  await expect(page.getByText("Mapping proyek")).toBeVisible();
  await expect(page.getByLabel("Kode proyek baru Proyek Legacy E2E")).toBeVisible();
  await navigate(page, "Pengguna", isMobile);
  await expect(page.getByRole("heading", { name: "Pengguna dan role" })).toBeVisible();
  await navigate(page, "Riwayat", isMobile);
  await expect(page.getByRole("heading", { name: "Riwayat perubahan" })).toBeVisible();
});

test("Staff hanya melihat menu dan data scoped", async ({ page, isMobile }) => {
  await login(page, "staff@utero.local", "staff123");
  if (isMobile) await page.getByRole("button", { name: "Buka navigasi" }).click();
  await expect(page.getByRole("button", { name: "Pengajuan Saya" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Pengguna" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Migrasi Legacy" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Riwayat" })).toHaveCount(0);
  await expect(page.getByText("Dalam assignment Anda")).toBeVisible();
});

