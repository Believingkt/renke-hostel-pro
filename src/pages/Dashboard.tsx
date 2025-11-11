import { Hotel, Users, Calendar, DollarSign } from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Info } from "lucide-react";

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
  { month: "1月", "2025年": 45000, "2024年": 38000 },
  { month: "2月", "2025年": 52000, "2024年": 43000 },
  { month: "3月", "2025年": 48000, "2024年": 41000 },
  { month: "4月", "2025年": 61000, "2024年": 52000 },
  { month: "5月", "2025年": 55000, "2024年": 47000 },
  { month: "6月", "2025年": 67000, "2024年": 58000 },
  { month: "7月", "2025年": 59000, "2024年": 51000 },
  { month: "8月", "2025年": 64000, "2024年": 55000 },
  { month: "9月", "2025年": 57000, "2024年": 49000 },
  { month: "10月", "2025年": 62000, "2024年": 53000 },
  { month: "11月", "2025年": 58000, "2024年": 50000 },
  { month: "12月", "2025年": 70000, "2024年": 60000 },
];

const bookingData = [
  { month: "1月", "2025年": 145, "2024年": 130 },
  { month: "2月", "2025年": 168, "2024年": 155 },
  { month: "3月", "2025年": 152, "2024年": 140 },
  { month: "4月", "2025年": 189, "2024年": 172 },
  { month: "5月", "2025年": 176, "2024年": 165 },
  { month: "6月", "2025年": 203, "2024年": 188 },
  { month: "7月", "2025年": 195, "2024年": 180 },
  { month: "8月", "2025年": 210, "2024年": 195 },
  { month: "9月", "2025年": 182, "2024年": 170 },
  { month: "10月", "2025年": 198, "2024年": 185 },
  { month: "11月", "2025年": 187, "2024年": 175 },
  { month: "12月", "2025年": 220, "2024年": 200 },
];

const recentBookings = [
  { id: "B001", guest: "王小明", room: "豪華雙人房", checkIn: "2025-10-22", status: "已確認" },
  { id: "B002", guest: "李小華", room: "標準單人房", checkIn: "2025-10-23", status: "已確認" },
  { id: "B003", guest: "陳大同", room: "家庭套房", checkIn: "2025-10-24", status: "待確認" },
  { id: "B004", guest: "張美玲", room: "豪華雙人房", checkIn: "2025-10-25", status: "已確認" },
];

const Dashboard = () => {
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    const getCachedSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUserId(session.user.id);
        setUserEmail(session.user.email || null);
      }
    };
    getCachedSession();
  }, []);

  return (
    <div className="space-y-6 md:space-y-8">
      <div className="px-2 md:px-0">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">營運分析</h1>
      </div>

      {userId && (
        <Alert className="mx-2 md:mx-0">
          <Info className="h-4 w-4" />
          <AlertTitle>您的用戶資訊</AlertTitle>
          <AlertDescription className="mt-2 space-y-1">
            <p className="text-sm"><strong>Email:</strong> {userEmail}</p>
            <p className="text-sm font-mono break-all"><strong>User ID:</strong> {userId}</p>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:gap-6 sm:grid-cols-2 lg:grid-cols-4 px-2 md:px-0">
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

      <div className="grid gap-4 md:gap-6 lg:grid-cols-2 px-2 md:px-0">
        <Card className="shadow-card hover:shadow-card-hover transition-base">
          <CardHeader>
            <CardTitle className="text-lg md:text-xl">營收統計</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={revenueData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip />
                <Legend />
                <Bar dataKey="2025年" fill="hsl(var(--chart-1))" radius={[8, 8, 0, 0]} />
                <Bar dataKey="2024年" fill="hsl(var(--chart-4))" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="shadow-card hover:shadow-card-hover transition-base">
          <CardHeader>
            <CardTitle className="text-lg md:text-xl">訂房趨勢</CardTitle>
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
                  dataKey="2025年" 
                  stroke="hsl(var(--chart-3))" 
                  strokeWidth={3}
                  dot={{ fill: "hsl(var(--chart-3))", r: 5 }}
                />
                <Line 
                  type="monotone" 
                  dataKey="2024年" 
                  stroke="hsl(var(--chart-1))" 
                  strokeWidth={3}
                  dot={{ fill: "hsl(var(--chart-1))", r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-card px-2 md:px-0 mx-2 md:mx-0">
        <CardHeader>
          <CardTitle className="text-lg md:text-xl">近期訂房</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto scrollbar-thin -mx-2 md:mx-0">
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

      
    </div>
  );
};

export default Dashboard;
