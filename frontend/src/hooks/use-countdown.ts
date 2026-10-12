"use client";

import { useEffect, useState } from "react";

/** Sisa detik menuju `deadline` (epoch ms jam server), dikoreksi dengan selisih jam server. */
export function useCountdown(deadline: number | null, clockOffset: number): number | null {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (deadline === null) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [deadline]);

  if (deadline === null) return null;
  return Math.max(0, Math.ceil((deadline - (now + clockOffset)) / 1000));
}
