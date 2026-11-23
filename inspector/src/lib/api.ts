import {
  AdminOverview,
  ChaosConfigUpdate,
  ChaosSnapshot,
  HealthResponse,
  ProbeResult,
  TrafficLogResponse,
  WebhookDelivery,
  WebhookSubscription,
} from "../types";

export function getEngineUrl(): string {
  const url = process.env.NEXT_PUBLIC_ENGINE_URL;
  if (!url || url.trim() === "") {
    return "http://localhost:8000";
  }
  return url.replace(/\/+$/, "");
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const baseUrl = getEngineUrl();
  const url = `${baseUrl}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.headers || {}),
    },
    cache: "no-store",
  });

  if (!res.ok) {
    let errorDetail = `HTTP ${res.status} ${res.statusText}`;
    try {
      const errJson = await res.json();
      if (errJson && typeof errJson === "object") {
        if ("error" in errJson) errorDetail = String(errJson.error);
        else if ("detail" in errJson) errorDetail = String(errJson.detail);
      }
    } catch {
      // ignore json parse error on non-json error responses
    }
    throw new Error(errorDetail);
  }

  return (await res.json()) as T;
}

export async function fetchOverview(): Promise<AdminOverview> {
  return request<AdminOverview>("/admin/overview");
}

export async function fetchHealth(): Promise<HealthResponse> {
  return request<HealthResponse>("/health");
}

export async function fetchChaos(): Promise<ChaosSnapshot> {
  return request<ChaosSnapshot>("/admin/chaos");
}

export async function updateChaos(
  config: ChaosConfigUpdate
): Promise<ChaosSnapshot> {
  return request<ChaosSnapshot>("/admin/chaos", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
}

export async function resetChaos(): Promise<ChaosSnapshot> {
  return request<ChaosSnapshot>("/admin/chaos/reset", {
    method: "POST",
  });
}

export async function fetchTraffic(
  prefix?: string,
  limit = 50
): Promise<TrafficLogResponse> {
  const params = new URLSearchParams();
  if (prefix && prefix.trim() !== "") {
    params.set("prefix", prefix.trim());
  }
  params.set("limit", String(limit));
  const query = params.toString() ? `?${params.toString()}` : "";
  return request<TrafficLogResponse>(`/admin/traffic${query}`);
}

export async function clearTraffic(): Promise<{ status: string; count: number }> {
  return request<{ status: string; count: number }>("/admin/traffic", {
    method: "DELETE",
  });
}

export async function fetchWebhooks(): Promise<{
  subscriptions: WebhookSubscription[];
}> {
  return request<{ subscriptions: WebhookSubscription[] }>("/admin/webhooks");
}

export async function createWebhook(data: {
  url: string;
  secret?: string;
  events?: string[];
  enabled?: boolean;
}): Promise<WebhookSubscription> {
  return request<WebhookSubscription>("/admin/webhooks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: data.url,
      secret: data.secret || undefined,
      events: data.events && data.events.length > 0 ? data.events : ["sep24.transaction.updated"],
      enabled: data.enabled ?? true,
    }),
  });
}

export async function deleteWebhook(
  id: string
): Promise<{ status: string; id: string }> {
  return request<{ status: string; id: string }>(`/admin/webhooks/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function fetchDeliveries(
  limit = 50,
  transactionId?: string
): Promise<{ deliveries: WebhookDelivery[] }> {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  if (transactionId && transactionId.trim() !== "") {
    params.set("transaction_id", transactionId.trim());
  }
  return request<{ deliveries: WebhookDelivery[] }>(
    `/admin/webhooks/deliveries?${params.toString()}`
  );
}

export async function replayDelivery(id: string): Promise<WebhookDelivery> {
  return request<WebhookDelivery>(
    `/admin/webhooks/deliveries/${encodeURIComponent(id)}/replay`,
    {
      method: "POST",
    }
  );
}

export async function probeEndpoint(path: string): Promise<ProbeResult> {
  const baseUrl = getEngineUrl();
  const targetUrl = `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
  const start = performance.now();
  const timestamp = new Date().toISOString();

  try {
    const res = await fetch(targetUrl, {
      method: "GET",
      cache: "no-store",
    });
    const durationMs = Math.round((performance.now() - start) * 100) / 100;
    const headers: Record<string, string> = {};
    res.headers.forEach((value, key) => {
      headers[key] = value;
    });

    const text = await res.text();
    let isJson = false;
    let formattedBody = text;
    try {
      const parsed = JSON.parse(text);
      formattedBody = JSON.stringify(parsed, null, 2);
      isJson = true;
    } catch {
      isJson = false;
    }

    return {
      url: targetUrl,
      status: res.status,
      statusText: res.statusText,
      durationMs,
      headers,
      body: formattedBody,
      isJson,
      timestamp,
    };
  } catch (err: unknown) {
    const durationMs = Math.round((performance.now() - start) * 100) / 100;
    const msg = err instanceof Error ? err.message : String(err);
    return {
      url: targetUrl,
      status: 0,
      statusText: "Network Error",
      durationMs,
      headers: {},
      body: `Failed to reach endpoint: ${msg}`,
      isJson: false,
      timestamp,
      error: msg,
    };
  }
}
