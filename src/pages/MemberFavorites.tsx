import { Heart } from "lucide-react";
import MemberPlaceholder from "./MemberPlaceholder";

const MemberFavorites = () => (
  <MemberPlaceholder
    title="已收藏"
    icon={Heart}
    description="收藏您感興趣的住宿，隨時回來查看價格與可訂日期。"
    emptyText="尚未收藏任何住宿"
  />
);

export default MemberFavorites;
