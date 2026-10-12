// 後台「專案」欄位顯示順序（純顯示，不改任何寫入邏輯）：
//   (1) orders.pricing_template_id 對應的專案名稱
//   (2) orders.package_id 對應的方案名稱
//   (3) 都查不到 → null，由呼叫端沿用現行 meal_plan 顯示
export interface ProjectLabelTemplate {
  id: string;
  template_name?: string | null;
  project_name?: string | null;
}

export interface ProjectLabelPackage {
  id: string;
  name?: string | null;
}

export function resolveOrderProjectDisplayName(input: {
  pricingTemplateId?: string | null;
  templates?: ProjectLabelTemplate[] | null;
  packageId?: string | null;
  packages?: ProjectLabelPackage[] | null;
}): string | null {
  const templates = Array.isArray(input.templates) ? input.templates : [];
  const packages = Array.isArray(input.packages) ? input.packages : [];

  if (input.pricingTemplateId) {
    const tpl = templates.find((t) => t && t.id === input.pricingTemplateId);
    const name = (tpl?.template_name || tpl?.project_name || "").trim();
    if (name) return name;
  }

  if (input.packageId) {
    const pkg = packages.find((p) => p && p.id === input.packageId);
    const name = (pkg?.name || "").trim();
    if (name) return name;
  }

  return null;
}
