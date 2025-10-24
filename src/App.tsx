import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { BackendLayout } from "@/components/BackendLayout";
import Dashboard from "./pages/Dashboard";
import Reception from "./pages/Reception";
import Orders from "./pages/Orders";
import BasicInfo from "./pages/BasicInfo";
import Pricing from "./pages/Pricing";
import Accounts from "./pages/Accounts";
import KolDiscount from "./pages/KolDiscount";
import Availability from "./pages/Availability";
import Booking from "./pages/Booking";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <Routes>
        {/* 前台訂房網站 - 獨立路由 */}
        <Route path="/booking" element={<Booking />} />
        
        {/* PMS 後台管理系統 - 使用 BackendLayout */}
        <Route element={<BackendLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/reception" element={<Reception />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/basic-info" element={<BasicInfo />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/accounts" element={<Accounts />} />
          <Route path="/discount-codes" element={<KolDiscount />} />
          <Route path="/availability" element={<Availability />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </QueryClientProvider>
);

export default App;
