// migrate.js
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './src/db/schema.js'; // путь к твоим схемам

const sql = postgres(process.env.DATABASE_URL);
const db = drizzle(sql, { schema });

await db.run(sql`CREATE EXTENSION IF NOT EXISTS vector`);
await db.push(schema); // Drizzle push
await sql.end();
