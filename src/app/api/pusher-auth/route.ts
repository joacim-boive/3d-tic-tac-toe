import Pusher from "pusher";
import { NextResponse } from "next/server";

function getPusher(): Pusher | null {
  const appId = process.env.PUSHER_APP_ID;
  const key = process.env.PUSHER_KEY;
  const secret = process.env.PUSHER_SECRET;
  const cluster = process.env.PUSHER_CLUSTER;
  if (!appId || !key || !secret || !cluster) return null;
  return new Pusher({ appId, key, secret, cluster, useTLS: true });
}

export async function POST(request: Request): Promise<Response> {
  const pusher = getPusher();
  if (!pusher) {
    return NextResponse.json({ error: "Pusher is not configured" }, { status: 503 });
  }

  const form = await request.formData();
  const socketId = String(form.get("socket_id") ?? "");
  const channel = String(form.get("channel_name") ?? "");
  const userId = String(form.get("user_id") ?? "").slice(0, 64);
  const name = String(form.get("name") ?? "").slice(0, 16);
  const seat = String(form.get("seat") ?? "");
  const preset = String(form.get("preset") ?? "") || undefined;
  const placement = String(form.get("placement") ?? "") || undefined;

  if (!socketId || !channel.startsWith("presence-room-")) {
    return NextResponse.json({ error: "Invalid channel" }, { status: 400 });
  }
  if (!userId || (seat !== "a" && seat !== "b") || !name.trim()) {
    return NextResponse.json({ error: "Invalid presence" }, { status: 400 });
  }

  const auth = pusher.authorizeChannel(socketId, channel, {
    user_id: userId,
    user_info: {
      seat,
      name: name.trim(),
      ...(preset ? { preset } : {}),
      ...(placement ? { placement } : {}),
    },
  });

  return NextResponse.json(auth);
}
