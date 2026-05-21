import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTeam } from "@/components/team/TeamContext";

const SOURCES = [
  "成交獎金",
  "影音獎金",
  "星探獎金",
  "管理獎金",
  "特許加盟",
  "星鏈",
  "KOL 分潤",
];

export default function TeamHome() {
  const { displayName } = useTeam();
  const fmt = (n: number) =>
    new Intl.NumberFormat("zh-TW", {
      style: "currency",
      currency: "TWD",
      maximumFractionDigits: 0,
    }).format(n);

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h2 className="text-2xl font-bold">歡迎回來，{displayName}</h2>
        <p className="text-muted-foreground mt-1">查看您本月的業績與獎金分布</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">本月預估總收入</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-4xl font-bold text-primary">{fmt(0)}</p>
        </CardContent>
      </Card>

      <div>
        <h3 className="text-lg font-semibold mb-3">各來源獎金</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SOURCES.map((s) => (
            <Card key={s}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground font-medium">
                  {s}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{fmt(0)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
