import { expect, test, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: /Admin Demo/ }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByText("Memuat data PostgreSQL...")).toBeHidden();
}

async function navigate(page: Page, name: string, isMobile: boolean) {
  if (isMobile) await page.getByRole("button", { name: "Buka navigasi" }).click();
  await page.getByRole("button", { name, exact: true }).click();
}

test("fitur production proyek, jadwal, filter dan notifikasi tersedia", async ({ page, isMobile }) => {
  await login(page);
  await page.getByRole("button", { name: /^Notifikasi/ }).click();
  await expect(page.getByLabel("Pusat notifikasi")).toBeVisible();
  await page.keyboard.press("Escape");

  await navigate(page, "Proyek Desain", isMobile);
  await page.getByRole("button", { name: "Detail", exact: true }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByLabel("Komentar proyek")).toBeVisible();
  await page.getByLabel("Tutup detail proyek").click();
  await page.getByLabel("Pilih semua proyek terlihat").check();
  await expect(page.getByRole("combobox", { name: "Aksi bulk proyek" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Terapkan" })).toBeEnabled();
  await page.getByLabel("Pilih semua proyek terlihat").uncheck();

  await navigate(page, "Operasional", isMobile);
  await expect(page.getByRole("heading", { name: "Kalender & Gantt" })).toBeVisible();
  await page.getByRole("button", { name: "Gantt", exact: true }).click();
  await expect(page.getByRole("button", { name: "Gantt", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Simpan filter" }).click();
  await page.getByLabel("Nama filter").fill("Filter smoke");
  await page.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(page.getByLabel("Filter tersimpan").getByRole("button", { name: "Filter smoke", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Memuat data PostgreSQL...")).toBeHidden();
  await navigate(page, "Operasional", isMobile);
  await expect(page.getByLabel("Filter tersimpan").getByRole("button", { name: "Filter smoke", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Hapus filter Filter smoke" }).click();
  await expect(page.getByRole("button", { name: "Filter smoke", exact: true })).toHaveCount(0);
});
