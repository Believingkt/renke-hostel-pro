// Pure unit tests for inbound canonical→member resolution decisions
// used by handleAvailNotifRQ (fan-out) and handleRateAmountNotifRQ (room rewrite).
// These mirror the in-loop logic in index.ts without exercising the DB.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

interface GroupContext {
  canonicalRoomTypeIds: Set<string>;
  memberRoomTypeIdsByCanonical: Map<string, string[]>;
  memberRoomTypeIdByTemplate: Map<string, string>;
}

// Mirror of the in-loop fan-out used by handleAvailNotifRQ
function resolveAvailTargets(canonicalOrRoomId: string, ctx: GroupContext): string[] {
  const memberIds = ctx.memberRoomTypeIdsByCanonical.get(canonicalOrRoomId);
  return memberIds && memberIds.length > 0 ? memberIds : [canonicalOrRoomId];
}

// Mirror of the rate-amount rewrite
function resolveRateRoom(canonicalOrRoomId: string, templateId: string | null, ctx: GroupContext): string {
  if (templateId && ctx.canonicalRoomTypeIds.has(canonicalOrRoomId)) {
    const memberRoom = ctx.memberRoomTypeIdByTemplate.get(templateId);
    if (memberRoom) return memberRoom;
  }
  return canonicalOrRoomId;
}

// SENSAN-shaped context
const ctx: GroupContext = {
  canonicalRoomTypeIds: new Set(["rt-1001"]),
  memberRoomTypeIdsByCanonical: new Map([
    ["rt-1001", ["rt-1006", "rt-1005", "rt-1004", "rt-1001-mem"]],
  ]),
  memberRoomTypeIdByTemplate: new Map([
    ["tpl-1004", "rt-1006"],
    ["tpl-1003", "rt-1005"],
    ["tpl-1002", "rt-1004"],
    ["tpl-1001", "rt-1001-mem"],
  ]),
};

Deno.test("inbound avail (canonical, no rateplan) → fan out to all member room_types", () => {
  const targets = resolveAvailTargets("rt-1001", ctx);
  assertEquals(targets.sort(), ["rt-1001-mem", "rt-1004", "rt-1005", "rt-1006"]);
});

Deno.test("inbound avail (non-canonical room) → write to room itself", () => {
  const targets = resolveAvailTargets("rt-other-double", ctx);
  assertEquals(targets, ["rt-other-double"]);
});

Deno.test("inbound rate (canonical + member template 1003) → rewrite to member rt-1005", () => {
  assertEquals(resolveRateRoom("rt-1001", "tpl-1003", ctx), "rt-1005");
});

Deno.test("inbound rate (canonical + member template 1002) → rewrite to member rt-1004", () => {
  assertEquals(resolveRateRoom("rt-1001", "tpl-1002", ctx), "rt-1004");
});

Deno.test("inbound rate (non-canonical room) → unchanged even with template", () => {
  assertEquals(resolveRateRoom("rt-other", "tpl-anything", ctx), "rt-other");
});

Deno.test("inbound rate (canonical + unknown template) → fall back to canonical room", () => {
  assertEquals(resolveRateRoom("rt-1001", "tpl-unknown", ctx), "rt-1001");
});

Deno.test("inbound rate (canonical + null template) → unchanged", () => {
  assertEquals(resolveRateRoom("rt-1001", null, ctx), "rt-1001");
});

Deno.test("regression: empty context → pass-through for both helpers", () => {
  const empty: GroupContext = {
    canonicalRoomTypeIds: new Set(),
    memberRoomTypeIdsByCanonical: new Map(),
    memberRoomTypeIdByTemplate: new Map(),
  };
  assertEquals(resolveAvailTargets("rt-x", empty), ["rt-x"]);
  assertEquals(resolveRateRoom("rt-x", "tpl-x", empty), "rt-x");
});
