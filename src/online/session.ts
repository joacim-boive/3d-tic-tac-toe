import type { PresenceChannel } from "pusher-js";
import type { Board } from "@/game/board";
import { resolvePresetId } from "@/game/presets";
import { generateRoomCode, isValidRoomCode, normalizeRoomCode } from "@/game/roomCode";
import { setLocalPlacePublisher, useGameStore } from "@/game/store";
import type { PlayerId, PlayerNames, PlacementMode, PresetId } from "@/game/types";
import type { PresenceData, RoomMessage, StateMessage } from "./messages";
import { notifyOpponentConnected } from "./notify";
import { disconnectPusher, getPusherClient } from "./pusherClient";

const JOIN_TIMEOUT_MS = 3000;
const DISCONNECT_GRACE_MS = 60_000;

type SessionHandle = {
  channel: PresenceChannel;
  dispose: () => void;
};

let active: SessionHandle | null = null;
let disconnectTimer: ReturnType<typeof setTimeout> | null = null;

function clearDisconnectTimer() {
  if (disconnectTimer !== null) {
    clearTimeout(disconnectTimer);
    disconnectTimer = null;
  }
}

function newClientId(): string {
  return `p_${Math.random().toString(36).slice(2, 10)}`;
}

function presenceChannelName(code: string): string {
  return `presence-room-${code}`;
}

function trigger(channel: PresenceChannel, msg: RoomMessage) {
  channel.trigger(`client-${msg.type}`, msg);
}

function boardToEntries(board: Board): Array<[string, PlayerId]> {
  return [...board.entries()];
}

function entriesToBoard(entries: Array<[string, PlayerId]>): Board {
  return new Map(entries);
}

function buildStateMessage(): StateMessage {
  const s = useGameStore.getState();
  return {
    type: "state",
    board: boardToEntries(s.board),
    currentPlayer: s.currentPlayer,
    names: s.playerNames,
    preset: s.presetId,
    placement: s.placement,
    occupiedCount: s.occupiedCount,
    status: s.status,
    winner: s.winner,
    winningLine: s.winningLine,
    winningCell: s.winningCell,
  };
}

function applyStateMessage(msg: StateMessage) {
  useGameStore.getState().hydrateFromSnapshot({
    board: entriesToBoard(msg.board),
    occupiedCount: msg.occupiedCount,
    currentPlayer: msg.currentPlayer,
    names: msg.names,
    presetId: msg.preset,
    placement: msg.placement,
    status: msg.status,
    winner: msg.winner,
    winningLine: msg.winningLine,
    winningCell: msg.winningCell ?? null,
  });
}

function membersToPresence(channel: PresenceChannel): PresenceData[] {
  const out: PresenceData[] = [];
  channel.members.each((member: { info?: PresenceData }) => {
    const info = member.info;
    if (info?.seat && info.name) out.push(info);
  });
  return out;
}

function tryStartFromMembers(channel: PresenceChannel) {
  const bySeat = new Map<PlayerId, PresenceData>();
  for (const data of membersToPresence(channel)) bySeat.set(data.seat, data);
  if (!bySeat.has("a") || !bySeat.has("b")) return;

  const host = bySeat.get("a")!;
  const guest = bySeat.get("b")!;
  const preset = host.preset ?? useGameStore.getState().presetId;
  const placement = host.placement ?? useGameStore.getState().placement ?? "free";
  const names: PlayerNames = { a: host.name, b: guest.name };

  const state = useGameStore.getState();
  if (state.onlineStatus === "lobby") {
    trigger(channel, { type: "ready", names, preset, placement });
    state.startOnlineGame(names, preset, placement);
  }
}

function onMessage(raw: RoomMessage) {
  const store = useGameStore.getState();

  switch (raw.type) {
    case "ready": {
      if (store.onlineStatus === "lobby") {
        store.startOnlineGame(raw.names, raw.preset, raw.placement ?? "free");
      }
      break;
    }
    case "place": {
      if (store.seat === raw.by) break;
      store.applyRemotePlace({ x: raw.x, y: raw.y, z: raw.z }, raw.by);
      break;
    }
    case "rematch": {
      store.setRematchVote(raw.seat, raw.accept);
      const votes = useGameStore.getState().rematchVotes;
      if (raw.accept === false) {
        void leaveOnlineSession();
        return;
      }
      if (votes.a === true && votes.b === true) {
        store.resetForRematch();
      }
      break;
    }
    case "state": {
      if (store.onlineStatus === "paused" || store.onlineStatus === "lobby") {
        applyStateMessage(raw);
        store.resumeOnline();
      }
      break;
    }
    case "hello":
      break;
  }
}

function wireChannel(channel: PresenceChannel, seat: PlayerId) {
  const events = ["ready", "place", "rematch", "state", "hello"] as const;
  for (const type of events) {
    channel.bind(`client-${type}`, (data: RoomMessage) => {
      if (!data || typeof data !== "object" || data.type !== type) return;
      onMessage(data);
    });
  }

  channel.bind("pusher:member_added", () => {
    clearDisconnectTimer();
    const store = useGameStore.getState();
    store.setOpponentConnected(true);
    const opponentName =
      membersToPresence(channel).find((p) => p.seat !== seat)?.name ??
      (seat === "a" ? store.playerNames.b : store.playerNames.a);

    if (store.onlineStatus === "paused") {
      notifyOpponentConnected("reconnected", opponentName);
      trigger(channel, buildStateMessage());
      useGameStore.getState().resumeOnline();
    } else {
      if (store.onlineStatus === "lobby" && seat === "a") {
        notifyOpponentConnected("joined", opponentName);
      }
      tryStartFromMembers(channel);
    }
  });

  channel.bind("pusher:member_removed", (member: { info?: PresenceData }) => {
    const data = member.info;
    if (!data || data.seat === seat) return;
    useGameStore.getState().setOpponentConnected(false);
    const status = useGameStore.getState().onlineStatus;
    if (status === "playing" || status === "ended") {
      useGameStore.getState().pauseOnline();
      clearDisconnectTimer();
      disconnectTimer = setTimeout(() => {
        disconnectTimer = null;
        useGameStore.getState().setOnlineError("Opponent left");
        void leaveOnlineSession();
      }, DISCONNECT_GRACE_MS);
    }
  });

  setLocalPlacePublisher((coord, by) => {
    trigger(channel, { type: "place", x: coord.x, y: coord.y, z: coord.z, by });
  });
}

function subscribePresence(channel: PresenceChannel): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("Could not join room")), JOIN_TIMEOUT_MS * 2);
    channel.bind("pusher:subscription_succeeded", () => {
      clearTimeout(t);
      resolve();
    });
    channel.bind("pusher:subscription_error", () => {
      clearTimeout(t);
      reject(new Error("Could not join room"));
    });
  });
}

function waitForHost(channel: PresenceChannel): Promise<void> {
  if (membersToPresence(channel).some((p) => p.seat === "a")) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("Room not found")), JOIN_TIMEOUT_MS);
    const onAdd = () => {
      if (membersToPresence(channel).some((p) => p.seat === "a")) {
        clearTimeout(t);
        channel.unbind("pusher:member_added", onAdd);
        resolve();
      }
    };
    channel.bind("pusher:member_added", onAdd);
  });
}

async function attachSession(
  code: string,
  seat: PlayerId,
  name: string,
  preset?: PresetId,
  placement?: PlacementMode,
): Promise<void> {
  await leaveOnlineSession();

  const userId = newClientId();
  const pusher = getPusherClient({
    userId,
    seat,
    name,
    preset,
    placement,
  });

  const channelName = presenceChannelName(code);
  const channel = pusher.subscribe(channelName) as PresenceChannel;

  try {
    await subscribePresence(channel);

    if (seat === "b") {
      await waitForHost(channel);
    }

    const present = membersToPresence(channel);
    if (present.length > 2) throw new Error("Room full");

    const hosts = present.filter((p) => p.seat === "a");
    const guests = present.filter((p) => p.seat === "b");
    if (seat === "a" && hosts.length > 1) throw new Error("Room full");
    if (seat === "b") {
      if (hosts.length === 0) throw new Error("Room not found");
      if (guests.length > 1) throw new Error("Room full");
    }

    useGameStore.getState().beginOnlineLobby(code, seat, name);
    // Apply host match options without writing over this client's saved setup prefs.
    if (preset || placement) {
      useGameStore.setState({
        ...(preset ? { presetId: resolvePresetId(preset) } : {}),
        ...(placement ? { placement } : {}),
      });
    }

    wireChannel(channel, seat);

    active = {
      channel,
      dispose: () => {
        clearDisconnectTimer();
        setLocalPlacePublisher(null);
        channel.unbind_all();
        pusher.unsubscribe(channelName);
      },
    };

    tryStartFromMembers(channel);
  } catch (err) {
    setLocalPlacePublisher(null);
    channel.unbind_all();
    pusher.unsubscribe(channelName);
    disconnectPusher();
    throw err;
  }
}

export async function createOnlineRoom(
  name: string,
  preset: PresetId,
  placement: PlacementMode,
): Promise<string> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Enter your name");
  const code = generateRoomCode();
  await attachSession(code, "a", trimmed, preset, placement);
  return code;
}

export async function joinOnlineRoom(rawCode: string, name: string): Promise<string> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Enter your name");
  const code = normalizeRoomCode(rawCode);
  if (!isValidRoomCode(code)) throw new Error("Invalid room code");
  await attachSession(code, "b", trimmed);
  return code;
}

export function publishRematchVote(accept: boolean) {
  const state = useGameStore.getState();
  if (!active || state.seat == null) return;
  state.setRematchVote(state.seat, accept);
  trigger(active.channel, { type: "rematch", seat: state.seat, accept });
  const votes = useGameStore.getState().rematchVotes;
  if (accept === false) {
    void leaveOnlineSession();
    return;
  }
  if (votes.a === true && votes.b === true) {
    state.resetForRematch();
  }
}

export async function leaveOnlineSession(): Promise<void> {
  clearDisconnectTimer();
  const handle = active;
  active = null;
  setLocalPlacePublisher(null);
  if (handle) {
    handle.dispose();
  }
  disconnectPusher();
  const s = useGameStore.getState();
  const leavingSession = s.playMode === "online" && s.phase !== "setup";
  if (leavingSession) {
    s.leaveOnline();
  }
  // Invite link stays on /play/[code]; send leavers back to the main setup screen.
  if (
    leavingSession &&
    typeof window !== "undefined" &&
    window.location.pathname.startsWith("/play/")
  ) {
    window.location.assign("/");
  }
}

export function shareUrlForRoom(code: string): string {
  if (typeof window === "undefined") return `/play/${code}`;
  return `${window.location.origin}/play/${code}`;
}
