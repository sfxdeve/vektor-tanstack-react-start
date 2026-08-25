import { Link } from "@tanstack/react-router";
import { AlertTriangleIcon, ShieldAlertIcon } from "lucide-react";
import { useMemo } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import type { VaultDoc } from "@/lib/api-client";
import { classifyExpiry } from "@/lib/compliance";

export interface ComplianceBannerProps {
  documents: VaultDoc[];
}

/**
 * Dashboard compliance banner — red when anything is expired/non-compliant,
 * amber when renewals are due within 30 days. Chips dedupe by doc type so the
 * same document family is named once (mirrors the old ComplianceBanner).
 */
export function ComplianceBanner({ documents }: ComplianceBannerProps) {
  const { expired, expiringSoon } = useMemo(() => {
    // oxlint-disable-next-line react/purity -- display-only freshness anchor for classifyExpiry
    const nowMs = Date.now();
    const expired = new Set<string>();
    const expiringSoon = new Set<string>();
    for (const doc of documents) {
      const cls = doc.is_compliant === false ? "expired" : classifyExpiry(doc.expiry_date, nowMs);
      if (cls === "expired") expired.add(doc.doc_type);
      else if (cls === "expiring_soon") expiringSoon.add(doc.doc_type);
    }
    return { expired: [...expired], expiringSoon: [...expiringSoon] };
  }, [documents]);

  if (expired.length === 0 && expiringSoon.length === 0) return null;

  const critical = expired.length > 0;
  const chips = (critical ? expired : expiringSoon).slice(0, 4);
  const overflow = (critical ? expired : expiringSoon).length - chips.length;

  return (
    <Alert
      data-testid={critical ? "compliance-banner" : "compliance-banner-warning"}
      variant={critical ? "destructive" : "default"}
      className={`mb-6 rounded-sm ${
        critical
          ? "border-red-300 bg-red-50 text-red-800"
          : "border-amber-300 bg-amber-50 text-amber-800"
      }`}
    >
      {critical ? (
        <ShieldAlertIcon className="h-4 w-4" aria-hidden="true" />
      ) : (
        <AlertTriangleIcon className="h-4 w-4" aria-hidden="true" />
      )}
      <AlertTitle className="font-bold uppercase tracking-[0.08em]">
        {critical ? "Compliance alert · Ineligible to bid" : "Renewal reminder"}
      </AlertTitle>
      <AlertDescription className={critical ? "text-red-800" : "text-amber-800"}>
        <p>
          {critical
            ? "Government tenders reject bids with expired compliance. Renew these before bidding."
            : "These documents expire within 30 days — renew now to stay eligible."}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {chips.map((docType) => (
            <Badge
              key={docType}
              variant="outline"
              className={
                critical
                  ? "border-red-300 bg-white text-red-800"
                  : "border-amber-300 bg-white text-amber-800"
              }
            >
              {docType.replaceAll("_", " ").toLowerCase()}
            </Badge>
          ))}
          {overflow > 0 && <span className="text-xs font-semibold">+{overflow} more</span>}
        </div>
        <Link
          to="/documents"
          data-testid="compliance-banner-cta"
          className="mt-2 inline-block font-semibold underline underline-offset-2"
        >
          Renew now →
        </Link>
      </AlertDescription>
    </Alert>
  );
}
