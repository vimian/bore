"use client";

import { useEffect, useState } from "react";
import type { UserUsage } from "@bore/database";

const format = (value: number) => value.toLocaleString("en-US");
export function UsagePanel({ initialUsage }: { initialUsage: UserUsage }) {
  const [usage, setUsage] = useState(initialUsage);
  const [month, setMonth] = useState(initialUsage.month);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    let running = false;
    const refresh = async () => {
      if (running || document.hidden) return;
      running = true;
      try {
        const response = await fetch(`/api/usage?month=${encodeURIComponent(month)}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Usage history is temporarily unavailable.");
        const data: UserUsage = await response.json();
        if (!controller.signal.aborted) { setUsage(data); setError(""); }
      } catch { if (!controller.signal.aborted) setError("Usage history is temporarily unavailable."); }
      finally { running = false; }
    };
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 30_000);
    return () => { clearInterval(timer); controller.abort(); };
  }, [month]);
  const maximum = Math.max(1, ...usage.daily.map((day) => day.httpRequests));
  const days = new Date(Date.UTC(Number(usage.month.slice(0, 4)), Number(usage.month.slice(5)), 0)).getUTCDate();
  const daily = new Map(usage.daily.map((d) => [Number(d.day.slice(8)), d.httpRequests]));
  return <section className="mt-8 rounded-[2rem] border border-zinc-800 bg-zinc-900/70 p-6 md:p-8" aria-labelledby="usage-title">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-xs uppercase tracking-[0.24em] text-blue-300">Traffic history</p>
        <h2 id="usage-title" className="mt-2 font-[family-name:var(--font-display)] text-3xl text-white">Volume, without limits.</h2>
        <p className="mt-2 text-sm text-zinc-400">UTC months. Internal probes excluded. Updates approximately every 30 seconds.</p></div>
      <label className="text-sm text-zinc-300">Month <input aria-label="Usage month" type="month" value={month}
        onChange={(event) => { if (event.target.value) setMonth(event.target.value); }}
        className="ml-2 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-white [color-scheme:dark]" /></label>
    </div>
    <p role="status" className="mt-3 text-sm text-amber-300">{error || (usage.month !== month ? "Loading selected month..." : "")}</p>
    <div className="mt-5 grid gap-3 sm:grid-cols-3">
      {[{ name: "HTTP(S) requests", monthly: usage.totals.month.httpRequests, lifetime: usage.totals.lifetime.httpRequests },
        { name: "WebSocket connections", monthly: usage.totals.month.websocketConnections, lifetime: usage.totals.lifetime.websocketConnections }].map((item) =>
        <div key={item.name} className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-5">
          <p className="text-sm text-zinc-400">{item.name}</p><p className="mt-3 text-3xl tabular-nums text-white">{format(item.monthly)}</p>
          <p className="mt-2 text-xs text-zinc-500">{format(item.lifetime)} lifetime</p></div>)}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-5"><p className="text-sm text-zinc-400">TCP / TLS endpoints</p>
        <p className="mt-3 text-lg text-zinc-300">Not supported</p><p className="mt-2 text-xs text-zinc-500">HTTPS is counted above, not as TCP.</p></div>
    </div>
    <figure className="mt-6"><figcaption className="mb-3 text-sm text-zinc-400">Daily HTTP(S) requests in {usage.month}</figcaption>
      <div className="flex h-28 items-end gap-1" role="img" aria-label={`Daily request chart for ${usage.month}, ${format(usage.totals.month.httpRequests)} requests total`}>
        {Array.from({ length: days }, (_, i) => <div key={i} className="flex-1 rounded-t bg-blue-400/70"
          title={`${usage.month}-${String(i + 1).padStart(2, "0")}: ${format(daily.get(i + 1) ?? 0)} requests`}
          style={{ height: `${Math.max(2, (daily.get(i + 1) ?? 0) / maximum * 100)}%` }} />)}</div>
      <div className="mt-2 flex justify-between text-xs text-zinc-500"><span>1</span><span>{days}</span></div>
    </figure>
    <div className="mt-6 overflow-x-auto"><table className="w-full text-left text-sm">
      <caption className="sr-only">Namespace totals include their child hosts. Retired hosts retain their history.</caption>
      <thead className="border-b border-zinc-800 text-xs text-zinc-500"><tr><th className="py-3">Namespace / host</th><th className="px-3">HTTP this month</th><th className="px-3">WS this month</th><th className="px-3">HTTP lifetime</th></tr></thead>
      <tbody>{usage.namespaces.map((namespace) => <NamespaceRows key={namespace.reservationId} namespace={namespace} />)}</tbody>
    </table>{!usage.namespaces.length && <p className="py-4 text-zinc-500">No traffic recorded yet.</p>}</div>
    <p className="mt-4 text-xs leading-6 text-zinc-500">Namespace totals include child hosts. Failed and aborted requests count; WebSocket upgrades count once as HTTP and successful connections separately.
      History begins {usage.trackingSince ? new Date(usage.trackingSince).toISOString().slice(0, 10) : "when tracking starts"}; the first month is partial. Retired hosts remain in history.</p>
  </section>;
}

function NamespaceRows({ namespace }: { namespace: UserUsage["namespaces"][number] }) {
  return <><tr className="border-b border-zinc-800/70 text-white"><th scope="row" className="py-4 font-medium">{namespace.namespace}</th>
    <td className="px-3 tabular-nums">{format(namespace.month.httpRequests)}</td><td className="px-3 tabular-nums">{format(namespace.month.websocketConnections)}</td><td className="px-3 tabular-nums">{format(namespace.lifetime.httpRequests)}</td></tr>
    {namespace.hosts.map((host) => <tr key={host.accessHostId ?? "root"} className="text-zinc-400"><th scope="row" className="py-2 pl-4 font-normal">{host.host}</th>
      <td className="px-3 tabular-nums">{format(host.month.httpRequests)}</td><td className="px-3 tabular-nums">{format(host.month.websocketConnections)}</td><td className="px-3 tabular-nums">{format(host.lifetime.httpRequests)}</td></tr>)}</>;
}
