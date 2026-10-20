import { templateMatchesRoomType } from "@/utils/templateRoomMatch";

/** 後台建單／編輯訂單：專案清單與「對應方案（orders.package_id）」的推導規則 */

export interface TemplateLite {
  id: string;
  template_name: string;
  room_type_id?: string | null;
  room_type_ids?: string[] | null;
  valid_from?: string | null;
  valid_until?: string | null;
  default_package_id?: string | null;
}

export interface PackageLite {
  id: string;
  name: string;
  guest_count: number;
  primary_room_type_id?: string | null;
  room_type_ids?: string[] | null;
}

/** bound＝有綁此房型；unbound＝通用專案；fallback_all＝找不到對應專案，退回列出全館專案 */
export type TemplateListSource = "bound" | "unbound" | "fallback_all" | "empty";

const hasRoomBinding = (t: TemplateLite) =>
  (Array.isArray(t.room_type_ids) && t.room_type_ids.length > 0) || !!t.room_type_id;

export function selectTemplatesForRoomType<T extends TemplateLite>(
  templates: T[],
  roomTypeId: string,
  stayDates: string[],
): { list: T[]; source: TemplateListSource } {
  if (!roomTypeId || templates.length === 0) return { list: [], source: "empty" };
  const inValidRange = (t: T) => {
    const vf = t.valid_from || null;
    const vu = t.valid_until || null;
    if (!vf && !vu) return true;
    if (stayDates.length === 0) return true;
    return stayDates.every((d) => (!vf || d >= vf) && (!vu || d <= vu));
  };
  const bound = templates.filter((t) => hasRoomBinding(t) && templateMatchesRoomType(t, roomTypeId) && inValidRange(t));
  if (bound.length > 0) return { list: bound, source: "bound" };
  const unbound = templates.filter((t) => !hasRoomBinding(t) && inValidRange(t));
  if (unbound.length > 0) return { list: unbound, source: "unbound" };
  const all = templates.filter(inValidRange);
  return { list: all, source: all.length > 0 ? "fallback_all" : "empty" };
}

export function packageCoversRoomType(pkg: PackageLite, roomTypeId: string): boolean {
  if (!roomTypeId) return false;
  if (pkg.primary_room_type_id === roomTypeId) return true;
  return Array.isArray(pkg.room_type_ids) && pkg.room_type_ids.includes(roomTypeId);
}

export interface RoomPick {
  room_type_id: string;
  template_id: string;
}

export interface PackageResolution {
  /** auto＝由第一間房專案帶入；manual＝通路館且專案未綁方案，限選涵蓋房型的方案；none＝非通路館且專案未綁方案 */
  mode: "auto" | "manual" | "none";
  packageId: string | null;
  packageName: string | null;
  options: PackageLite[];
  /** 各房專案綁定的方案不同 */
  conflict: boolean;
  roomPackages: Array<{ room_type_id: string; packageId: string | null; packageName: string | null }>;
}

export function resolveOrderPackage(params: {
  rooms: RoomPick[];
  templates: TemplateLite[];
  packages: PackageLite[];
  hasChannel: boolean;
}): PackageResolution {
  const { rooms, templates, packages, hasChannel } = params;
  const nameOf = (id: string | null) => (id ? packages.find((p) => p.id === id)?.name ?? null : null);
  const roomPackages = rooms.map((r) => {
    const pkgId = templates.find((t) => t.id === r.template_id)?.default_package_id || null;
    return { room_type_id: r.room_type_id, packageId: pkgId, packageName: nameOf(pkgId) };
  });
  const distinct = new Set(roomPackages.map((r) => r.packageId).filter(Boolean));
  const conflict = distinct.size > 1;
  const primary = roomPackages[0];
  if (primary?.packageId) {
    return { mode: "auto", packageId: primary.packageId, packageName: primary.packageName, options: [], conflict, roomPackages };
  }
  if (hasChannel && rooms[0]?.room_type_id) {
    const options = packages.filter((p) => packageCoversRoomType(p, rooms[0].room_type_id));
    return { mode: "manual", packageId: null, packageName: null, options, conflict, roomPackages };
  }
  return { mode: "none", packageId: null, packageName: null, options: [], conflict, roomPackages };
}

/** 實際寫入 orders.package_id 的值 */
export function finalPackageId(res: PackageResolution, manualPick: string | null | undefined): string | null {
  if (res.mode === "auto") return res.packageId;
  if (res.mode === "manual" && manualPick && res.options.some((p) => p.id === manualPick)) return manualPick;
  return null;
}

/** 房型＋專案組合的比對鍵；complete＝每間房都已有房型與專案 */
export function roomTemplateKey(rooms: RoomPick[]): { key: string; complete: boolean } {
  return {
    key: rooms.map((r) => `${r.room_type_id}:${r.template_id}`).join(","),
    complete: rooms.length > 0 && rooms.every((r) => !!r.room_type_id && !!r.template_id),
  };
}
