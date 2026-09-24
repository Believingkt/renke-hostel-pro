import { Loader2 } from "lucide-react";
import { Button } from "@lakeze/shared/components/ui/button";
import { isAppleSignInAvailable } from "@/lib/appleSignIn";

interface AppleSignInButtonProps {
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
  className?: string;
}

/**
 * Sign in with Apple button — Apple HIG compliant:
 * black background, white label, Apple logo, full width,
 * height not smaller than the other social buttons.
 * Renders only inside the native iOS app.
 */
const AppleSignInButton = ({ onClick, loading, disabled, className }: AppleSignInButtonProps) => {
  if (!isAppleSignInAvailable()) return null;

  return (
    <Button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className={`w-full h-11 bg-black text-white hover:bg-black/90 border border-black font-medium ${className ?? ""}`}
    >
      {loading ? (
        <>
          <Loader2 className="w-5 h-5 mr-2 animate-spin" />
          正在使用 Apple 登入...
        </>
      ) : (
        <>
          <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
          </svg>
          使用 Apple 登入
        </>
      )}
    </Button>
  );
};

export default AppleSignInButton;
