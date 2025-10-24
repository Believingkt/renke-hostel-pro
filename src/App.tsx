import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ConditionalLayout } from "@/components/ConditionalLayout";
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
        <Route element={<ConditionalLayout />}>
          <Route path="/booking" element={<Booking />} />
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
