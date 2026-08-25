/**
 * queryOptions factories for every authenticated/public read the pages do.
 * Pages call useQuery/useSuspenseQuery with these; mutations invalidate via
 * the qk registry in api-client.ts.
 */
import { queryOptions } from "@tanstack/react-query";

import {
  apiGet,
  type ActivityItem,
  type BargainingCouncilDto,
  type Company,
  type EftPayment,
  type Tender,
  type VaultDoc,
} from "@/lib/api-client";
import { qk } from "@/lib/api-client";

export const companiesQuery = () =>
  queryOptions({
    queryKey: qk.companies,
    queryFn: () => apiGet<Company[]>("/api/companies"),
  });

export const documentsQuery = (companyId: string) =>
  queryOptions({
    queryKey: qk.documents(companyId),
    queryFn: () => apiGet<VaultDoc[]>(`/api/documents/company/${companyId}`),
  });

export const tendersQuery = (companyId: string) =>
  queryOptions({
    queryKey: qk.tenders(companyId),
    queryFn: () => apiGet<Tender[]>(`/api/tenders/${companyId}`),
  });

export const creditsQuery = (companyId: string) =>
  queryOptions({
    queryKey: qk.credits(companyId),
    queryFn: () => apiGet<CreditsDto>(`/api/billing/credits/${companyId}`),
  });

export interface ActivityResponse {
  items: ActivityItem[];
}

export const activityQuery = (type: string | null, limit = 8) =>
  queryOptions({
    queryKey: [...qk.activity(type), limit],
    queryFn: () => {
      const params = new URLSearchParams({ limit: String(limit) });
      if (type) params.set("type", type);
      return apiGet<ActivityResponse>(`/api/dashboard/activity?${params.toString()}`);
    },
  });

export interface PackageDto {
  id: string;
  lookup_key: string;
  name: string;
  description: string;
  persona: string | null;
  tagline: string | null;
  amount: number;
  amount_cents: number;
  currency: string;
  credits: number;
  type: string;
  interval: string | null;
  is_popular: boolean;
  billing_period: string;
}

export interface SubscriptionDto {
  lookup_key: string;
  active: boolean;
  cycle_credits: number | null;
  rollover_cap: number | null;
  started_at: string | null;
}

export interface CreditsDto {
  company_id: string;
  credits: number;
  subscription: SubscriptionDto | null;
}

export const packagesQuery = () =>
  queryOptions({
    queryKey: qk.packages,
    queryFn: () => apiGet<{ packages: PackageDto[] }>("/api/billing/packages"),
  });

export const councilsQuery = () =>
  queryOptions({
    queryKey: qk.councils,
    queryFn: () =>
      apiGet<{ councils: BargainingCouncilDto[] }>("/api/reference/bargaining-councils"),
  });

export const myEftPaymentsQuery = () =>
  queryOptions({
    queryKey: qk.myEftPayments,
    queryFn: () => apiGet<{ payments: EftPayment[] }>("/api/eft/my-requests"),
  });

export interface MyReferralStats {
  code: string;
  invited_count: number;
  paid_count: number;
  subscribed_count: number;
  credits_earned: number;
  monthly_used: number;
  monthly_cap: number;
  lifetime_used: number;
  lifetime_cap: number;
  reward_config: { referee_signup_bonus: number; tier_rewards: Record<string, number> };
  recent: Array<{
    referee_email: string;
    status: string;
    created_at: string;
    first_paid_at: string | null;
  }>;
}

export const myReferralsQuery = () =>
  queryOptions({
    queryKey: qk.myReferrals,
    queryFn: () => apiGet<MyReferralStats>("/api/referrals/my"),
  });

export interface AdminStatsDto {
  users?: { total?: number; admins?: number; new_30d?: number };
  companies?: { total?: number; new_30d?: number };
  tenders?: { total?: number; new_30d?: number };
  documents?: { total?: number; expiring_30d?: number };
  subscriptions?: { active?: number };
  eft?: { pending_review?: number };
}

export const adminStatsQuery = () =>
  queryOptions({
    queryKey: qk.adminStats,
    queryFn: () => apiGet<AdminStatsDto>("/api/admin/stats"),
  });

export const adminUsersQuery = (q: string) =>
  queryOptions({
    queryKey: [...qk.adminUsers, q] as const,
    queryFn: () => apiGet(q ? `/api/admin/users?q=${encodeURIComponent(q)}` : "/api/admin/users"),
  });

export const adminCompaniesQuery = (q: string) =>
  queryOptions({
    queryKey: [...qk.adminCompanies, q] as const,
    queryFn: () =>
      apiGet(q ? `/api/admin/companies?q=${encodeURIComponent(q)}` : "/api/admin/companies"),
  });

export const adminEftQuery = (status: string) =>
  queryOptions({
    queryKey: qk.adminEft(status),
    queryFn: () =>
      apiGet<{ payments: EftPayment[] }>(
        status === "all"
          ? "/api/eft/admin/all"
          : `/api/eft/admin/all?status=${encodeURIComponent(status)}`,
      ),
  });
