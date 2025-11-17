import {Pool} from 'pg';
import {DB} from 'kysely-codegen';
import {Kysely, PostgresDialect} from 'kysely';

export const pool = new Pool({
  connectionString: process.env.DB_CONNECTION_STRING,
});

export const db = new Kysely<DB>({
  dialect: new PostgresDialect({
    pool: pool,
  }),
});