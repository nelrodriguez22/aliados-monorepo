import { useEffect, useRef, useState, useCallback } from "react";
import { fetchMaintenance } from "@/shared/lib/remoteConfig";
import {
  readBypassFlag,
  type MaintenanceState,
} from "@/shared/lib/maintenance";

const OFF: MaintenanceState = {
  level: "off",
  title: "",
  message: "",
  schedule: "",
  duration: "",
};

export function useMaintenance() {
  const [state, setState] = useState<MaintenanceState>(OFF);
  const bypass = useRef(
    readBypassFlag(window.location.search, window.localStorage),
  ).current;
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const refetch = useCallback(() => {
    fetchMaintenance().then(setState).catch(() => setState(OFF));
  }, []);

  useEffect(() => {
    let alive = true;
    const tick = () => {
      fetchMaintenance()
        .then((s) => {
          if (!alive) return;
          setState(s);
          const delay = s.level === "blocked" ? 20_000 : 60_000;
          timer.current = setTimeout(tick, delay);
        })
        .catch(() => {
          if (!alive) return;
          setState(OFF);
          timer.current = setTimeout(tick, 60_000);
        });
    };
    tick();
    return () => {
      alive = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return { state, bypass, refetch };
}
