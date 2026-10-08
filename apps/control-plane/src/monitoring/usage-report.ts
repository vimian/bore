import { closeDatabase, ensureSchema, getUserUsage, getUserByEmail, listUsers, usageMonth } from "@bore/database";

try {
  await ensureSchema();
  const email = process.argv[2];
  const month = usageMonth(process.argv[3]);
  const users = email ? [await getUserByEmail(email)].filter((user) => user !== null) : await listUsers();
  if (email && !users.length) throw new Error("User not found");
  const results = [];
  for (const user of users) results.push({ email: user.email, userId: user.id, ...await getUserUsage(user.id, month) });
  console.log(JSON.stringify(results, null, 2));
} finally { await closeDatabase(); }
