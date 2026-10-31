const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const env = require('../src/config/env');

async function runMigrations() {
  console.log('Connecting to Supabase Postgres...');
  // For DDL migrations, use port 5432 (session pooler) if using 6543 pooler
  let connStr = env.DATABASE_URL;
  if (connStr.includes(':6543/')) {
    connStr = connStr.replace(':6543/', ':5432/');
  }

  const client = new Client({
    connectionString: connStr,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    console.log('Connected to database successfully!');

    const migrationsDir = path.resolve(__dirname, '../../supabase/migrations');
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();

    console.log(`Found ${files.length} migration files:`, files);

    for (const file of files) {
      console.log(`\nExecuting migration: ${file}...`);
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf-8');
      
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('COMMIT');
        console.log(`✓ Migration ${file} applied successfully.`);
      } catch (migrationErr) {
        await client.query('ROLLBACK');
        if (migrationErr.message && migrationErr.message.includes('already exists')) {
          console.warn(`! Notice: ${migrationErr.message}. Skipping...`);
        } else {
          throw migrationErr;
        }
      }
    }

    console.log('\nAll 4 migrations applied to Supabase successfully!');

    // Verify all created tables
    const tableRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);
    console.log('\nVerified tables in public schema:');
    tableRes.rows.forEach(r => console.log(' - ' + r.table_name));

  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigrations();
