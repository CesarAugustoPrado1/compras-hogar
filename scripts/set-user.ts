// Crea un usuario o le cambia el PIN.
// Uso: npm run user:set -- <nombre> <pin>
import bcrypt from "bcryptjs";
import { db } from "./db";
import { users } from "../src/db/schema";

async function main() {
  const [name, pin] = process.argv.slice(2);

  if (!name || !pin || !/^\d{4,8}$/.test(pin)) {
    console.error("Uso: npm run user:set -- <nombre> <pin de 4 a 8 dígitos>");
    process.exit(1);
  }

  const pinHash = await bcrypt.hash(pin, 10);
  await db
    .insert(users)
    .values({ name, pinHash })
    .onConflictDoUpdate({
      target: users.name,
      set: { pinHash, failedAttempts: 0, lockedUntil: null },
    });
  console.log(`Usuario "${name}" listo.`);
}

main();
