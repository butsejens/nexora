type Listener = (event: MessageEvent) => void;

export function createWebsocketService(url: string) {
  let socket: WebSocket | null = null;
  const listeners = new Set<Listener>();

  const connect = () => {
    if (socket) return socket;
    socket = new WebSocket(url);
    socket.onmessage = (event) => {
      listeners.forEach((listener) => listener(event));
    };
    socket.onclose = () => {
      socket = null;
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
    }
  };

  const close = () => {
    if (!socket) return;
    socket.close();
    socket = null;
  };

  return { connect, subscribe, send, close };
}
