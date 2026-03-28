import { logRealtimeEvent } from "@/services/realtime-telemetry";

type Listener = (event: MessageEvent) => void;

type WebsocketServiceOptions = {
  name?: string;
  reconnect?: boolean;
  maxReconnectDelayMs?: number;
};

export function createWebsocketService(url: string, options?: WebsocketServiceOptions) {
  let socket: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectAttempts = 0;
  let closedByUser = false;
  const listeners = new Set<Listener>();
  const serviceName = options?.name || "default";
  const allowReconnect = options?.reconnect !== false;
  const maxReconnectDelayMs = options?.maxReconnectDelayMs || 30_000;

  const clearReconnectTimer = () => {
    if (!reconnectTimer) return;
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  };

  const scheduleReconnect = () => {
    if (!allowReconnect || closedByUser) return;
    clearReconnectTimer();
    const delayMs = Math.min(1_500 * Math.max(1, reconnectAttempts), maxReconnectDelayMs);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delayMs);
    logRealtimeEvent("realtime", "websocket-reconnect-scheduled", {
      name: serviceName,
      url,
      reconnectAttempts,
      delayMs,
    });
  };

  const connect = () => {
    if (socket && socket.readyState !== WebSocket.CLOSED) return socket;
    clearReconnectTimer();
    closedByUser = false;
    socket = new WebSocket(url);
    logRealtimeEvent("realtime", "websocket-connecting", {
      name: serviceName,
      url,
    });
    socket.onopen = () => {
      reconnectAttempts = 0;
      logRealtimeEvent("realtime", "websocket-connected", {
        name: serviceName,
        url,
      });
    };
    socket.onmessage = (event) => {
      listeners.forEach((listener) => listener(event));
    };
    socket.onerror = () => {
      logRealtimeEvent("realtime", "websocket-error", {
        name: serviceName,
        url,
      });
    };
    socket.onclose = (event) => {
      socket = null;
      reconnectAttempts += 1;
      logRealtimeEvent("realtime", "websocket-disconnected", {
        name: serviceName,
        url,
        code: event.code,
        reason: event.reason || "",
        wasClean: event.wasClean,
        reconnectAttempts,
      });
      scheduleReconnect();
    };
    return socket;
  };

  const subscribe = (listener: Listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  const send = (payload: unknown) => {
    const active = connect();
    if (active.readyState === WebSocket.OPEN) {
      active.send(JSON.stringify(payload));
      return;
    }
    logRealtimeEvent("realtime", "websocket-send-skipped", {
      name: serviceName,
      readyState: active.readyState,
    });
  };

  const close = () => {
    closedByUser = true;
    clearReconnectTimer();
    if (!socket) return;
    socket.close();
    socket = null;
  };

  return { connect, subscribe, send, close };
}
