import { ClipboardList } from "lucide-react";
import MemberPlaceholder from "./MemberPlaceholder";

const MemberCommonInfo = () => (
  <MemberPlaceholder
    title="常用資訊"
    icon={ClipboardList}
    description="儲存常用旅客資訊、聯絡人與收據發票選項，讓預訂更省時。"
    emptyText="尚未建立常用資訊"
  />
);

export default MemberCommonInfo;
