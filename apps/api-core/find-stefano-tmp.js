const { Client } = require('pg');
require('dotenv').config();

async function main() {
  const client = new Client({
    host: '192.168.0.150',
    port: 5433,
    database: 'medtravelapp',
    user: process.env.DB_MIGRATION_USERNAME,
    password: process.env.DB_MIGRATION_PASSWORD,
    options: `-c app.encryption_key=${process.env.DB_ENCRYPTION_KEY}`,
  });
  await client.connect();

  for (const t of ['members', 'member_contacts', 'external_identifiers', 'identity_match_candidates']) {
    const cols = await client.query(
      `SELECT column_name, data_type FROM information_schema.columns
       WHERE table_schema='core' AND table_name=$1 ORDER BY ordinal_position`,
      [t]
    );
    console.log(`--- core.${t} ---`, cols.rows.map(r => `${r.column_name}(${r.data_type})`).join(', '));
  }

  const personId = '737faaf2-8317-4548-9a6c-b945b6fbe49e';
  const userId = '36817cb3-ca5a-43b7-9dd2-8b204e6257be';

  const counts = {};
  const tables = [
    ['ai', 'consumption_daily', 'person_id'],
    ['ai', 'conversations', 'person_id'],
    ['ai', 'messages', 'person_id'],
    ['ai', 'proposals', 'person_id'],
    ['clinical', 'allergies', 'person_id'],
    ['clinical', 'conditions', 'person_id'],
    ['clinical', 'document_ai_processing', 'person_id'],
    ['clinical', 'document_shares', 'person_id'],
    ['clinical', 'documents', 'person_id'],
    ['clinical', 'encounter_submissions', 'person_id'],
    ['clinical', 'encounters', 'person_id'],
    ['clinical', 'implants_devices', 'person_id'],
    ['clinical', 'lab_results', 'person_id'],
    ['clinical', 'medications', 'person_id'],
    ['clinical', 'record_review_tasks', 'person_id'],
    ['clinical', 'surgeries', 'person_id'],
    ['clinical', 'vaccines', 'person_id'],
    ['clinical', 'vitals_history', 'person_id'],
    ['core', 'external_identifiers', 'person_id'],
    ['core', 'identity_match_candidates', 'person_id'],
    ['core', 'member_contacts', 'person_id'],
    ['core', 'members', 'person_id'],
    ['coverage', 'health_coverages', 'person_id'],
    ['emergency', 'access_log', 'person_id'],
    ['emergency', 'share_note_drafts', 'person_id'],
    ['emergency', 'tokens', 'person_id'],
    ['core', 'security_sessions', 'user_id'],
  ];
  for (const [schema, table, col] of tables) {
    const id = col === 'user_id' ? userId : personId;
    const r = await client.query(`SELECT COUNT(*) FROM ${schema}.${table} WHERE ${col} = $1`, [id]);
    counts[`${schema}.${table}`] = r.rows[0].count;
  }
  console.log(JSON.stringify(counts, null, 2));

  const fks = await client.query(
    `SELECT tc.table_schema, tc.table_name, kcu.column_name, ccu.table_schema AS ref_schema, ccu.table_name AS ref_table
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
     JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
     WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'ai'`
  );
  console.log(JSON.stringify(fks.rows, null, 2));
  await client.end();
}
main().catch(e => { console.error(e); process.exit(1); });
