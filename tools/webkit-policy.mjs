// Keep the established WebKit API while sharing its strict policy with Chromium.
import { inspectBrowserReport, enforceBrowserPolicy } from './browser-report-policy.mjs';
export { browserSpecs as webkitSpecs, specKey } from './browser-report-policy.mjs';
export const inspectWebKitReport = (report, catalog = report) => inspectBrowserReport(report, catalog, 'webkit');
export const enforceWebKitPolicy = (reportPath, catalogPath, summaryPath) => enforceBrowserPolicy(reportPath, catalogPath, summaryPath, 'webkit');
