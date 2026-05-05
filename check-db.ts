import { createClient } from '@libsql/client';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const db = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!
  });
  
  for (const table of ['members', 'cycles', 'member_cycle_configs', 'sessions']) {
    const res = await db.execute(`PRAGMA table_info(${table});`);
    console.log(`--- ${table} ---`);
    console.log(res.rows);
  }
}
run();
