import Pusher from "pusher-js";

export type PresenceAuthParams = {
  userId: string;
  seat: string;
  name: string;
  preset?: string;
};

let client: Pusher | null = null;

export function getPusherClient(auth: PresenceAuthParams): Pusher {
  const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
  const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
  if (!key || !cluster) {
    throw new Error("Pusher is not configured (NEXT_PUBLIC_PUSHER_KEY / CLUSTER)");
  }

  if (client) {
    client.disconnect();
    client = null;
  }

  client = new Pusher(key, {
    cluster,
    channelAuthorization: {
      endpoint: "/api/pusher-auth",
      transport: "ajax",
      customHandler: (params, callback) => {
        const body = new URLSearchParams({
          socket_id: params.socketId,
          channel_name: params.channelName,
          user_id: auth.userId,
          seat: auth.seat,
          name: auth.name,
          ...(auth.preset ? { preset: auth.preset } : {}),
        });
        void fetch("/api/pusher-auth", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body,
        })
          .then(async (res) => {
            if (!res.ok) {
              callback(new Error(`Auth failed (${res.status})`), null);
              return;
            }
            const data = (await res.json()) as {
              auth: string;
              channel_data?: string;
            };
            callback(null, data);
          })
          .catch((err: unknown) => {
            callback(err instanceof Error ? err : new Error("Auth failed"), null);
          });
      },
    },
  });

  return client;
}

export function disconnectPusher(): void {
  if (!client) return;
  client.disconnect();
  client = null;
}
