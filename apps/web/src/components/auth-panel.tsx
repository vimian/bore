"use client";

import { useRouter } from "next/navigation";
import { useReducer, useTransition } from "react";
import {
  ArrowRight,
  KeyRound,
  LoaderCircle,
  Mail,
  UserRound,
} from "lucide-react";

import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

type AuthMode = "sign-in" | "sign-up";
type AuthState = {
  mode: AuthMode;
  name: string;
  email: string;
  password: string;
  error: string | null;
};

type AuthAction =
  | { type: "setMode"; value: AuthMode }
  | { type: "setName"; value: string }
  | { type: "setEmail"; value: string }
  | { type: "setPassword"; value: string }
  | { type: "setError"; value: string | null };

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case "setMode":
      return { ...state, mode: action.value, error: null };
    case "setName":
      return { ...state, name: action.value };
    case "setEmail":
      return { ...state, email: action.value };
    case "setPassword":
      return { ...state, password: action.value };
    case "setError":
      return { ...state, error: action.value };
    default:
      return state;
  }
}

function getErrorMessage(error: unknown): string {
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  return "Authentication failed. Check the details and try again.";
}

export function AuthPanel({
  context = "console",
}: {
  context?: "console" | "cli";
}) {
  const router = useRouter();
  const [state, dispatch] = useReducer(authReducer, {
    mode: "sign-in",
    name: "",
    email: "",
    password: "",
    error: null,
  });
  const [isPending, startTransition] = useTransition();
  const { mode, name, email, password, error } = state;

  const title =
    context === "cli"
      ? "Approve Bore CLI access"
      : "Sign in to Bore";
  const copy =
    context === "cli"
      ? "Use your Bore account to approve this terminal session."
      : "Use email and password auth backed by Bore's local SQLite store.";

  const submitLabel = mode === "sign-in" ? "Sign in" : "Create account";
  const pendingLabel =
    mode === "sign-in" ? "Signing in..." : "Creating account...";

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    dispatch({ type: "setError", value: null });

    startTransition(async () => {
      try {
        if (mode === "sign-up") {
          const result = await authClient.signUp.email({
            email,
            password,
            name: name.trim() || email,
          });

          if (result.error) {
            dispatch({
              type: "setError",
              value: result.error.message ?? "Unable to create account.",
            });
            return;
          }
        } else {
          const result = await authClient.signIn.email({
            email,
            password,
          });

          if (result.error) {
            dispatch({
              type: "setError",
              value: result.error.message ?? "Unable to sign in.",
            });
            return;
          }
        }

        router.refresh();
      } catch (nextError) {
        dispatch({ type: "setError", value: getErrorMessage(nextError) });
      }
    });
  };

  return (
    <section className="overflow-hidden rounded-[2rem] border border-zinc-800 bg-zinc-900/90 p-6 shadow-[0_30px_100px_-60px_rgba(0,0,0,0.95)] backdrop-blur sm:p-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-zinc-500">
            {context === "cli" ? "Browser approval" : "Account access"}
          </p>
          <h2 className="mt-3 font-[family-name:var(--font-display)] text-3xl text-white">
            {title}
          </h2>
          <p className="mt-2 text-sm leading-6 text-zinc-400">{copy}</p>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3 text-zinc-300">
          <KeyRound className="h-5 w-5" />
        </div>
      </div>

      <div className="mt-6 inline-flex rounded-full border border-zinc-800 bg-zinc-950/80 p-1 text-sm">
        <button
          type="button"
          onClick={() => dispatch({ type: "setMode", value: "sign-in" })}
          className={cn(
            "rounded-full px-4 py-2 transition",
            mode === "sign-in"
              ? "bg-white text-zinc-950"
              : "text-zinc-400 hover:text-white",
          )}
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => dispatch({ type: "setMode", value: "sign-up" })}
          className={cn(
            "rounded-full px-4 py-2 transition",
            mode === "sign-up"
              ? "bg-white text-zinc-950"
              : "text-zinc-400 hover:text-white",
          )}
        >
          Create account
        </button>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        {mode === "sign-up" ? (
          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-sm text-zinc-300">
              <UserRound className="h-4 w-4" />
              Name
            </span>
            <input
              value={name}
              onChange={(event) =>
                dispatch({ type: "setName", value: event.target.value })
              }
              placeholder="Jane Example"
              className="w-full rounded-[1.2rem] border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600"
            />
          </label>
        ) : null}

        <label className="block">
          <span className="mb-2 flex items-center gap-2 text-sm text-zinc-300">
            <Mail className="h-4 w-4" />
            Email
          </span>
          <input
            type="email"
            required
            value={email}
            onChange={(event) =>
              dispatch({ type: "setEmail", value: event.target.value })
            }
            placeholder="you@company.com"
            className="w-full rounded-[1.2rem] border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600"
          />
        </label>

        <label className="block">
          <span className="mb-2 flex items-center gap-2 text-sm text-zinc-300">
            <KeyRound className="h-4 w-4" />
            Password
          </span>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(event) =>
              dispatch({ type: "setPassword", value: event.target.value })
            }
            placeholder="At least 8 characters"
            className="w-full rounded-[1.2rem] border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600"
          />
        </label>

        {error ? (
          <p className="rounded-[1.2rem] border border-rose-900/50 bg-rose-950/40 px-4 py-3 text-sm text-rose-200">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isPending}
          className="inline-flex w-full items-center justify-center gap-3 rounded-full bg-white px-6 py-3 text-sm font-semibold text-zinc-950 hover:bg-zinc-200 disabled:cursor-not-allowed disabled:bg-zinc-300"
        >
          {isPending ? pendingLabel : submitLabel}
          {isPending ? (
            <LoaderCircle className="h-4 w-4 animate-spin" />
          ) : (
            <ArrowRight className="h-4 w-4" />
          )}
        </button>
      </form>
    </section>
  );
}
