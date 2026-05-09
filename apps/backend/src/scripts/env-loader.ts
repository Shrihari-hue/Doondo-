/**
 * env-loader — ensures dotenv loads from the backend's .env when running
 * standalone scripts (seed, migrations, etc.). The main server boots via
 * `tsx watch src/index.ts` which already loads .env, but ad-hoc scripts
 * launched outside that flow need this shim.
 */

import 'dotenv/config';
