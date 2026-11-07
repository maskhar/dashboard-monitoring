import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

async function main() {
  const baseURL = process.env.RESTORE_BASE_URL;
  const evidenceId = process.env.RESTORE_EVIDENCE_ID;
  const checksum = process.env.RESTORE_EVIDENCE_SHA256;
  if (!baseURL || !evidenceId || !checksum) throw new Error('Restore smoke environment missing');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(`${baseURL}/login`);
    await page.getByRole('button', { name: /Admin Demo/ }).click();
    await page.waitForURL(baseURL + '/', { timeout: 20000 });
    const result = await page.evaluate(async (id) => {
      const [overview, evidence] = await Promise.all([fetch('/api/overview'), fetch(`/api/evidence/${id}`)]);
      const payload = await overview.json();
      return { overviewStatus: overview.status, projects: payload.projects?.total, evidenceStatus: evidence.status, bytes: [...new Uint8Array(await evidence.arrayBuffer())] };
    }, evidenceId);
    assert.equal(result.overviewStatus, 200);
    assert.equal(result.projects, 65);
    assert.equal(result.evidenceStatus, 200);
    assert.equal(createHash('sha256').update(Buffer.from(result.bytes)).digest('hex'), checksum);
    console.log(`Isolated application restore verified: projects=${result.projects}, evidence_sha256=match, bytes=${result.bytes.length}`);
  } finally {
    await browser.close();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
