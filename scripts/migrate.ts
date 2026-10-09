// Se corre antes de cada build (también en Vercel): crea o actualiza las tablas
// y carga los supermercados iniciales. Es seguro correrlo muchas veces.
import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";
import * as schema from "../src/db/schema";

const initialStores = [
  { slug: "coto", name: "Coto" },
  { slug: "el-abastecedor", name: "El Abastecedor" },
];

async function main() {
  if (!process.env.DATABASE_URL) {
    if (process.env.VERCEL) {
      console.error("Falta DATABASE_URL: conectá la base de Neon al proyecto en Vercel.");
      process.exit(1);
    }
    console.warn("Sin DATABASE_URL: no se aplican migraciones.");
    return;
  }

  const db = drizzle(neon(process.env.DATABASE_URL), { schema });
  await migrate(db, { migrationsFolder: "drizzle" });
  await db.insert(schema.stores).values(initialStores).onConflictDoNothing();
  console.log("Base de datos al día.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
