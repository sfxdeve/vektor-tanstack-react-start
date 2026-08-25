import { useEffect, useState } from "react";

import type { Company } from "@/lib/api-client";

/**
 * Shared "which company am I working with" state for the user pages
 * (/analyze, /documents, /billing). Auto-selects the first company once the
 * list arrives. `company` itself falls back to the first entry during render,
 * so consumers never wait on the effect to display data.
 */
export function useActiveCompany(companies: Company[]) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const company = companies.find((c) => c.id === selectedId) ?? companies[0] ?? null;

  // Persist the implicit first-company choice once the query resolves.
  useEffect(() => {
    if (!selectedId && companies.length > 0) {
      // oxlint-disable-next-line react/set-state-in-effect -- mirrors the query result into selectable state
      setSelectedId(companies[0]!.id);
    }
  }, [companies, selectedId]);

  return { company, selectedId, setSelectedId };
}
