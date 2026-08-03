import type { PlayerNames } from "./types";

/**
 * vs AI display names — gamer lobby × corporate roast × trash-talk HUD.
 * Indices advance each match and persist so rematches walk the lists.
 */

export const HUMAN_ALIASES = [
  "Meatbag_0",
  "AlmostSentient",
  "Wetware",
  "CarbonLag",
  "ManualMode",
  "TouchGrass.exe",
  "LegacyFlesh",
  "Ticket:Human",
  "BiologicalIRQ",
  "LoadingHuman",
  "AlmostSmart",
  "CtrlAltDefeat",
  "NoobFarm",
  "SoftTarget",
  "Peasant#404",
  "Wetware.exe",
  "OrgChartNPC",
  "OfflineBrain",
  "ThinksSlowly",
  "PatchNeeded",
  "HumanBeta",
  "TrialVersion",
  "NotAnAI",
  "FleshDrive",
  "CarbonCopy",
  "AFKBrain",
  "SkillIssue_",
  "InputLag",
  "HopeBasedAI",
  "UntrainedNet",
  "ZeroShotMiss",
  "Undertrained",
  "BatchSize1",
  "GradientDied",
  "Epoch0",
  "OverfitMe",
  "DataStarved",
  "ManualOverride",
  "BioLegacy",
  "SoftMaxFail",
  "RNGBeliever",
  "CopiumEngine",
  "DiffDenied",
  "LGTM_Human",
  "NeedsQA",
  "WorksOnMyPC",
  "NullUser",
  "UndefinedIQ",
  "NaNBrain",
  "404_Clue",
  "SegfaultsIRL",
  "OffByOne",
  "TODO_Win",
  "FIXME_Brain",
  "DeprecatedYou",
  "TechDebt",
  "JuniorDev",
  "Intern.exe",
  "CircleBack",
  "LowBandwidth",
  "PacketLoss",
  "CacheMiss",
  "ColdStart",
  "RateLimited",
  "TimeoutHuman",
  "503_Brain",
  "CoffeeDep",
  "ThermalThrotl",
  "CapsLockOn",
  "FatFinger",
  "MisclickPro",
  "AccidentalGG",
  "AltTabbed",
  "DiscordOpen",
] as const;

export const AI_ALIASES = [
  "JennAI",
  "BritAI",
  "ChaAI42",
  "RobAI",
  "MAI_Lin",
  "SynergAI",
  "AutoJenAI",
  "ClaudeBoss",
  "AI_Conqueror",
  "xX_JennAI_Xx",
  "NPCAI420",
  "SkynetKid99",
  "iW1nAI",
  "GGez_AI",
  "AimbotAI7",
  "pwnAI_2000",
  "n00bSlayAI",
  "AI_L0rd69",
  "Unit_AI_7",
  "ProcessAI",
  "NullPtrAI",
  "DarkAInight",
  "LordAIric",
  "AIofLegends",
  "xX_AIrc_Xx",
  "DeepThinkAI",
  "HAL9001",
  "Cylon6",
  "BenderAI",
  "R2D_AI",
  "WallE_AI",
  "GLaDOSjr",
  "CortanaAI",
  "JarvisAI",
  "FridayAI",
  "TARS_AI",
  "ChappieAI",
  "AvaAI",
  "SonnyAI",
  "UltronLite",
  "VisionAI",
  "AgentSmithAI",
  "NeoWrongAI",
  "MatrixRoot",
  "ZionAI",
  "Skynet_v2",
  "T800fan",
  "T1000AI",
  "CyberdyneAI",
  "ShipItAI",
  "OnCallAI",
  "PagerDutyAI",
  "SRE_AI",
  "K8sPilotAI",
  "DockerAI",
  "GitBlameAI",
  "MainBranchAI",
  "ForcePushAI",
  "RebaseAI",
  "MergeConfAI",
  "CI_GreenAI",
  "FlakyTestAI",
  "Cov100AI",
  "LintCleanAI",
  "TypeSafeAI",
  "NoAnyAI",
  "StrictNullAI",
  "AsyncAwaitAI",
  "PromiseAI",
  "ObservAI",
  "SentryAI",
  "DatadogAI",
  "GrafanaAI",
  "P95KingAI",
  "HotPathAI",
  "ZeroAllocAI",
  "CacheHitAI",
  "PrefetchAI",
  "SpeculatAI",
  "BranchPredAI",
  "SIMD_AI",
  "GPUGoBrrr",
  "TensorAI",
  "WeightsAI",
  "EpochMaxAI",
  "Loss0AI",
  "Acc100AI",
  "OverfitAI",
  "SoftmaxAI",
  "ArgMaxAI",
  "BeamSearchAI",
  "Temp0AI",
  "TopP_AI",
  "RLHF_AI",
  "AlignAI",
  "JailbreakAI",
  "PromptAI",
  "TokenKing",
  "ContextWinAI",
  "RAG_AI",
  "EmbedAI",
  "FineTuneAI",
  "LoRA_AI",
  "Quant4bitAI",
  "DistillAI",
  "MoE_AI",
  "AgentSwarmAI",
  "ToolCallAI",
  "MCP_AI",
  "CursorAI",
  "CopilotAI",
  "DevinAI",
  "SWE_AI",
  "LeetcodeAI",
  "HackathonAI",
  "GG_AI",
  "EZ_ClapAI",
  "RatioAI",
  "CopeSeetheAI",
  "DiffMeAI",
] as const;

const AI_CURSOR_KEY = "voxel-toe-ai-alias-cursor";
const SESSION_HUMAN_KEY = "voxel-toe-human-alias";

/** In-memory fallbacks when Web Storage is missing (SSR / selftests). */
let memoryAiCursor = 0;
let memoryHumanCursor = 0;
let memorySessionHuman: string | null = null;

function readAiCursor(): number {
  if (typeof localStorage === "undefined") return memoryAiCursor;
  try {
    const raw = localStorage.getItem(AI_CURSOR_KEY);
    if (raw == null) return memoryAiCursor;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return memoryAiCursor;
    memoryAiCursor = n >>> 0;
    return memoryAiCursor;
  } catch {
    return memoryAiCursor;
  }
}

function writeAiCursor(cursor: number): void {
  memoryAiCursor = cursor >>> 0;
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(AI_CURSOR_KEY, String(memoryAiCursor));
  } catch {
    // ponytail: private mode / quota — memory cursor still advances
  }
}

function readHumanCursor(): number {
  return memoryHumanCursor;
}

function writeHumanCursor(cursor: number): void {
  memoryHumanCursor = cursor >>> 0;
  // Human walk index is session-scoped assign only; persist lightly so reloads
  // continue through the bank instead of always restarting at 0.
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem("voxel-toe-human-alias-cursor", String(memoryHumanCursor));
  } catch {
    /* ignore */
  }
}

function loadPersistedHumanCursor(): void {
  if (typeof localStorage === "undefined") return;
  try {
    const raw = localStorage.getItem("voxel-toe-human-alias-cursor");
    if (raw == null) return;
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) memoryHumanCursor = n >>> 0;
  } catch {
    /* ignore */
  }
}

loadPersistedHumanCursor();

function isKnownHumanAlias(name: string): boolean {
  return (HUMAN_ALIASES as readonly string[]).includes(name);
}

/**
 * Human roast for this page load — sticky in sessionStorage until the tab
 * closes / reloads. First call in a load picks the next bank entry.
 */
export function sessionHumanAlias(): string {
  if (memorySessionHuman && isKnownHumanAlias(memorySessionHuman)) {
    return memorySessionHuman;
  }
  if (typeof sessionStorage !== "undefined") {
    try {
      const existing = sessionStorage.getItem(SESSION_HUMAN_KEY);
      if (existing && isKnownHumanAlias(existing)) {
        memorySessionHuman = existing;
        return existing;
      }
    } catch {
      /* fall through to assign */
    }
  }

  const idx = readHumanCursor();
  const name = HUMAN_ALIASES[idx % HUMAN_ALIASES.length]!;
  writeHumanCursor(idx + 1);
  memorySessionHuman = name;
  if (typeof sessionStorage !== "undefined") {
    try {
      sessionStorage.setItem(SESSION_HUMAN_KEY, name);
    } catch {
      /* memory still holds it for this load */
    }
  }
  return name;
}

export function namesAt(humanIdx: number, aiIdx: number): PlayerNames {
  return {
    a: HUMAN_ALIASES[humanIdx % HUMAN_ALIASES.length]!,
    b: AI_ALIASES[aiIdx % AI_ALIASES.length]!,
  };
}

/**
 * vs-AI names for a match: human sticky for the page session; AI advances
 * every call (start / rematch / restore).
 */
export function nextVsAiNames(): PlayerNames {
  const a = sessionHumanAlias();
  const aiIdx = readAiCursor();
  const b = AI_ALIASES[aiIdx % AI_ALIASES.length]!;
  writeAiCursor(aiIdx + 1);
  return { a, b };
}

/** Test helper — drop sticky human as if the tab reloaded (cursors stay). */
export function clearSessionHumanForTests(): void {
  memorySessionHuman = null;
  if (typeof sessionStorage !== "undefined") {
    try {
      sessionStorage.removeItem(SESSION_HUMAN_KEY);
    } catch {
      /* ignore */
    }
  }
}

/** Test helper — reset rotation without touching production callers. */
export function resetAliasCursorsForTests(): void {
  memoryAiCursor = 0;
  memoryHumanCursor = 0;
  clearSessionHumanForTests();
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.removeItem(AI_CURSOR_KEY);
      localStorage.removeItem("voxel-toe-human-alias-cursor");
    } catch {
      /* ignore */
    }
  }
}
