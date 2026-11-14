import { getAuthTables } from "better-auth/db";
import { betterAuth } from "better-auth";
import { username } from "better-auth/plugins";

const auth = betterAuth({
  database: ":memory:",
  secret: "x".repeat(32),
  emailAndPassword: { enabled: true },
  plugins: [username()],
  user: {
    additionalFields: {
      mustChangePassword: {
        type: "boolean",
        required: false,
        defaultValue: true,
        input: false,
      },
    },
  },
});
const tables = getAuthTables(auth.options);
for (const [name, table] of Object.entries(tables)) {
  console.log("TABLE", name);
  for (const [field, def] of Object.entries(table.fields)) {
    console.log(" ", field, JSON.stringify(def));
  }
  console.log("  order", table.order);
}
const user = tables.user;
console.log("MODEL ORDER", Object.entries(tables).map(([k, v]) => [k, v.order]));
