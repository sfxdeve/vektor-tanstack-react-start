import { Link } from "@tanstack/react-router";
import { AlertTriangleIcon, ShieldAlertIcon } from "lucide-react";
import { useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import type { VaultDoc } from "@/lib/api-client";

const EXPIRING_SOON_MS = 30 * 24 * 60 * 60 * 1000;

function expiryMs(value: unknown): number | null {
  if (typeof value === "number") return value < 1e12 ? value * 1000 : value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

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
    const now = Date.now();
    const expired: string[] = [];
    const expiringSoon: string[] = [];
    for (const doc of documents) {
      const expiry = expiryMs(doc.expiry_date);
      const isExpired = doc.is_compliant === false || (expiry != null && expiry < now);
      const isSoon = !isExpired && expiry != null && expiry - now < EXPIRING_SOON_MS;
      if (isExpired) {
        if (!expired.includes(doc.doc_type)) expired.push(doc.doc_type);
      } else if (isSoon && !expiringSoon.includes(doc.doc_type)) {
        expiringSoon.push(doc.doc_type);
      }
    }
    return { expired, expiringSoon };
  }, [documents]);

  if (expired.length === 0 && expiringSoon.length === 0) return null;

  const critical = expired.length > 0;
  const chips = (critical ? expired : expiringSoon).slice(0, 4);
  const overflow = (critical ? expired : expiringSoon).length - chips.length;

  return (
    <div
      data-testid={critical ? "compliance-banner" : "compliance-banner-warning"}
      role="alert"
      className={`mb-6 rounded-sm border px-4 py-3 text-sm ${
        critical
          ? "border-red-300 bg-red-50 text-red-800"
          : "border-amber-300 bg-amber-50 text-amber-800"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        {critical ? (
          <ShieldAlertIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
        ) : (
          <AlertTriangleIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
        )}
        <span className="font-bold uppercase tracking-[0.08em]">
          {critical ? "Compliance alert · Ineligible to bid" : "Renewal reminder"}
        </span>
      </div>
      <p className="mt-1">
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
    </div>
  );
}
