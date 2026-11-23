"use client";

import { useEffect, useState } from "react";
import { WebhookDelivery, WebhookSubscription } from "../types";
import {
  createWebhook,
  deleteWebhook,
  fetchDeliveries,
  fetchWebhooks,
  replayDelivery,
} from "../lib/api";

interface WebhooksPanelProps {
  onRefreshOverview?: () => void;
}

export default function WebhooksPanel({ onRefreshOverview }: WebhooksPanelProps) {
  const [subscriptions, setSubscriptions] = useState<WebhookSubscription[]>([]);
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);
  const [loading, setLoading] = useState(false);

  // Form State
  const [url, setUrl] = useState("");
  const [selectedEvent, setSelectedEvent] = useState("sep24.transaction.updated");
  const [customSecret, setCustomSecret] = useState("");
  const [registering, setRegistering] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // One-time secret display banner
  const [newlyCreatedSecret, setNewlyCreatedSecret] = useState<{
    id: string;
    secret: string;
  } | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);

  // Replay state
  const [replayingId, setReplayingId] = useState<string | null>(null);
  const [expandedDeliveryId, setExpandedDeliveryId] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const [subsRes, delsRes] = await Promise.all([
        fetchWebhooks(),
        fetchDeliveries(50),
      ]);
      setSubscriptions(subsRes.subscriptions || []);
      setDeliveries(delsRes.deliveries || []);
    } catch {
      // ignore network errors if engine offline
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      setFormError("Webhook URL must start with http:// or https://");
      return;
    }

    setRegistering(true);
    setFormError(null);
    try {
      const res = await createWebhook({
        url: url.trim(),
        secret: customSecret.trim() ? customSecret.trim() : undefined,
        events: [selectedEvent],
        enabled: true,
      });

      if (res.secret) {
        setNewlyCreatedSecret({ id: res.id, secret: res.secret });
      }

      setUrl("");
      setCustomSecret("");
      setActionFeedback("Webhook endpoint registered successfully.");
      await loadData();
      onRefreshOverview?.();
      setTimeout(() => setActionFeedback(null), 3000);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setRegistering(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteWebhook(id);
      setSubscriptions((prev) => prev.filter((s) => s.id !== id));
      setActionFeedback("Webhook subscription removed.");
      onRefreshOverview?.();
      setTimeout(() => setActionFeedback(null), 3000);
    } catch (err: unknown) {
      setActionFeedback(`Delete failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleReplay = async (id: string) => {
    setReplayingId(id);
    try {
      const updated = await replayDelivery(id);
      setDeliveries((prev) =>
        prev.map((d) => (d.id === id ? updated : d))
      );
      setActionFeedback(`Delivery ${id.slice(0, 8)} replayed successfully.`);
      onRefreshOverview?.();
      setTimeout(() => setActionFeedback(null), 3000);
    } catch (err: unknown) {
      setActionFeedback(`Replay failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setReplayingId(null);
    }
  };

  const handleCopySecret = () => {
    if (!newlyCreatedSecret) return;
    navigator.clipboard.writeText(newlyCreatedSecret.secret);
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 2000);
  };

  return (
    <div className="bg-[#0E1524] border border-slate-800 rounded p-4 flex flex-col gap-4 font-mono">
      {/* Panel Header */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-purple-400 animate-pulse" />
          <h2 className="text-sm font-bold tracking-tight text-white uppercase">
            Webhooks & Replay Workbench
          </h2>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-[10px] text-slate-400 bg-slate-900 border border-slate-800 px-2 py-0.5 rounded">
            {subscriptions.length} subs | {deliveries.length} deliveries
          </span>
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] border border-slate-700"
          >
            REFRESH
          </button>
        </div>
      </div>

      {/* One-Time Secret Alert Banner */}
      {newlyCreatedSecret && (
        <div className="bg-amber-950/40 border border-amber-500/50 rounded p-3 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 animate-fadeIn">
          <div className="space-y-1">
            <div className="flex items-center gap-2 font-bold text-amber-300 text-xs">
              <span>SECURITY NOTICE: SIGNING SECRET GENERATED</span>
              <span className="text-[10px] bg-amber-500/20 px-1.5 py-0.5 rounded text-amber-200">
                ONE-TIME DISPLAY
              </span>
            </div>
            <p className="text-[11px] text-amber-200/90 font-mono">
              Store this secret now. The engine stores HMAC signatures and will never display this raw secret again:
            </p>
            <div className="bg-black/60 px-2 py-1 rounded border border-amber-500/30 font-bold text-amber-100 text-[11px] break-all select-all">
              {newlyCreatedSecret.secret}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleCopySecret}
              className="px-3 py-1.5 rounded bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs transition-colors"
            >
              {copiedSecret ? "COPIED!" : "COPY SECRET"}
            </button>
            <button
              type="button"
              onClick={() => setNewlyCreatedSecret(null)}
              className="px-2 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs"
            >
              DISMISS
            </button>
          </div>
        </div>
      )}

      {/* Feedback Toast */}
      {actionFeedback && (
        <div className="text-[11px] px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-cyan-300">
          {actionFeedback}
        </div>
      )}

      {/* Register Subscription Form */}
      <form
        onSubmit={handleRegister}
        className="bg-[#090D16] border border-slate-800/80 rounded p-3 text-xs space-y-3"
      >
        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
          Register Webhook Listener (Target URL)
        </span>
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
          <div className="sm:col-span-6">
            <input
              type="text"
              required
              placeholder="http://localhost:9000/webhook or https://..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full bg-[#0E1524] border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-cyan-500"
            />
          </div>
          <div className="sm:col-span-3">
            <select
              value={selectedEvent}
              onChange={(e) => setSelectedEvent(e.target.value)}
              className="w-full bg-[#0E1524] border border-slate-800 rounded px-2 py-1.5 text-slate-200 focus:outline-none focus:border-cyan-500"
            >
              <option value="sep24.transaction.updated">
                sep24.transaction.updated
              </option>
              <option value="*">* (All Events)</option>
            </select>
          </div>
          <div className="sm:col-span-3">
            <button
              type="submit"
              disabled={registering}
              className="w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold py-1.5 px-3 rounded text-xs transition-colors"
            >
              {registering ? "REGISTERING..." : "+ SUBSCRIBE"}
            </button>
          </div>
        </div>
        {formError && (
          <p className="text-[11px] text-rose-400">{formError}</p>
        )}
      </form>

      {/* Grid: Subscriptions (left) & Deliveries (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Active Subscriptions List */}
        <div className="lg:col-span-5 flex flex-col gap-2">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
            Active Subscriptions ({subscriptions.length})
          </span>
          <div className="border border-slate-800 rounded bg-[#090D16] divide-y divide-slate-800/80 max-h-72 overflow-y-auto text-xs">
            {subscriptions.length === 0 ? (
              <div className="p-4 text-center text-slate-400 text-xs">
                No active webhook subscriptions.
              </div>
            ) : (
              subscriptions.map((sub) => (
                <div
                  key={sub.id}
                  className="p-2.5 flex items-center justify-between gap-2 hover:bg-slate-800/30 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      <span className="font-semibold text-slate-200 truncate text-[11px]">
                        {sub.url}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-1">
                      <span>EVT: {sub.events.join(", ")}</span>
                      <span>•</span>
                      <span>SEC: {sub.secret_preview || "configured"}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(sub.id)}
                    className="text-rose-400 hover:text-rose-300 text-[10px] px-2 py-1 rounded bg-rose-950/30 border border-rose-800/40 hover:bg-rose-900/40"
                  >
                    DEL
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Webhook Deliveries List */}
        <div className="lg:col-span-7 flex flex-col gap-2">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
            Recent Deliveries & Replay Log ({deliveries.length})
          </span>
          <div className="border border-slate-800 rounded bg-[#090D16] divide-y divide-slate-800/80 max-h-72 overflow-y-auto text-xs">
            {deliveries.length === 0 ? (
              <div className="p-4 text-center text-slate-400 text-xs">
                No webhook deliveries logged yet. Complete a SEP-24 transaction to trigger events.
              </div>
            ) : (
              deliveries.map((del) => {
                const isDelivered = del.status === "delivered";
                const isExpanded = expandedDeliveryId === del.id;
                return (
                  <div
                    key={del.id}
                    className="p-2.5 flex flex-col gap-1.5 hover:bg-slate-800/20 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                            isDelivered
                              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                              : "bg-rose-500/10 border-rose-500/30 text-rose-400"
                          }`}
                        >
                          {del.status.toUpperCase()}{" "}
                          {del.http_status ? `(${del.http_status})` : ""}
                        </span>
                        <span className="text-slate-300 font-medium text-[11px] truncate max-w-[140px] sm:max-w-[200px]">
                          {del.event_type}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedDeliveryId(isExpanded ? null : del.id)
                          }
                          className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] border border-slate-700"
                        >
                          {isExpanded ? "HIDE" : "INSPECT"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReplay(del.id)}
                          disabled={replayingId === del.id}
                          className="px-2 py-0.5 rounded bg-cyan-950/40 hover:bg-cyan-900/50 text-cyan-300 text-[10px] font-bold border border-cyan-800/50 transition-colors"
                        >
                          {replayingId === del.id ? "REPLAYING..." : "REPLAY"}
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-400">
                      <span>TX: {del.transaction_id.slice(0, 8)}...</span>
                      <span>ATTEMPTS: {del.attempts}</span>
                      <span>{new Date(del.created_at).toLocaleTimeString()}</span>
                    </div>

                    {/* Expandable Payload & Response Preview */}
                    {isExpanded && (
                      <div className="mt-2 p-2 bg-[#0C121E] border border-slate-800 rounded text-[10px] space-y-2">
                        <div>
                          <span className="text-slate-400 font-semibold block mb-0.5">
                            SIGNATURE:
                          </span>
                          <span className="text-slate-300 break-all select-all">
                            {del.signature}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 font-semibold block mb-0.5">
                            PAYLOAD JSON:
                          </span>
                          <pre className="bg-[#090D16] p-2 rounded text-slate-200 overflow-x-auto max-h-36">
                            <code>{JSON.stringify(del.payload, null, 2)}</code>
                          </pre>
                        </div>
                        {del.response_body && (
                          <div>
                            <span className="text-slate-400 font-semibold block mb-0.5">
                              RESPONSE BODY:
                            </span>
                            <pre className="bg-[#090D16] p-2 rounded text-slate-300 overflow-x-auto max-h-20">
                              <code>{del.response_body}</code>
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
