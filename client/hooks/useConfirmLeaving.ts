import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export function useConfirmLeaving(confirmMessage = "Leave and end the call?") {
  const navigate = useNavigate();

  useEffect(() => {
    // push a dummy state so popstate triggers
    window.history.pushState({ stay: true }, "");

    const onPopState = (e: PopStateEvent) => {
      // show custom confirm
      const ok = window.confirm(confirmMessage);
      if (ok) {
        // allow navigation: remove this push state and go back
        window.history.back();
      } else {
        // prevent navigation by re-pushing the state
        window.history.pushState({ stay: true }, "");
      }
    };

    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
      // clean up the extra entry if any
      try { window.history.back(); } catch {}
    };
  }, [confirmMessage, navigate]);
}
