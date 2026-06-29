// Pure helpers for OwlTing package-group outbound mapping.
//
// When an order's room_type belongs to an `owlting_room_type_groups` member,
// outbound RoomTypeCode is replaced by the group's canonical numeric_code and
// the RatePlanCode is replaced by the member's mapped rate-plan template
// numeric_code (per-headcount package). This consolidates "1 room_type per
// headcount" into OwlTing's "1 canonical room + multiple rate plans" model.

export interface GroupMember {
  group_id: string;
  room_type_id: string;             // member room_type
  rate_plan_template_id: string;
  rate_plan_template_numeric_code: number | null;
  rate_plan_name: string;
}

export interface GroupCanonical {
  group_id: string;
  canonical_room_type_id: string;
  canonical_numeric_code: number | null;
  canonical_name: string;
}

export interface MappingTables {
  canonicalByGroupId: Map<string, GroupCanonical>;
  memberByRoomTypeId: Map<string, GroupMember>;
}

export interface OutboundMapping {
  roomTypeCode: number;
  ratePlanCode: number;
  roomTypeName?: string;
  ratePlanName?: string;
  original: {
    room_type_id: string;
    room_type_code: number | null;
    rate_plan_code_from_package: number | null;
  };
  converted: {
    canonical_room_type_id: string;
    canonical_room_type_code: number;
    rate_plan_template_id: string;
    rate_plan_code: number;
  };
  /** true => RoomTypeCode/RatePlanCode were rewritten because the room_type is a group member. */
  remapped: boolean;
}

export interface OutboundInput {
  room_type_id: string;
  /** room_types.numeric_code for the original member room_type (informational). */
  original_room_type_code: number | null;
  /** ratePlanCode resolved from order.package_id (used only when NOT in a group). */
  fallback_rate_plan_code: number | null;
  fallback_rate_plan_name?: string;
  fallback_room_type_name?: string;
}

export function buildMappingTables(
  groups: { id: string; canonical_room_type_id: string; canonical_name: string }[],
  canonicalRoomTypes: { id: string; numeric_code: number | null }[],
  members: {
    group_id: string;
    room_type_id: string;
    rate_plan_template_id: string;
    rate_plan_name: string;
    rate_plan_template_numeric_code: number | null;
  }[],
): MappingTables {
  const canonicalById = new Map(canonicalRoomTypes.map((r) => [r.id, r]));
  const canonicalByGroupId = new Map<string, GroupCanonical>();
  for (const g of groups) {
    const c = canonicalById.get(g.canonical_room_type_id);
    canonicalByGroupId.set(g.id, {
      group_id: g.id,
      canonical_room_type_id: g.canonical_room_type_id,
      canonical_numeric_code: c?.numeric_code ?? null,
      canonical_name: g.canonical_name,
    });
  }
  const memberByRoomTypeId = new Map<string, GroupMember>();
  for (const m of members) memberByRoomTypeId.set(m.room_type_id, m);
  return { canonicalByGroupId, memberByRoomTypeId };
}

export function mapOutboundStay(
  input: OutboundInput,
  tables: MappingTables,
): OutboundMapping | { error: string } {
  const member = tables.memberByRoomTypeId.get(input.room_type_id);
  if (member) {
    const canonical = tables.canonicalByGroupId.get(member.group_id);
    if (!canonical || canonical.canonical_numeric_code == null) {
      return { error: `canonical room_type has no numeric_code for group ${member.group_id}` };
    }
    if (member.rate_plan_template_numeric_code == null) {
      return { error: `member rate_plan_template ${member.rate_plan_template_id} missing numeric_code` };
    }
    return {
      roomTypeCode: canonical.canonical_numeric_code,
      ratePlanCode: member.rate_plan_template_numeric_code,
      roomTypeName: canonical.canonical_name,
      ratePlanName: member.rate_plan_name,
      original: {
        room_type_id: input.room_type_id,
        room_type_code: input.original_room_type_code,
        rate_plan_code_from_package: input.fallback_rate_plan_code,
      },
      converted: {
        canonical_room_type_id: canonical.canonical_room_type_id,
        canonical_room_type_code: canonical.canonical_numeric_code,
        rate_plan_template_id: member.rate_plan_template_id,
        rate_plan_code: member.rate_plan_template_numeric_code,
      },
      remapped: true,
    };
  }
  // Not in a group → keep original code, use fallback package as RatePlanCode.
  if (input.original_room_type_code == null) {
    return { error: `room_type ${input.room_type_id} has no numeric_code` };
  }
  if (input.fallback_rate_plan_code == null) {
    return { error: "no rate plan: order.package_id missing and room_type is not in a group" };
  }
  return {
    roomTypeCode: input.original_room_type_code,
    ratePlanCode: input.fallback_rate_plan_code,
    roomTypeName: input.fallback_room_type_name,
    ratePlanName: input.fallback_rate_plan_name,
    original: {
      room_type_id: input.room_type_id,
      room_type_code: input.original_room_type_code,
      rate_plan_code_from_package: input.fallback_rate_plan_code,
    },
    converted: {
      canonical_room_type_id: input.room_type_id,
      canonical_room_type_code: input.original_room_type_code,
      rate_plan_template_id: "",
      rate_plan_code: input.fallback_rate_plan_code,
    },
    remapped: false,
  };
}
