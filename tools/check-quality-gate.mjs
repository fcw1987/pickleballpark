const REQUIRED_JOBS = Object.freeze(['checks', 'chromium', 'webkit', 'package', 'rally-calibration']);

export function qualityGateFailures(needs) {
  if (!needs || typeof needs !== 'object' || Array.isArray(needs)) {
    return REQUIRED_JOBS.map((job) => `${job}: missing`);
  }

  return REQUIRED_JOBS.flatMap((job) => {
    const result = needs[job]?.result;
    return result === 'success' ? [] : [`${job}: ${result ?? 'missing'}`];
  });
}

export function assertQualityGate(needs) {
  const failures = qualityGateFailures(needs);
  if (failures.length) {
    throw new Error(`Quality gate rejected: ${failures.join(', ')}`);
  }
}

function runCli() {
  let needs;
  try {
    needs = JSON.parse(process.env.QUALITY_NEEDS_JSON ?? '');
  } catch {
    throw new Error('QUALITY_NEEDS_JSON must be valid JSON');
  }
  assertQualityGate(needs);
  console.log('Quality gate passed: checks, Chromium, WebKit, package, and rally physical regression succeeded.');
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  try {
    runCli();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
