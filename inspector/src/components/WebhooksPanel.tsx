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
import SegmentedControl from "./SegmentedControl";
import { CopyIcon, CheckIcon, TrashIcon, RefreshIcon } from "./Icons";

interface WebhooksPanelProps {
  onRefreshOverview?: () => void;
}

const EVENT_OPTIONS = [
  { label: "sep24.transaction.updated", value: "sep24.transaction.updated" },
  { label: "* (All)", value: "*" },
];

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
      setActionFeedback("Webhook registered.");
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
      setActionFeedback("Subscription removed.");
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
      setActionFeedback(`Delivery ${id.slice(0, 8)} replayed.`);
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
    <div className="flex flex-col flex-1 bg-[#0D0D10] text-[#F2F2EE] font-sans text-xs overflow-y-auto">
      <div className="p-3.5 space-y-3.5">
        {/* One-Time Secret Alert Banner */}
        {newlyCreatedSecret && (
          <div className="bg-[#18181E] border border-[#F59E0B]/40 rounded-md p-3 text-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-sans font-semibold text-[#F59E0B] uppercase tracking-[0.06em]">
                SIGNING SECRET GENERATED (ONE-TIME VIEW)
              </span>
              <button
                type="button"
                onClick={() => setNewlyCreatedSecret(null)}
                className="text-[10px] text-[#A0A0AD] hover:text-[#F2F2EE]"
              >
                Dismiss
              </button>
            </div>
            <p className="text-[11px] text-[#A0A0AD] font-sans">
              Store this secret securely to verify HMAC signatures:
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-[#09090B] border border-[#1E1E24] px-2 py-1 rounded-[3px] text-[#F2F2EE] text-[11px] font-mono select-all truncate">
                {newlyCreatedSecret.secret}
              </code>
              <button
                type="button"
                onClick={handleCopySecret}
                className="px-2.5 py-1 rounded-md bg-[#F2F2EE] hover:bg-white text-[#09090B] font-sans font-semibold text-[11px] transition-colors shrink-0 flex items-center gap-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
              >
                {copiedSecret ? <CheckIcon className="w-3 h-3" /> : <CopyIcon className="w-3 h-3" />}
                <span>{copiedSecret ? "Copied" : "Copy"}</span>
              </button>
            </div>
          </div>
        )}

        {/* Action feedback */}
        {actionFeedback && (
          <div className="text-[11px] font-mono text-[#F59E0B]">
            {actionFeedback}
          </div>
        )}

        {/* Registration Form */}
        <form onSubmit={handleRegister} className="space-y-2.5">
          <span className="text-[10px] uppercase font-sans font-medium tracking-[0.06em] text-[#646472] block">
            REGISTER WEBHOOK LISTENER
          </span>

          <div className="space-y-2">
            <input
              type="text"
              required
              placeholder="http://localhost:9000/webhook or https://..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full bg-[#18181E] border border-[#1E1E24] rounded-md px-2.5 py-1.5 text-[#F2F2EE] text-xs font-mono focus:outline-none focus:border-[#3A3A47] transition-colors"
            />

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
              <SegmentedControl
                options={EVENT_OPTIONS}
                value={selectedEvent}
                onChange={(val) => setSelectedEvent(String(val))}
              />

              <button
                type="submit"
                disabled={registering}
                className="px-3 py-1.5 rounded-md bg-[#F2F2EE] hover:bg-white text-[#09090B] font-sans text-xs font-semibold transition-all disabled:opacity-50 shrink-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
              >
                {registering ? "Subscribing..." : "Subscribe"}
              </button>
            </div>
          </div>

          {formError && (
            <p className="text-[11px] text-[#F87171] font-sans">{formError}</p>
          )}
        </form>

        {/* Subscriptions List */}
        <div className="space-y-2 pt-2 border-t border-[#1E1E24]">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-sans font-medium tracking-[0.06em] text-[#646472]">
              ACTIVE SUBSCRIPTIONS ({subscriptions.length})
            </span>
            <button
              type="button"
              onClick={loadData}
              disabled={loading}
              className="text-[10px] text-[#A0A0AD] hover:text-[#F2F2EE] flex items-center gap-1 font-sans"
            >
              <RefreshIcon className="w-2.5 h-2.5" />
              <span>Refresh</span>
            </button>
          </div>

          <div className="border border-[#1E1E24] rounded-md bg-[#09090B] divide-y divide-[#1E1E24] max-h-44 overflow-y-auto">
            {subscriptions.length === 0 ? (
              <div className="p-3 text-center text-[#646472] text-xs font-sans">
                No active webhook endpoints registered.
              </div>
            ) : (
              subscriptions.map((sub) => (
                <div
                  key={sub.id}
                  className="p-2.5 flex items-center justify-between gap-2 hover:bg-[#18181E] transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#34D399]" />
                      <span className="font-mono font-medium text-[#F2F2EE] truncate text-[11px]">
                        {sub.url}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-[#646472] font-mono mt-0.5">
                      <span>{sub.events.join(", ")}</span>
                      <span>•</span>
                      <span>SEC: {sub.secret_preview || "configured"}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(sub.id)}
                    className="text-[#646472] hover:text-[#F87171] p-1 rounded-sm hover:bg-[#18181E] transition-colors"
                    title="Delete subscription"
                  >
                    <TrashIcon className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Deliveries & Replay Log */}
        <div className="space-y-2 pt-2 border-t border-[#1E1E24]">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-sans font-medium tracking-[0.06em] text-[#646472]">
              RECENT DELIVERIES ({deliveries.length})
            </span>
            <span className="text-[10px] text-[#646472] font-sans">
              Click Inspect to view payload
            </span>
          </div>

          <div className="border border-[#1E1E24] rounded-md bg-[#09090B] divide-y divide-[#1E1E24] max-h-56 overflow-y-auto">
            {deliveries.length === 0 ? (
              <div className="p-3 text-center text-[#646472] text-xs font-sans">
                No webhook deliveries recorded yet.
              </div>
            ) : (
              deliveries.map((del) => {
                const isDelivered = del.status === "delivered";
                const isExpanded = expandedDeliveryId === del.id;
                return (
                  <div
                    key={del.id}
                    className="p-2 flex flex-col gap-1 hover:bg-[#141418] transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                            isDelivered ? "bg-[#34D399]" : "bg-[#F87171]"
                          }`}
                        />
                        <span className="text-[#F2F2EE] font-mono font-medium text-[11px] truncate">
                          {del.event_type}
                        </span>
                        <span className="text-[10px] font-mono text-[#646472] tabular-nums">
                          {del.http_status ? `HTTP ${del.http_status}` : "FAILED"}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedDeliveryId(isExpanded ? null : del.id)
                          }
                          className="px-1.5 py-0.5 rounded-[2px] bg-[#18181E] hover:bg-[#202028] text-[#A0A0AD] hover:text-[#F2F2EE] text-[10px] border border-[#292932] font-sans"
                        >
                          {isExpanded ? "Hide" : "Inspect"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReplay(del.id)}
                          disabled={replayingId === del.id}
                          className="px-1.5 py-0.5 rounded-[2px] bg-[#1C1C22] hover:bg-[#24242C] text-[#F2F2EE] text-[10px] font-sans font-medium border border-[#2E2E38] transition-colors"
                        >
                          {replayingId === del.id ? "..." : "Replay"}
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[10px] font-mono text-[#646472] tabular-nums">
                      <span>TX: {del.transaction_id.slice(0, 8)}...</span>
                      <span>ATTEMPTS: {del.attempts}</span>
                      <span>{new Date(del.created_at).toLocaleTimeString()}</span>
                    </div>

                    {isExpanded && (
                      <div className="mt-1.5 p-2 bg-[#111115] border border-[#1E1E24] rounded-sm text-[10px] space-y-1.5">
                        <div>
                          <span className="text-[#646472] uppercase font-sans text-[9px] block">
                            SIGNATURE HEADER
                          </span>
                          <span className="text-[#F2F2EE] font-mono break-all select-all">
                            {del.signature}
                          </span>
                        </div>
                        <div>
                          <span className="text-[#646472] uppercase font-sans text-[9px] block">
                            PAYLOAD JSON
                          </span>
                          <pre className="bg-[#09090B] p-1.5 rounded-[3px] text-[#F2F2EE] font-mono overflow-x-auto max-h-32">
                            <code>{JSON.stringify(del.payload, null, 2)}</code>
                          </pre>
                        </div>
                        {del.response_body && (
                          <div>
                            <span className="text-[#646472] uppercase font-sans text-[9px] block">
                              RECEIVER RESPONSE BODY
                            </span>
                            <pre className="bg-[#09090B] p-1.5 rounded-[3px] text-[#A0A0AD] font-mono overflow-x-auto max-h-16">
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
