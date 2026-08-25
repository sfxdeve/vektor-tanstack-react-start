import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * EFT payment outcome deep-links (`/payment/success`, `/payment/cancel`).
 *
 * With card checkout gone these are no longer gateway redirects — they are
 * plain status pages a user can bookmark or reopen from an email. "Success"
 * means the EFT request exists and proof is (or can now be) uploaded; credits
 * only land after an admin confirms the deposit. "Cancel" simply returns the
 * user to Billing.
 */

export const Route = createFileRoute("/_authed/payment/$status")({
  beforeLoad: ({ params }) => {
    // Only the two spec'd deep-links exist; anything else is a plain 404.
    if (params.status !== "success" && params.status !== "cancel") {
      throw notFound();
    }
  },
  component: PaymentStatusPage,
});

function PaymentStatusPage() {
  const { status } = Route.useParams();
  const navigate = useNavigate();

  const cancelled = status === "cancel";

  return (
    <div className="flex-1 overflow-auto bg-zinc-50">
      <div className="border-b border-zinc-200 bg-white px-4 py-5 sm:px-8 sm:py-6">
        <Button
          data-testid="back-btn"
          variant="ghost"
          onClick={() => void navigate({ to: "/billing" })}
          className="-ml-2 mb-4"
        >
          <ArrowLeftIcon aria-hidden="true" />
          Back to Billing
        </Button>
        <h1
          className="text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl"
          data-testid="payment-status-title"
        >
          Payment Status
        </h1>
      </div>

      <div className="max-w-2xl p-4 sm:p-8">
        <Card className="rounded-sm border-zinc-200 shadow-none" data-testid="payment-status-card">
          <CardHeader className="border-b border-zinc-200">
            <CardTitle className="text-xl font-bold">Transaction Result</CardTitle>
            <CardDescription>
              {cancelled
                ? "The payment request was closed before completion."
                : "Your EFT request is on file with Vektor."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-6 text-sm leading-relaxed text-zinc-700">
            {cancelled ? (
              <>
                <p data-testid="payment-cancelled-copy">
                  No EFT was recorded. You can start a new payment at any time from the Billing page
                  — a fresh unique reference is generated for every request.
                </p>
                <Button
                  data-testid="payment-back-to-billing-btn"
                  onClick={() => void navigate({ to: "/billing" })}
                  className="bg-zinc-900 text-white hover:bg-zinc-800"
                >
                  Return to Billing
                </Button>
              </>
            ) : (
              <>
                <p data-testid="payment-success-copy">
                  If you have already uploaded proof of payment, your credits are added as soon as
                  an admin verifies the deposit — usually within one business day. Watch the payment
                  list on the Billing page: its status moves from <strong>Awaiting proof</strong> to{" "}
                  <strong>Verifying</strong> and finally <strong>Confirmed</strong>.
                </p>
                <p className="text-xs text-zinc-500">
                  A confirmation email is sent to your account address once credits have been
                  granted. Rejected payments show the reason and can be re-uploaded.
                </p>
                <div className="flex flex-wrap gap-3 pt-2">
                  <Button
                    data-testid="payment-view-billing-btn"
                    onClick={() => void navigate({ to: "/billing" })}
                    className="bg-zinc-900 text-white hover:bg-zinc-800"
                  >
                    View Payment Status
                  </Button>
                  <Button
                    data-testid="payment-go-dashboard-btn"
                    render={<Link to="/app" />}
                    variant="outline"
                    className="border-zinc-900 text-zinc-900 hover:bg-zinc-900 hover:text-white"
                  >
                    Back to Dashboard
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
