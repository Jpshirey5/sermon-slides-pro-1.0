import { useEffect, useState } from "react";
import { toast } from "sonner";
import { SCREEN_COMMAND_EVENT, type ScreenCommandDetail, type SspDesktop } from "./bridge";
import { ScreenSetupDialog } from "./ScreenSetupDialog";

/**
 * Handles the Screens menu in the desktop app. Set Up Screens opens here on
 * any page; Open Main Screen and Open Stage Display go to the service screen,
 * which is the only place that can open them.
 */
export function DesktopScreens({ desktop }: { desktop: SspDesktop }) {
  const [setupOpen, setSetupOpen] = useState(false);

  useEffect(
    () =>
      desktop.onMenuCommand((command) => {
        if (command === "screens:setup") return setSetupOpen(true);
        if (command === "screens:open-main" || command === "screens:open-stage") {
          const detail: ScreenCommandDetail = { kind: command === "screens:open-main" ? "main" : "stage", handled: false };
          window.dispatchEvent(new CustomEvent(SCREEN_COMMAND_EVENT, { detail }));
          if (!detail.handled) toast("Open a service first, then open its screens from there.");
        }
      }),
    [desktop],
  );

  return <ScreenSetupDialog desktop={desktop} open={setupOpen} onClose={() => setSetupOpen(false)} />;
}
