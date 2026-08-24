import pg from "pg";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: "postgres://marker:localdev@localhost:5432/marker",
});
