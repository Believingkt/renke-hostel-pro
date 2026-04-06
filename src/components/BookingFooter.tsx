import { useNavigate } from "react-router-dom";
import { ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import lokezeLogo from "@/assets/lokeze-logo.png";

const BookingFooter = () => {
  const navigate = useNavigate();

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <footer
      className="border-t border-border relative bg-white"
    >
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src={lokezeLogo} alt="Lakeze 人客多" className="h-24 object-contain" />
          </div>
          <div className="flex gap-6 text-sm text-muted-foreground">
            <button onClick={() => navigate("/member/auth")} className="hover:text-foreground transition-colors">
              會員中心
            </button>
            <button className="hover:text-foreground transition-colors">關於我們</button>
            <button className="hover:text-foreground transition-colors">聯繫客服</button>
          </div>
          <p className="text-sm text-white/50">
            © {new Date().getFullYear()} 人客多. All rights reserved.
          </p>
        </div>
      </div>

      {/* 返回頂部按鈕 */}
      <Button
        variant="outline"
        size="icon"
        onClick={scrollToTop}
        className="absolute right-6 -top-5 rounded-full h-10 w-10 bg-white border-border shadow-md hover:bg-accent"
        aria-label="返回頂部"
      >
        <ArrowUp className="h-4 w-4" />
      </Button>
    </footer>
  );
};

export default BookingFooter;
