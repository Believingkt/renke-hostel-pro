import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ConditionalLayout } from "@/components/ConditionalLayout";
import { AccommodationProvider } from "@/contexts/AccommodationContext";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import ChangePassword from "./pages/ChangePassword";
import BookingFlow from "./pages/BookingFlow";
import Dashboard from "./pages/Dashboard";
import Reception from "./pages/Reception";
import WebsiteContent from "./pages/WebsiteContent";
import Faq from "./pages/Faq";
import Orders from "./pages/Orders";
import BasicInfo from "./pages/BasicInfo";
import Pricing from "./pages/Pricing";
import Accounts from "./pages/Accounts";
import KolDiscount from "./pages/KolDiscount";
import Availability from "./pages/Availability";
import UserRoles from "./pages/UserRoles";
import Headquarters from "./pages/Headquarters";
import Customers from "./pages/Customers";
import OgImagePreview from "./pages/OgImagePreview";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AccommodationProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<ConditionalLayout />}>
            <Route path="/" element={<Index />} />
            <Route path="/booking" element={<BookingFlow />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/change-password" element={<ChangePassword />} />
            <Route path="/hq" element={<Headquarters />} />
            <Route path="/admin" element={<Dashboard />} />
            <Route path="/admin/reception" element={<Reception />} />
            <Route path="/admin/website-content" element={<WebsiteContent />} />
            <Route path="/admin/faq" element={<Faq />} />
            <Route path="/admin/orders" element={<Orders />} />
            <Route path="/admin/basic-info" element={<BasicInfo />} />
            <Route path="/admin/pricing" element={<Pricing />} />
            <Route path="/admin/accounts" element={<Accounts />} />
            <Route path="/admin/discount-codes" element={<KolDiscount />} />
            <Route path="/admin/availability" element={<Availability />} />
            <Route path="/admin/user-roles" element={<UserRoles />} />
            <Route path="/admin/customers" element={<Customers />} />
            <Route path="/og-preview" element={<OgImagePreview />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AccommodationProvider>
  </QueryClientProvider>
);

export default App;
