import { closeDatabase, migrateDatabase } from "./db";

await migrateDatabase();

console.log("Database migrations applied.");
await closeDatabase();
