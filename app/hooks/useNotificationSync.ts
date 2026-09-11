import { useEffect } from "react";

import { syncNotifications } from "@/lib/notifications";
import { useLibrary } from "@/store/library-store";
import { useSettings } from "@/store/settings-store";

/**
 * Keep the scheduled reminder queue in step with the notification preferences
 * and the watchlist. Rebuilding is idempotent, so running it on every change is
 * cheaper than tracking which reminder belongs to which title.
 */
export function useNotificationSync(): void {
  const prefs = useSettings((state) => state.notifications);
  const watchlist = useLibrary((state) => state.watchlist);

  useEffect(() => {
    void syncNotifications(prefs, watchlist);
  }, [prefs, watchlist]);
}
