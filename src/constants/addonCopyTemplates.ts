import type { AddonPlan } from "@/components/website-content/AddonPlansSection";

export interface AddonCopyTemplate {
  id: string;
  label: string;
  hint: string;
  /** 套用時要寫入的欄位（僅文案相關，不動價格與數量） */
  values: Pick<AddonPlan, "description" | "unit_label"> & { detailed_description: string };
}

export const ADDON_COPY_TEMPLATES: AddonCopyTemplate[] = [
  {
    id: "pet",
    label: "寵物入住",
    hint: "名稱：寵物入住・單位：隻",
    values: {
      description: "寵物入住",
      unit_label: "隻",
      detailed_description:
        "<ul><li>每隻寵物每晚計價，入住期間需全程由飼主陪同。</li><li>提供寵物睡墊與食碗，不含寵物食品。</li><li>請自備牽繩與尿布墊，公共區域請勿放養。</li><li>如造成布品或家具損壞，將依實際維修費用另行收取。</li></ul>",
    },
  },
  {
    id: "meal",
    label: "早餐／餐食",
    hint: "名稱：在地風味早餐・單位：人",
    values: {
      description: "在地風味早餐",
      unit_label: "人",
      detailed_description:
        "<ul><li>每人每日計價，供應時間 08:00–10:00。</li><li>菜色依季節食材調整，如有素食或過敏需求請於備註告知。</li><li>需於入住前一日 18:00 前確認人數，逾期恕不受理。</li></ul>",
    },
  },
  {
    id: "amenity",
    label: "加備品（不加床）",
    hint: "名稱：加備品・單位：份",
    values: {
      description: "加備品",
      unit_label: "份",
      detailed_description:
        "<ul><li>每份含毛巾、浴巾、盥洗用品與寢具備品一套。</li><li>僅提供備品，不含加床服務。</li><li>數量以房型可容納人數為上限。</li></ul>",
    },
  },
  {
    id: "extra_bed",
    label: "加床",
    hint: "名稱：加床・單位：床",
    values: {
      description: "加床",
      unit_label: "床",
      detailed_description:
        "<ul><li>每床每晚計價，含床墊與整套寢具備品。</li><li>受房型空間限制，實際可加床數以現場為準。</li><li>請於訂房時先行預訂，現場不保證有空床。</li></ul>",
    },
  },
  {
    id: "experience",
    label: "體驗／門票",
    hint: "名稱：在地體驗・單位：人",
    values: {
      description: "在地體驗",
      unit_label: "人",
      detailed_description:
        "<ul><li>每人計價，體驗時間約 60–90 分鐘。</li><li>需事先預約，遇天候不佳將協助改期或全額退費。</li><li>未滿 12 歲需由成人陪同參加。</li></ul>",
    },
  },
  {
    id: "transfer",
    label: "接送服務",
    hint: "名稱：車站接送・單位：趟",
    values: {
      description: "車站接送",
      unit_label: "趟",
      detailed_description:
        "<ul><li>單趟計價，最多可搭載 4 位旅客與隨身行李。</li><li>請於入住前一日提供班次與抵達時間。</li><li>臨時取消需於 3 小時前告知，否則將收取全額費用。</li></ul>",
    },
  },
];
