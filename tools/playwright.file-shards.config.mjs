import { devices } from '@playwright/test';
import base from '../playwright.config.mjs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const report = resolve(process.env.WEBKIT_SHARD_REPORT_DIR || 'release-results/all-features/shard-report');
export default {
  ...base, testDir: `${root}/tests`, workers: 1, retries: 0, forbidOnly: true,
  outputDir: `${report}/test-results`,
  webServer: {...base.webServer, cwd: root, reuseExistingServer: false},
  projects: [{name: 'webkit', use: {...devices['Desktop Safari']}}],
  reporter: [['line'], ['json', {outputFile: `${report}/raw.json`}], ['blob', {outputDir: `${report}/blob`, fileName: 'report.zip'}]]
};
