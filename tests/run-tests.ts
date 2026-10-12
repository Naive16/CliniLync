/**
 * CLINILYNC Automated Test Runner
 */

import { seedDatabase } from '../database/seed.js';
import { runAuthTests } from './auth.test.js';
import { runRBACTests } from './rbac.test.js';
import { runOrganizationIsolationTests } from './organization-isolation.test.js';
import { runResourceAccessTests } from './resource-access.test.js';
import { runAuditLoggingTests } from './audit-logging.test.js';
import { runPhase5SecurityTests } from './phase5-security.test.js';
import { runPatientManagementTests } from './patient-management.test.js';
import { runPhase7SchedulingTests } from './phase7-scheduling.test.js';
import { runPhase8ClinicalTests } from './phase8-clinical.test.js';
import { runPhase9DiagnosesCarePlansTests } from './phase9-diagnoses-care-plans.test.js';
import { runPhase10MedicationTests } from './phase10-medications.test.js';
import { runSubscriptionTests } from './subscriptions.test.js';

async function main() {
  console.log('====================================================');
  console.log('CLINILYNC TEST SUITE - PHASE 5, 6, 7, 8, 9 & 10 COMPREHENSIVE VERIFICATION');
  console.log('Connecting Healthcare. Simplifying Care.');
  console.log('====================================================\n');

  // Seed DB first
  await seedDatabase();

  const allResults = [
    ...(await runAuthTests()),
    ...(await runRBACTests()),
    ...(await runOrganizationIsolationTests()),
    ...(await runResourceAccessTests()),
    ...(await runAuditLoggingTests()),
    ...(await runPhase5SecurityTests()),
    ...(await runPatientManagementTests()),
    ...(await runPhase7SchedulingTests()),
    ...(await runPhase8ClinicalTests()),
    ...(await runPhase9DiagnosesCarePlansTests()),
    ...(await runPhase10MedicationTests()),
    ...(await runSubscriptionTests())
  ];

  let passed = 0;
  let failed = 0;

  for (const r of allResults) {
    if (r.passed) {
      console.log(`  [PASS] ${r.name}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${r.name} - ${r.error}`);
      failed++;
    }
  }

  console.log('\n====================================================');
  console.log(`TEST SUMMARY: ${passed} Passed, ${failed} Failed (${allResults.length} Total)`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
