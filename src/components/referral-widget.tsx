// oxlint-disable react/set-state-in-effect
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Users, Coins, TrendingUp, Copy, Mail, MessageCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface ReferralStats {
  code: string;
  invited_count: number;
  paid_count: number;
  subscribed_count: number;
  credits_earned: number;
  monthly_used: number;
  monthly_cap: number;
  monthly_remaining: number;
  lifetime_used: number;
  lifetime_cap: number;
  lifetime_remaining: number;
  reward_config: {
    referee_signup_bonus: number;
    tier_rewards: Record<string, number>;
  };
  recent: Array<{
    referee_email: string;
    status: string;
    created_at: string;
    first_paid_at: string | null;
  }>;
}

const TIER_ROWS = [
  { key: "tc_starter_monthly_v2", label: "Starter" },
  { key: "tc_pro_monthly_v2", label: "Pro" },
  { key: "tc_scale_monthly_v2", label: "Scale" },
];

export function ReferralWidget() {
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/referrals/my");
      if (!r.ok) return;
      const data = (await r.json()) as ReferralStats;
      setStats(data);
    } catch {
      // non-critical
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading || !stats) return null;

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const shareUrl = `${origin}/signup?ref=${stats.code}`;
  const shareMessage = `I use Vektor for SA tender compliance — CIDB matching, B-BBEE scoring, and expiry alerts in seconds. Sign up with my link: ${shareUrl}`;
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareMessage)}`;
  const mailtoUrl = `mailto:?subject=${encodeURIComponent("Try Vektor — SA tender compliance in seconds")}&body=${encodeURIComponent(shareMessage)}`;
  const tierRewards = stats.reward_config?.tier_rewards ?? {};

  const copy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Could not copy");
    }
  };

  return (
    <Card className="rounded-sm shadow-none border-zinc-200 mb-8" data-testid="referral-widget">
      <CardContent className="p-6 lg:p-7">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-sm bg-teal-500/10 border border-teal-500/30 flex items-center justify-center">
            <Users size={18} className="text-teal-600" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-teal-700 font-bold">
              Refer a paid subscriber
            </p>
            <h2 className="text-lg font-bold text-zinc-900">Unlock free credits</h2>
          </div>
        </div>
        <p className="text-sm text-zinc-600 leading-relaxed mt-2 max-w-2xl">
          Share your link with an SA contractor. When they upgrade to a paid plan, you earn credits
          — no cash rewards, no discounts to them. Just a thank-you for growing the community.
        </p>

        <div className="mt-4 grid grid-cols-3 gap-2" data-testid="referral-tier-rewards">
          {TIER_ROWS.map((t) => (
            <div
              key={t.key}
              className="rounded-sm border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-center"
              data-testid={`referral-tier-${t.key}`}
            >
              <p className="text-[10px] uppercase tracking-[0.15em] text-zinc-500 font-bold">
                {t.label}
              </p>
              <p className="text-xl font-black text-teal-700 leading-tight mt-0.5">
                +{tierRewards[t.key] ?? 0}
              </p>
              <p className="text-[10px] text-zinc-500">credits</p>
            </div>
          ))}
        </div>

        <div className="mt-5 flex items-stretch gap-2">
          <label htmlFor="referral-share-url" className="sr-only">
            Referral link
          </label>
          <input
            id="referral-share-url"
            readOnly
            value={shareUrl}
            aria-label="Referral link"
            className="flex-1 min-w-0 rounded-sm border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-xs font-mono text-zinc-800"
            data-testid="referral-share-url"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void copy("Link", shareUrl)}
            data-testid="referral-copy-link"
          >
            <Copy size={13} className="mr-1.5" />
            Copy
          </Button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-sm bg-[#25D366] hover:bg-[#20b95a] text-white text-xs font-bold px-3 py-2 transition-colors"
            data-testid="referral-whatsapp"
          >
            <MessageCircle size={14} />
            Share on WhatsApp
          </a>
          <a
            href={mailtoUrl}
            className="inline-flex items-center gap-1.5 rounded-sm bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold px-3 py-2 transition-colors"
            data-testid="referral-email"
          >
            <Mail size={14} />
            Email
          </a>
        </div>

        <div className="mt-6 pt-5 border-t border-zinc-200 grid grid-cols-3 gap-4">
          <div className="text-center">
            <Users size={16} className="mx-auto mb-1 text-zinc-400" />
            <p
              className="text-2xl font-black tracking-tight text-zinc-900"
              data-testid="referral-stat-invited"
            >
              {stats.invited_count}
            </p>
            <p className="text-[10px] uppercase tracking-[0.15em] text-zinc-500 font-semibold mt-0.5">
              Invited
            </p>
          </div>
          <div className="text-center">
            <TrendingUp size={16} className="mx-auto mb-1 text-zinc-400" />
            <p
              className="text-2xl font-black tracking-tight text-zinc-900"
              data-testid="referral-stat-paid"
            >
              {stats.subscribed_count}
            </p>
            <p className="text-[10px] uppercase tracking-[0.15em] text-zinc-500 font-semibold mt-0.5">
              Subscribed
            </p>
          </div>
          <div className="text-center">
            <Coins size={16} className="mx-auto mb-1 text-teal-600" />
            <p
              className="text-2xl font-black tracking-tight text-teal-700"
              data-testid="referral-stat-earned"
            >
              {stats.credits_earned}
            </p>
            <p className="text-[10px] uppercase tracking-[0.15em] text-zinc-500 font-semibold mt-0.5">
              Credits earned
            </p>
          </div>
        </div>

        <p className="mt-5 text-[11px] text-zinc-500 leading-relaxed">
          Fair-use limit: <strong className="text-zinc-700">{stats.monthly_remaining}</strong>{" "}
          rewards remaining this month ·{" "}
          <strong className="text-zinc-700">{stats.lifetime_remaining}</strong> remaining lifetime ·
          Rewards apply only after the referee completes their first paid subscription EFT.
        </p>

        {stats.recent && stats.recent.length > 0 && (
          <details className="mt-4" data-testid="referral-recent-details">
            <summary className="text-xs font-semibold text-zinc-700 cursor-pointer hover:text-zinc-900">
              Recent invites ({stats.recent.length})
            </summary>
            <ul className="mt-3 space-y-1.5">
              {stats.recent.map((r, i) => (
                <li key={i} className="flex items-center justify-between text-xs">
                  <span className="font-mono text-zinc-600">{r.referee_email}</span>
                  <span
                    className={`text-[10px] uppercase tracking-[0.1em] font-bold ${
                      r.status?.includes("paid")
                        ? "text-teal-700"
                        : r.status === "signed_up"
                          ? "text-zinc-500"
                          : "text-amber-700"
                    }`}
                  >
                    {r.status?.replace(/_/g, " ")}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
