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
  await page.getByRole("button", { name, exact: true }).click();
}

test("Admin dapat membuka form proyek lengkap dan mengirim payload create", async ({ page, isMobile }) => {
  await login(page, "admin@utero.local", "admin123");
  await navigate(page, "Proyek Desain", isMobile);
  let payload: Record<string, unknown> | undefined;
  await page.route("**/api/projects", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    payload = route.request().postDataJSON();
    await route.fulfill({ status: 201, contentType: "application/json", body: "{}" });
  });
  await page.getByRole("button", { name: "Tambah Proyek/Desain" }).click();
  await page.getByLabel("Kode").fill("DP-999");
  await page.getByLabel("Brand").fill("Brand Uji");
  await page.getByRole("textbox", { name: "Program", exact: true }).fill("Program Uji");
  await page.getByLabel("Kategori").fill("Digital");
  await page.getByLabel("Mulai").fill("2026-11-01");
  await page.getByRole("textbox", { name: "Deadline", exact: true }).fill("2026-11-30");
  await page.getByRole("textbox", { name: "Catatan", exact: true }).fill("Catatan uji");
  await page.getByRole("button", { name: "Tambah proyek", exact: true }).click();
  await expect.poll(() => payload).toMatchObject({ code: "DP-999", brand: "Brand Uji", program: "Program Uji", category: "Digital", startDate: "2026-11-01", dueDate: "2026-11-30", notes: "Catatan uji" });
});

test("Admin melihat management operasional sesuai tab dan staff tidak", async ({ page, isMobile }) => {
  await login(page, "admin@utero.local", "admin123");
  await navigate(page, "Operasional", isMobile);
  await page.getByRole("tab", { name: "Program 3 Bulan" }).click();
  await page.getByRole("button", { name: "Tambah", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Tambah Program 3 Bulan" })).toBeVisible();
  await expect(page.getByRole("spinbutton", { name: "Minggu", exact: true })).toBeVisible();
  await expect(page.getByLabel("Fokus")).toBeVisible();
  await expect(page.getByLabel("Deliverable")).toBeVisible();
  await expect(page.getByRole("button", { name: "Arsip", exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Hapus", exact: true }).first()).toBeVisible();

  await page.context().clearCookies();
  await login(page, "staff@utero.local", "staff123");
  await navigate(page, "Operasional", isMobile);
  await expect(page.getByRole("button", { name: "Tambah", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Arsip", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Hapus", exact: true })).toHaveCount(0);
});


