import { db, migrateDatabase } from "./db";

await migrateDatabase();

console.log("Database migrations applied.");
await db.$client.close();
