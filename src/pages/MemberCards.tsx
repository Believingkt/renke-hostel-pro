import { CreditCard } from "lucide-react";
import MemberPlaceholder from "./MemberPlaceholder";

const MemberCards = () => (
  <MemberPlaceholder
    title="卡片管理"
    icon={CreditCard}
    description="安全地管理您的付款卡片，訂房時可快速結帳。"
    emptyText="尚未新增任何卡片"
  />
);

export default MemberCards;
