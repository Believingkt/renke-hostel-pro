import { Home, Users, Maximize2, MapPin } from "lucide-react";

interface Props {
  totalRooms: number;
  minCapacity: number;
  maxCapacity: number;
  totalSize?: number | null;
  region?: string | null;
}

/**
 * 包棟總覽資訊條：強調全棟容納量
 * 位於圖片下方，標題之前
 */
const VillaOverviewBar = ({
  totalRooms,
  minCapacity,
  maxCapacity,
  totalSize,
  region,
}: Props) => {
  return (
    <div className="px-4 py-3 bg-card border-b border-border/40">
      <div className="grid grid-cols-3 gap-2">
        <Stat
          icon={<Home className="h-4 w-4" />}
          value={`${totalRooms}`}
          label="三代同堂剛剛好"
        />
        <Stat
          icon={<Users className="h-4 w-4" />}
          value={
            minCapacity === maxCapacity
              ? `${maxCapacity}`
              : `${minCapacity}~${maxCapacity}`
          }
          label="人都住得下"
        />
        {totalSize ? (
          <Stat
            icon={<Maximize2 className="h-4 w-4" />}
            value={`${totalSize}`}
            label="坪・烤肉派對 ok"
          />
        ) : (
          <Stat
            icon={<MapPin className="h-4 w-4" />}
            value={region || "—"}
            label="景觀環繞"
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
