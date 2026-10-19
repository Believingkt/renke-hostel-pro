import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import "@lakeze/shared/index.css";
import { AdminPageHeader } from "@lakeze/shared/components/AdminPageHeader";
import { FlowChooser } from "@/components/onboarding-wizard/FlowChooser";
import { WizardBody } from "@/components/onboarding-wizard/WizardBody";
import { PrecheckList } from "@/components/onboarding-wizard/PrecheckList";
import { WIZARD_STEPS } from "@/lib/onboarding/wizardSteps";
import { PRECHECK } from "./mockSupabase";

const view = new URLSearchParams(location.search).get("view") ?? "flow";
const rt = { id: "rt1", name: "整棟包棟", capacity: 8, base_price: 8000, room_count: 1 };
const data: any = {
  isActive: false, loading: false, locked: false, finalCheck: null, reload: async () => undefined,
  basicInfo: { name: "礁溪山嵐包棟民宿", address: "宜蘭縣礁溪鄉溫泉路 1 號", phone: "03-987-6543", description: "位於礁溪溫泉區的獨棟包棟民宿，三間房最多可住 8 人，附私人湯池與烤肉區，步行 5 分鐘到湯圍溝公園。", short_url_alias: "sanlan" },
  roomTypes: [rt],
  packages: [{ id: "p1", name: "包棟・含早餐", enabled: true, guest_count: 8, primary_room_type_id: "rt1", tier_prices: { weekday: { sale: 8000, original: 9000 }, friday_sunday: { sale: 9000, original: 10000 }, weekend: { sale: 10000, original: 11000 } } }],
  templates: [{ id: "t1", template_name: "包棟・含早餐", room_type_id: "rt1", default_package_id: "p1" }],
};
const step = Math.max(0, WIZARD_STEPS.findIndex((s) => s.key === view));

function App() {
  return (
    <MemoryRouter>
      <div className="min-h-screen bg-background p-4 sm:p-8">
        <div className="mx-auto max-w-5xl space-y-6">
          <AdminPageHeader title="上架精靈" description="一步一步填好基本資料、房型、方案與庫存，完成後送總部審核開賣。" />
          {view === "flow" && <FlowChooser value="single" onChoose={() => undefined} />}
          {view === "hq" && <div className="max-w-xl rounded-md border p-3"><p className="mb-2 text-sm font-medium">開賣前檢查（業主已送審）</p><PrecheckList result={PRECHECK as any} audience="hq" /></div>}
          {view !== "flow" && view !== "hq" && (
            <WizardBody accommodationId="acc" data={data} flow="single" step={step} precheck={PRECHECK as any} onStep={() => undefined} onChanged={() => undefined} />
          )}
        </div>
      </div>
    </MemoryRouter>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
