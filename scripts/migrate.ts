import { MigrationEngine } from '../database/migrator.js';

const executed = await new MigrationEngine().runPendingMigrations();
console.log(`[CLINILYNC] Migration command complete. Applied ${executed.length} migration(s).`);
