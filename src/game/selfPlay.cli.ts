/**
 * CLI: AI self-play balance eval.
 *
 *   npm run eval:selfplay -- --preset 4x4x4 --placement drop --games 10000 --difficulty medium
 *   npm run eval:selfplay -- --all --games 2000 --difficulty medium
 *   npm run eval:selfplay -- --preset 3x3x3 --difficulty hard --games 200 --budget Infinity
 *   npm run eval:selfplay -- --preset 4x4x4 --difficulty extreme --vs hard --swap --games 40
 */
import { PRESETS, getPreset, resolvePresetId } from "./presets";
import {
  formatSelfPlayReport,
  runSelfPlay,
  type SelfPlayConfig,
} from "./selfPlay";
import type { AiDifficulty, PlacementMode, PresetId } from "./types";

type CliArgs = {
  preset: PresetId | "all";
  placement: PlacementMode | "both";
  difficulty: AiDifficulty;
  vsDifficulty: AiDifficulty | undefined;
  swapSeats: boolean;
  games: number;
  seed: number;
  openingPlies: number;
  /** undefined = per-difficulty browser defaults; number includes Infinity. */
  budgetMs: number | undefined;
  vsBudgetMs: number | undefined;
  maxDepth: number | undefined;
  progress: boolean;
};

function printHelp() {
  console.log(`Usage: eval:selfplay [options]

Options:
  --preset <id|all>       3x3x3 | 4x4x4 | 5x5x4 | all   (default: all)
  --placement <mode>      free | drop | both            (default: both)
  --difficulty <level>    easy | medium | hard | extreme  (default: medium)
  --vs <level>            Second-seat difficulty (head-to-head). Default: same as --difficulty
  --swap                  Alternate who opens when --vs differs (fairer matchup)
  --games <n>             games per preset×placement    (default: 2000)
  --seed <n>              RNG seed                      (default: 12648430)
  --opening-plies <n>     opening fingerprint length    (default: 2)
  --budget <ms|Infinity|default>
                          Search budget. "default" = each difficulty's browser budget
                          (Hard ~80ms, Extreme ~900ms). Omit with --vs → default;
                          omit without --vs → Infinity (offline deep symmetric).
  --vs-budget <ms|Infinity|default>
                          Budget for the --vs seat only (matchups)
  --max-depth <n>         Cap Hard/Extreme iterative deepening
  --progress              Log progress every 10%
  --help                  Show this help

Tips:
  Use medium for large batches (10k–100k). Hard/Extreme α-β are for small samples.
  Measure Extreme strength (browser-realistic):
    --difficulty extreme --vs hard --swap --games 40 --progress
  First-player win rate ≫ 50% with drawn-out games still short ⇒ rules favor the opener.
`);
}

function parseDifficulty(v: string, flag: string): AiDifficulty {
  if (v !== "easy" && v !== "medium" && v !== "hard" && v !== "extreme") {
    throw new Error(`Invalid ${flag}: ${v}`);
  }
  return v;
}

function parseBudget(v: string): number | undefined {
  const lower = v.toLowerCase();
  if (lower === "default") return undefined;
  if (lower === "infinity") return Number.POSITIVE_INFINITY;
  const n = Number(v);
  if (!Number.isFinite(n) && n !== Number.POSITIVE_INFINITY) {
    throw new Error(`Invalid budget: ${v}`);
  }
  return n;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    preset: "all",
    placement: "both",
    difficulty: "medium",
    vsDifficulty: undefined,
    swapSeats: false,
    games: 2000,
    seed: 0xc0ffee,
    openingPlies: 2,
    budgetMs: Number.POSITIVE_INFINITY,
    vsBudgetMs: undefined,
    maxDepth: undefined,
    progress: false,
  };
  let budgetExplicit = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v == null) throw new Error(`Missing value after ${a}`);
      return v;
    };
    switch (a) {
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
        break;
      case "--preset": {
        const v = next();
        args.preset = v === "all" ? "all" : resolvePresetId(v);
        break;
      }
      case "--all":
        args.preset = "all";
        break;
      case "--placement": {
        const v = next();
        if (v !== "free" && v !== "drop" && v !== "both") {
          throw new Error(`Invalid placement: ${v}`);
        }
        args.placement = v;
        break;
      }
      case "--difficulty":
        args.difficulty = parseDifficulty(next(), "--difficulty");
        break;
      case "--vs":
        args.vsDifficulty = parseDifficulty(next(), "--vs");
        break;
      case "--swap":
        args.swapSeats = true;
        break;
      case "--games":
        args.games = Math.max(1, Number.parseInt(next(), 10));
        break;
      case "--seed":
        args.seed = Number.parseInt(next(), 10) || 0;
        break;
      case "--opening-plies":
        args.openingPlies = Math.max(1, Number.parseInt(next(), 10));
        break;
      case "--budget":
        args.budgetMs = parseBudget(next());
        budgetExplicit = true;
        break;
      case "--vs-budget":
        args.vsBudgetMs = parseBudget(next());
        break;
      case "--max-depth":
        args.maxDepth = Math.max(1, Number.parseInt(next(), 10));
        break;
      case "--progress":
        args.progress = true;
        break;
      default:
        throw new Error(`Unknown arg: ${a} (try --help)`);
    }
  }

  // Matchups default to each level's browser think-time unless --budget is set.
  if (args.vsDifficulty != null && args.vsDifficulty !== args.difficulty && !budgetExplicit) {
    args.budgetMs = undefined;
  }

  return args;
}

function placementsFor(mode: PlacementMode | "both"): PlacementMode[] {
  return mode === "both" ? ["free", "drop"] : [mode];
}

function presetsFor(id: PresetId | "all"): PresetId[] {
  return id === "all" ? PRESETS.map((p) => p.id) : [id];
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const reports: string[] = [];

  for (const presetId of presetsFor(args.preset)) {
    const preset = getPreset(presetId);
    for (const placement of placementsFor(args.placement)) {
      const config: SelfPlayConfig = {
        dims: preset.dims,
        placement,
        games: args.games,
        difficulty: args.difficulty,
        vsDifficulty: args.vsDifficulty,
        swapSeats: args.swapSeats,
        seed: args.seed,
        openingPlies: args.openingPlies,
        budgetMs: args.budgetMs,
        vsBudgetMs: args.vsBudgetMs,
        maxDepth: args.maxDepth,
        onProgress: args.progress
          ? (played, total) => {
              if (played === total || played % Math.max(1, Math.floor(total / 10)) === 0) {
                process.stderr.write(
                  `\r${preset.label} ${placement}: ${played}/${total}`.padEnd(48),
                );
              }
            }
          : undefined,
      };

      const stats = runSelfPlay(config);
      if (args.progress) process.stderr.write("\n");
      reports.push(
        formatSelfPlayReport(stats, {
          label: preset.label,
          placement,
          difficulty: args.difficulty,
          vsDifficulty: args.vsDifficulty,
          swapSeats: args.swapSeats,
          seed: args.seed,
        }),
      );
    }
  }

  console.log(reports.join("\n\n"));
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
