import { expect, test, type Page } from "@playwright/test";

async function openSection(page: Page, name: string, isMobile: boolean) {
  if (isMobile) await page.getByRole("button", { name: "Buka navigasi" }).click();
  await page.getByRole("button", { name, exact: true }).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: /Admin Demo/ }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByText("Memuat data PostgreSQL...")).toBeHidden();
});

test("template desain mempertahankan workload, filter dan peringatan sumber", async ({ page, isMobile }) => {
  if (isMobile) await expect(page.getByRole("button", { name: "Buka navigasi" }).locator("svg")).toBeVisible();
  await openSection(page, "Proyek Desain", isMobile);
  await expect(page.getByRole("heading", { name: "Beban kerja per desainer" })).toBeVisible();
  await expect(page.getByText("Batas wajar: 5 proyek aktif per orang.")).toBeVisible();
  await expect(page.locator(".projects-table tbody tr")).toHaveCount(65);
  await expect(page.getByLabel("Filter program")).toBeVisible();
  await expect(page.getByLabel("Filter PIC")).toBeVisible();
  await page.getByLabel("Filter peringatan").selectOption("Cek data");
  await expect(page.locator(".projects-table tbody tr")).toHaveCount(8);
  await expect(page.getByText("Cek status/progres", { exact: true })).toHaveCount(8);
  await page.getByLabel("Filter peringatan").selectOption("Semua");
  await page.getByLabel("Filter program").selectOption("Brand Birth");
  await expect(page.locator(".projects-table tbody tr")).toHaveCount(20);
});

test("API operasional memuat program lintas bulan, bukan tab kosong", async ({ page }) => {
  const response = await page.request.get("/api/operations");
  expect(response.ok()).toBeTruthy();
  const payload = await response.json();
  expect(payload.periods).toHaveLength(3);
  expect(payload.kpis).toHaveLength(9);
  expect(payload.weeklyPlans).toHaveLength(13);
  expect(payload.dailyMilestones.filter((item: { day: number }) => item.day <= 14)).toHaveLength(14);
  expect(payload.gates).toHaveLength(5);
  for (const period of payload.periods) {
    const monthly = await page.request.get(`/api/operations?periodId=${period.id}`);
    expect(monthly.ok()).toBeTruthy();
    const data = await monthly.json();
    expect(data.kpis).toHaveLength(9);
    expect(data.weeklyPlans).toHaveLength(13);
    expect(data.dailyMilestones.filter((item: { day: number }) => item.day <= 14)).toHaveLength(14);
    expect(data.gates).toHaveLength(5);
  }
});

test("template operasional menampilkan program 3 Bulan dan semua tab", async ({ page, isMobile }) => {
  await openSection(page, "Operasional", isMobile);
  await expect(page.getByText(/2 Nov 2026.*31 Jan 2027/).first()).toBeVisible();
  await expect(page.getByLabel("Bulan KPI")).toHaveCount(1);
  await expect(page.locator('[data-testid="kpi-row"]')).toHaveCount(9);
  await page.getByRole("tab", { name: "Program 3 Bulan" }).click();
  await expect(page.locator('[data-testid="weekly-plan"]')).toHaveCount(13);
  await page.getByRole("tab", { name: "14 Hari Pertama" }).click();
  await expect(page.locator('[data-testid="daily-milestone"]')).toHaveCount(14);
  await page.getByRole("tab", { name: "Gate Kelulusan" }).click();
  await expect(page.locator('[data-testid="phase-gate"]')).toHaveCount(5);
  await page.getByRole("tab", { name: "Target KPI" }).click();
  const periods = await page.request.get("/api/operations").then((result) => result.json());
  for (const period of periods.periods) {
    await page.getByLabel("Bulan KPI").selectOption(period.id);
    await expect(page.locator('[data-testid="kpi-row"]')).toHaveCount(9);
  }
});

