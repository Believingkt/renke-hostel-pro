import { History } from "lucide-react";
import MemberPlaceholder from "./MemberPlaceholder";

const MemberRecentViews = () => (
  <MemberPlaceholder
    title="最近瀏覽"
    icon={History}
    description="快速回到您近期瀏覽過的住宿與行程，讓下次訂房更方便。"
    emptyText="尚無瀏覽紀錄"
  />
);

export default MemberRecentViews;
