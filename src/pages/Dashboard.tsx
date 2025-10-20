import { Hotel, Users, Calendar, DollarSign } from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

const revenueData = [
  { month: "1月", 收入: 45000, 支出: 28000 },
  { month: "2月", 收入: 52000, 支出: 32000 },
  { month: "3月", 收入: 48000, 支出: 29000 },
  { month: "4月", 收入: 61000, 支出: 35000 },
  { month: "5月", 收入: 55000, 支出: 31000 },
  { month: "6月", 收入: 67000, 支出: 38000 },
];

const bookingData = [
  { month: "1月", 訂房: 145, 住客: 280 },
  { month: "2月", 訂房: 168, 住客: 320 },
  { month: "3月", 訂房: 152, 住客: 295 },
  { month: "4月", 訂房: 189, 住客: 365 },
  { month: "5月", 訂房: 176, 住客: 340 },
  { month: "6月", 訂房: 203, 住客: 395 },
];

const recentBookings = [
  { id: "B001", guest: "王小明", room: "豪華雙人房", checkIn: "2025-10-22", status: "已確認" },
  { id: "B002", guest: "李小華", room: "標準單人房", checkIn: "2025-10-23", status: "已確認" },
  { id: "B003", guest: "陳大同", room: "家庭套房", checkIn: "2025-10-24", status: "待確認" },
  { id: "B004", guest: "張美玲", room: "豪華雙人房", checkIn: "2025-10-25", status: "已確認" },
];

const Dashboard = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">儀表板</h1>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="總房間數"
          value="48"
          change="+2.5%"
          icon={Hotel}
          variant="coral"
        />
        <StatCard
          title="本月訂房"
          value="203"
          change="+15.3%"
          icon={Calendar}
          variant="green"
        />
        <StatCard
          title="住客人數"
          value="395"
          change="+8.1%"
          icon={Users}
          variant="blue"
        />
        <StatCard
          title="本月營收"
          value="$67k"
          change="+21.2%"
          icon={DollarSign}
          variant="purple"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>營收統計</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={revenueData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip />
                <Legend />
                <Bar dataKey="收入" fill="hsl(var(--chart-1))" radius={[8, 8, 0, 0]} />
                <Bar dataKey="支出" fill="hsl(var(--chart-4))" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>訂房趨勢</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={bookingData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="訂房" 
                  stroke="hsl(var(--chart-3))" 
                  strokeWidth={3}
                  dot={{ fill: "hsl(var(--chart-3))", r: 5 }}
                />
                <Line 
                  type="monotone" 
                  dataKey="住客" 
                  stroke="hsl(var(--chart-1))" 
                  strokeWidth={3}
                  dot={{ fill: "hsl(var(--chart-1))", r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>近期訂房</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">訂單編號</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">住客姓名</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">房型</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">入住日期</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">狀態</th>
                </tr>
              </thead>
              <tbody>
                {recentBookings.map((booking) => (
                  <tr key={booking.id} className="border-b transition-colors hover:bg-muted/50">
                    <td className="px-4 py-3 text-sm font-medium">{booking.id}</td>
                    <td className="px-4 py-3 text-sm">{booking.guest}</td>
                    <td className="px-4 py-3 text-sm">{booking.room}</td>
                    <td className="px-4 py-3 text-sm">{booking.checkIn}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                          booking.status === "已確認"
                            ? "bg-stat-green-light text-stat-green"
                            : "bg-stat-coral-light text-stat-coral"
                        }`}
                      >
                        {booking.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="mt-8 border-t pt-6 text-center text-sm text-muted-foreground">
        <p>© 2025 人客多 PMS 旅宿管理系統. 版權所有</p>
      </div>
    </div>
  );
};

export default Dashboard;
