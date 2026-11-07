import { expect, test } from "@playwright/test";

async function login(page: import("@playwright/test").Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByText("Memuat data PostgreSQL...")).toBeHidden();
}

async function openTasks(page: import("@playwright/test").Page, isMobile: boolean) {
  if (isMobile) await page.getByRole("button", { name: "Buka navigasi" }).click();
  await page.getByRole("button", { name: "Tugas", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Tugas", exact: true })).toBeVisible();
}

test("Admin melihat kontrol tambah dan form tugas", async ({ page, isMobile }) => {
  await login(page, "admin@utero.local", "admin123");
  await openTasks(page, isMobile);
  const addButton = page.getByRole("button", { name: "Tambah Tugas" });
  await expect(addButton).toBeVisible();
  await addButton.click();
  await expect(page.getByRole("heading", { name: "Tambah tugas" })).toBeVisible();
  await expect(page.getByLabel("Judul")).toBeVisible();
  await expect(page.getByLabel("Tampilan tugas")).toBeVisible();
});

test("Staff tidak melihat kontrol manajemen tugas", async ({ page, isMobile }) => {
  await login(page, "staff@utero.local", "staff123");
  await openTasks(page, isMobile);
  await expect(page.getByRole("button", { name: "Tambah Tugas" })).toHaveCount(0);
  await expect(page.getByLabel("Tampilan tugas")).toHaveCount(0);
  await expect(page.getByText("Perbarui status dan progres tugas yang ditugaskan kepada Anda.")).toBeVisible();
});
