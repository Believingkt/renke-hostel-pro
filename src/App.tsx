import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ConditionalLayout } from "@/components/ConditionalLayout";
import Index from "./pages/Index";
import Dashboard from "./pages/Dashboard";
import Reception from "./pages/Reception";
import Orders from "./pages/Orders";
import BasicInfo from "./pages/BasicInfo";
import Pricing from "./pages/Pricing";
import Accounts from "./pages/Accounts";
import KolDiscount from "./pages/KolDiscount";
import Availability from "./pages/Availability";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <Routes>
        <Route element={<ConditionalLayout />}>
          <Route path="/" element={<Index />} />
          <Route path="/admin" element={<Dashboard />} />
          <Route path="/admin/reception" element={<Reception />} />
          <Route path="/admin/orders" element={<Orders />} />
          <Route path="/admin/basic-info" element={<BasicInfo />} />
          <Route path="/admin/pricing" element={<Pricing />} />
          <Route path="/admin/accounts" element={<Accounts />} />
          <Route path="/admin/discount-codes" element={<KolDiscount />} />
          <Route path="/admin/availability" element={<Availability />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </QueryClientProvider>
);

export default App;
