const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const dir = path.join(
  __dirname,
  "..",
  "backend",
  "prisma",
  "migrations",
  "20260313100000_phase4_6",
);
fs.mkdirSync(dir, { recursive: true });

const sql = execSync(
  `npx prisma migrate diff --from-url "${process.env.DATABASE_URL}" --to-schema-datamodel prisma/schema.prisma --script`,
  {
    cwd: path.join(__dirname, "..", "backend"),
    encoding: "utf8",
  },
);

fs.writeFileSync(path.join(dir, "migration.sql"), sql, { encoding: "utf8" });
console.log("Wrote migration.sql, bytes:", sql.length);
