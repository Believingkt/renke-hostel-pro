import { Home, Users, Maximize2, MapPin } from "lucide-react";

export interface VillaOverviewLabels {
  rooms?: string | null;
  capacity?: string | null;
  size?: string | null;
  region?: string | null;
}

interface Props {
  totalRooms: number;
  minCapacity: number;
  maxCapacity: number;
  totalSize?: number | null;
  region?: string | null;
  labels?: VillaOverviewLabels | null;
}

/**
 * 包棟總覽資訊條：強調全棟容納量
 * 位於圖片下方，標題之前
 * labels 可由 HQ 後台覆寫，未設定則使用預設文案
 */
const VillaOverviewBar = ({
  totalRooms,
  minCapacity,
  maxCapacity,
  totalSize,
  region,
  labels,
}: Props) => {
  const roomsLabel = labels?.rooms || "三代同堂剛剛好";
  const capacityLabel = labels?.capacity || "人都住得下";
  const sizeLabel = labels?.size || "坪・烤肉派對 ok";
  const regionLabel = labels?.region || "景觀環繞";

  return (
    <div className="px-4 py-3 bg-card border-b border-border/40">
      <div className="grid grid-cols-3 gap-2">
        <Stat
          icon={<Home className="h-4 w-4" />}
          value={`${totalRooms}`}
          label={roomsLabel}
        />
        <Stat
          icon={<Users className="h-4 w-4" />}
          value={
            minCapacity === maxCapacity
              ? `${maxCapacity}`
              : `${minCapacity}~${maxCapacity}`
          }
          label={capacityLabel}
        />
        {totalSize ? (
          <Stat
            icon={<Maximize2 className="h-4 w-4" />}
            value={`${totalSize}`}
            label={sizeLabel}
          />
        ) : (
          <Stat
            icon={<MapPin className="h-4 w-4" />}
            value={region || "—"}
            label={regionLabel}
            small
          />
        )}
      </div>
    </div>
  );
};

const Stat = ({
  icon,
  value,
  label,
  small = false,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
  small?: boolean;
}) => (
  <div className="flex flex-col items-center text-center">
    <div
      className="flex items-center gap-1 mb-0.5"
      style={{ color: "hsl(25, 70%, 45%)" }}
    >
      {icon}
    </div>
    <p
      className={`font-bold leading-none ${small ? "text-sm" : "text-lg"}`}
      style={{ color: "hsl(25, 60%, 25%)" }}
    >
      {value}
    </p>
    <p className="text-[10px] text-muted-foreground mt-1">{label}</p>
  </div>
);

export default VillaOverviewBar;
