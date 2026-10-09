import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../src/db/schema";

if (!process.env.DATABASE_URL) {
  console.error("Falta DATABASE_URL en .env");
  process.exit(1);
}

export const db = drizzle(neon(process.env.DATABASE_URL), { schema });
