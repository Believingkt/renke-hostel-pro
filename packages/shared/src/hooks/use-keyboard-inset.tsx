import * as React from "react";

/**
 * Returns the height (in CSS pixels) currently obscured by the on-screen keyboard
 * on mobile devices, using the VisualViewport API. Returns 0 when no keyboard
 * is shown or on platforms that don't expose visualViewport.
 *
 * Also auto-scrolls the focused input into view when the keyboard appears.
 */
export function useKeyboardInset() {
  const [inset, setInset] = React.useState(0);

  React.useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!vv) return;

    const update = () => {
      // Difference between layout viewport and visual viewport ≈ keyboard height
      const diff = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setInset(diff > 80 ? diff : 0);
    };

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  // Scroll focused field into view when keyboard opens
  React.useEffect(() => {
    const onFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const tag = target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable) {
        setTimeout(() => {
          target.scrollIntoView({ block: "center", behavior: "smooth" });
        }, 250);
      }
    };
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, []);

  return inset;
}
