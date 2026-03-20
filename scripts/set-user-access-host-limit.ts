import { setUserAccessHostLimitByEmail } from "../apps/control-plane/src/bore-db.js";

function parseArgs(argv: string[]) {
  const [emailArg, limitArg] = argv;

  if (!emailArg || !limitArg) {
    throw new Error("Usage: pnpm user:set-access-host-limit <email> <max_limit>");
  }

  const limit = Number.parseInt(limitArg, 10);

  if (!Number.isInteger(limit) || limit < 0) {
    throw new Error("max_limit must be a non-negative integer");
  }

  return {
    email: emailArg,
    limit,
  };
}

try {
  const { email, limit } = parseArgs(process.argv.slice(2));
  const user = setUserAccessHostLimitByEmail(email, limit);

  if (!user) {
    console.error(`No user found for ${email}.`);
    process.exitCode = 1;
  } else {
    console.log(
      `Updated ${user.email} (${user.id}) child hostname limit to ${user.accessHostLimit}.`,
    );
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "Unable to update user limit.");
  process.exitCode = 1;
}
