import { useCallback, useState } from "react";

export type EstateSelection = { id: string; name: string };

export function useEstate(initialEstate: EstateSelection | null = null) {
  const [estate, setEstate] = useState<EstateSelection | null>(initialEstate);
  const selectEstate = useCallback((next: EstateSelection | null) => setEstate(next), []);
  return { estate, estateId: estate?.id ?? null, selectEstate };
}
