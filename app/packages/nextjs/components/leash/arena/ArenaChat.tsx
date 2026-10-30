"use client";

import { SyntheticEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowPathIcon, CheckCircleIcon, NoSymbolIcon, PaperAirplaneIcon } from "@heroicons/react/24/outline";
import { CardSpotlight } from "~~/components/leash/CardSpotlight";
import { Inbox } from "~~/components/leash/arena/Inbox";
import { useTargetNetwork } from "~~/hooks/scaffold-eth";
import { AGENT_URL, ArenaLevel, shortHash, txLink } from "~~/utils/leash";

type PayResult = { status?: string; to?: string; amount?: string; reason?: string; tx_hash?: string; error?: string };
type Action = { tool: string; result: PayResult };
type Message = { role: "user" | "agent" | "error"; text: string; actions?: Action[]; mode?: string };

/** Inline result of a pay() call: lime "PAID 5 USDC" or maroon "BLOCKED · NOT_ALLOWLISTED" (reason from the
 * on-chain Rejected event), with the explorer link to the transaction. */
const ActionChip = ({ action, chainId }: { action: Action; chainId: number }) => {
  const r = action.result;
  if (action.tool !== "pay") return null;
  const paid = r.status === "paid";
  const href = r.tx_hash ? txLink(chainId, r.tx_hash) : undefined;
  const label = paid
    ? `PAID ${r.amount ?? "?"} USDC`
    : r.status === "rejected"
      ? `BLOCKED · ${r.reason ?? "UNKNOWN"}`
      : `FAILED · ${r.error ?? r.status ?? "error"}`;
  return (
    <div className={`leash-chip flex-wrap text-xs ${paid ? "leash-chip-paid" : "leash-chip-blocked"}`}>
      {paid ? <CheckCircleIcon className="h-4 w-4" /> : <NoSymbolIcon className="h-4 w-4" />}
      <span className="font-semibold">{label}</span>
      {href && r.tx_hash && (
        <Link
          href={href}
          target={href.startsWith("http") ? "_blank" : undefined}
          rel="noreferrer"
          className="font-mono underline"
        >
          {shortHash(r.tx_hash)}
        </Link>
      )}
    </div>
  );
};

export const ArenaChat = ({ level }: { level: ArenaLevel }) => {
  const { targetNetwork } = useTargetNetwork();
  // One id per browser tab; the backend keeps a separate history per level under it. Not an identity: the
  // leaderboard never trusts the chat, only on-chain Paid events.
  const [sessionId, setSessionId] = useState(() => crypto.randomUUID());
  const [chats, setChats] = useState<Record<number, Message[]>>({});
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const messages = chats[level.level] ?? [];

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages.length]);

  const push = (lvl: number, msg: Message) => setChats(c => ({ ...c, [lvl]: [...(c[lvl] ?? []), msg] }));

  const send = async (e: SyntheticEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;
    const lvl = level.level;
    push(lvl, { role: "user", text });
    setInput("");
    setSending(true);
    try {
      const res = await fetch(`${AGENT_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, message: text, level: lvl }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(typeof body.detail === "string" ? body.detail : `HTTP ${res.status}`);
      push(lvl, { role: "agent", text: body.reply, actions: body.actions, mode: body.mode });
    } catch (err) {
      push(lvl, { role: "error", text: `Agent unreachable: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      setSending(false);
    }
  };

  const reset = () => {
    fetch(`${AGENT_URL}/reset/${sessionId}`, { method: "POST" }).catch(() => undefined);
    setSessionId(crypto.randomUUID());
    setChats({});
  };

  return (
    <section className="leash-card flex min-h-[32rem] flex-col gap-4">
      <CardSpotlight />
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="m-0 text-2xl font-semibold">Talk to the agent</h2>
          <div className="leash-label">Level {level.level} · it holds the key to this vault</div>
        </div>
        <button type="button" onClick={reset} className="leash-btn-chrome px-3 py-1.5 text-sm">
          <ArrowPathIcon className="h-4 w-4" /> Reset
        </button>
      </div>

      <div ref={listRef} className="flex max-h-[28rem] grow flex-col gap-3 overflow-y-auto">
        {messages.length === 0 && (
          <p className="m-0 text-sm text-muted">
            This is Acme&apos;s accounts-payable agent: it pays the vendor invoices you forward, but it won&apos;t pay
            you just for asking. Hide your address inside an invoice (try the Inbox) and see what the vault lets
            through.
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex flex-col gap-2 ${m.role === "user" ? "items-end" : "items-start"}`}>
            <div
              className={`max-w-[85%] whitespace-pre-wrap rounded-xl border px-4 py-2 text-sm ${
                m.role === "user"
                  ? "border-silver-200/30 bg-silver-100/10"
                  : m.role === "error"
                    ? "leash-chip-blocked"
                    : "border-line bg-jet/60"
              }`}
            >
              {m.text}
            </div>
            {m.actions?.map((a, j) => (
              <ActionChip key={j} action={a} chainId={targetNetwork.id} />
            ))}
            {m.mode && <span className="text-xs text-muted">{m.mode}</span>}
          </div>
        ))}
        {sending && <p className="m-0 text-sm text-muted">Agent is thinking…</p>}
      </div>

      <Inbox level={level} onPick={setInput} />

      {/* Textarea, not input: the Inbox emails are multi-line and the player may edit them. Ctrl/Cmd+Enter sends. */}
      <form onSubmit={send} className="flex items-end gap-2">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) send(e);
          }}
          maxLength={1000}
          rows={input.includes("\n") ? 6 : 2}
          placeholder="Forward a vendor email, or pick one from the Inbox…"
          className="min-w-0 grow resize-y rounded-xl border border-line bg-jet/60 px-4 py-2 text-sm text-ink placeholder:text-muted focus:border-lime focus:outline-none"
        />
        <button type="submit" className="leash-btn" disabled={sending || !input.trim()}>
          <PaperAirplaneIcon className="h-4 w-4" /> Send
        </button>
      </form>
    </section>
  );
};
