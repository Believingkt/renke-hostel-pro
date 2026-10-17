type TemplateRow = {
  id: string;
  accommodation_id: string;
  created_at?: string;
  updated_at?: string;
  numeric_code?: number | null;
  default_package_id?: string | null;
  room_type_id?: string | null;
  room_type_ids?: string[] | null;
};

type OmittedKeys = "id" | "created_at" | "updated_at" | "numeric_code";

// 複製民宿的專案：不帶方案綁定與全域唯一編號，房型換成新館對應房型；無法對應的清空
export function cloneTemplatesForAccommodation<T extends TemplateRow>(
  templates: T[],
  newAccommodationId: string,
  roomTypeMap: Record<string, string>,
) {
  return templates.map((template) => {
    const { id, created_at, updated_at, numeric_code, ...rest } = template;
    return {
      ...(rest as Omit<T, OmittedKeys>),
      accommodation_id: newAccommodationId,
      default_package_id: null,
      room_type_id: template.room_type_id ? roomTypeMap[template.room_type_id] ?? null : null,
      room_type_ids: (template.room_type_ids ?? [])
        .map((rid) => roomTypeMap[rid])
        .filter((rid): rid is string => !!rid),
    };
  });
}
