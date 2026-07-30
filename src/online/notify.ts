export type NotifyKind = "joined" | "reconnected";

export function shouldShowOpponentNotify(opts: {
  permission: NotificationPermission | "unsupported";
  visibilityState: DocumentVisibilityState;
  hasFocus: boolean;
}): boolean {
  if (opts.permission !== "granted") return false;
  if (opts.visibilityState === "visible" && opts.hasFocus) return false;
  return true;
}

export async function requestNotifyPermission(): Promise<void> {
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "default") return;
  try {
    await Notification.requestPermission();
  } catch {
    // ignored — unsupported or blocked
  }
}

function copyFor(kind: NotifyKind, name: string): { title: string; body: string } {
  if (kind === "joined") {
    return { title: "Opponent joined", body: `${name} is ready — match starting` };
  }
  return { title: "Opponent back", body: `${name} reconnected` };
}

export function notifyOpponentConnected(kind: NotifyKind, name?: string): void {
  if (typeof Notification === "undefined" || typeof document === "undefined") return;
  if (
    !shouldShowOpponentNotify({
      permission: Notification.permission,
      visibilityState: document.visibilityState,
      hasFocus: document.hasFocus(),
    })
  ) {
    return;
  }

  const label = name?.trim() || "Opponent";
  const { title, body } = copyFor(kind, label);
  try {
    const n = new Notification(title, { body });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    // ignored
  }
}
