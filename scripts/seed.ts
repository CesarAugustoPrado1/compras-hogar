import { db } from "./db";
import { stores } from "../src/db/schema";

async function main() {
  const initialStores = [
    { slug: "coto", name: "Coto" },
    { slug: "el-abastecedor", name: "El Abastecedor" },
  ];

  await db.insert(stores).values(initialStores).onConflictDoNothing();
  console.log(`Supermercados cargados: ${initialStores.map((s) => s.name).join(", ")}`);
}

main();
