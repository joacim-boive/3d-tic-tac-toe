import { generateRoomCode, isValidRoomCode, normalizeRoomCode } from "./roomCode";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

assert(generateRoomCode(() => 0).length === 4, "code length");
assert(isValidRoomCode(generateRoomCode(() => 0.5)), "generated valid");
assert(normalizeRoomCode("k7xm") === "K7XM", "normalize lower");
assert(normalizeRoomCode("k7xm!!") === "K7XM", "strip junk");
assert(normalizeRoomCode("OI01") === "", "ambiguous stripped");
assert(!isValidRoomCode("AB"), "too short");
assert(!isValidRoomCode("ABCD1"), "too long after normalize check");
assert(isValidRoomCode("ABCD"), "plain valid");

console.log("roomCode.selftest: ok");
