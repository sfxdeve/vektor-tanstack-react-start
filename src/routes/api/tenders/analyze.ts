import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";

import { createDb } from "@/db";
import { complianceDocuments } from "@/db/schema/compliance";
import { tenders } from "@/db/schema/tender";
import { analyzeTenderWithAi, type AiResult } from "@/lib/ai";
import { extractTextFromPdfBytes } from "@/lib/compliance";
import { consumeCredit, refundCredit } from "@/lib/credits";
import { fetchOwnedCompany } from "@/lib/ownership";
import { requireUser } from "@/lib/server-auth";
import { scoreTender } from "@/lib/tender-scoring";

import { asString } from "@/lib/request-utils";

export const Route = createFileRoute("/api/tenders/analyze")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const session = await requireUser(request);
        if (session instanceof Response) return session;

        let formData: FormData;
        try {
          formData = await request.formData();
        } catch {
          return Response.json({ detail: "Invalid form data" }, { status: 400 });
        }

        const file = formData.get("file");
        const companyId = asString(formData.get("company_id"));
        const preferenceSystem = formData.get("preference_system") === "90/10" ? "90/10" : "80/20";

        if (!(file instanceof File)) {
          return Response.json({ detail: "File is required" }, { status: 400 });
        }
        if (!companyId) {
          return Response.json({ detail: "company_id is required" }, { status: 400 });
        }
        const fileName = file.name.toLowerCase();
        if (file.type.toLowerCase() !== "application/pdf" && !fileName.endsWith(".pdf")) {
          return Response.json({ detail: "Only PDF files are supported" }, { status: 400 });
        }
        if (file.size === 0) {
          return Response.json({ detail: "Uploaded file is empty" }, { status: 400 });
        }

        const db = createDb(env.DB);
        const company = await fetchOwnedCompany(db, companyId, session);
        if (company instanceof Response) return company;

        // Consume 1 credit up front; every downstream failure path refunds it.
        const hasCredit = await consumeCredit(db, companyId);
        if (!hasCredit) {
          return Response.json(
            {
              detail:
                "Insufficient credits. Please purchase a credit pack or subscribe to a monthly plan.",
            },
            { status: 402 },
          );
        }

        try {
          // Extract text in the Worker (unpdf), then persist the original PDF to R2.
          const bytes = new Uint8Array(await file.arrayBuffer());
          let pdfText: string;
          try {
            pdfText = await extractTextFromPdfBytes(bytes);
            if (!pdfText.trim()) throw new Error("empty");
          } catch {
            await refundCredit(db, companyId);
            return Response.json({ detail: "Failed to extract PDF text" }, { status: 400 });
          }

          let pdfStorageKey: string | null = null;
          try {
            pdfStorageKey = `tenders/${companyId}/${crypto.randomUUID()}.pdf`;
            await env.STORAGE.put(pdfStorageKey, bytes, {
              httpMetadata: { contentType: "application/pdf" },
            });
          } catch (e) {
            console.warn("Failed to persist tender PDF to storage", e);
            pdfStorageKey = null;
          }

          let aiResult: AiResult;
          try {
            aiResult = await analyzeTenderWithAi(pdfText);
          } catch (e) {
            if (pdfStorageKey) await deleteQuietly(env.STORAGE, pdfStorageKey);
            const msg = e instanceof Error ? e.message : "AI analysis failed";
            console.error("AI analysis failed after credit consumption", msg);
            return Response.json(
              {
                detail:
                  `AI could not parse this tender document. Your credit has been refunded — ` +
                  `please try again or contact support if this persists.`,
              },
              { status: 502 },
            );
          }

          const docs = await db
            .select()
            .from(complianceDocuments)
            .where(eq(complianceDocuments.companyId, companyId));
          const scoring = scoreTender(
            aiResult,
            {
              bbbeeLevel: company.bbbeeLevel,
              cidbCrsNum: company.cidbCrsNum,
              bargainingCouncils: parseJsonArray(company.bargainingCouncils),
            },
            docs.map((d) => ({
              docType: d.docType,
              isCompliant: Boolean(d.isCompliant),
              bargainingCouncil: d.bargainingCouncil ?? null,
              expiryDate: d.expiryDate ?? null,
            })),
            preferenceSystem,
          );

          // All returnables start unverified (red).
          const returnableStatus: Record<
            string,
            { verified: boolean; verified_at: string | null; doc_ref: string | null }
          > = {};
          for (const r of aiResult.mandatory_returnables) {
            returnableStatus[r] = { verified: false, verified_at: null, doc_ref: null };
          }

          const tenderId = crypto.randomUUID();
          const now = new Date();
          await db.insert(tenders).values({
            id: tenderId,
            companyId,
            tenderNumber: aiResult.tender_number ?? null,
            title: aiResult.tender_title || "South African Tender",
            issuingEntity: aiResult.issuing_entity ?? null,
            closingDate: aiResult.closing_date ?? null,
            requiredCidbGrade: aiResult.required_cidb ?? null,
            preferencePointSystem: preferenceSystem,
            parsedReturnables: JSON.stringify(aiResult.mandatory_returnables),
            evaluationCriteria: JSON.stringify(aiResult.evaluation_criteria ?? []),
            fitScore: scoring.fitScore,
            riskFlags: JSON.stringify(scoring.riskFlags),
            eligibleBbbeePoints: scoring.eligibleBbbeePoints,
            returnableStatus: JSON.stringify(returnableStatus),
            pdfStorageKey,
            createdAt: now,
            updatedAt: now,
          });

          return Response.json({
            tender_id: tenderId,
            tender_title: aiResult.tender_title || "South African Tender",
            required_cidb: aiResult.required_cidb ?? null,
            mandatory_returnables: aiResult.mandatory_returnables,
            evaluation_criteria: aiResult.evaluation_criteria ?? [],
            fit_score: scoring.fitScore,
            risk_flags: scoring.riskFlags,
            verdict: scoring.verdict,
            eligible_bbbee_points: scoring.eligibleBbbeePoints,
            closing_date: aiResult.closing_date ?? null,
            returnable_status: returnableStatus,
          });
        } catch (e) {
          // Unexpected error — refund and surface a 500.
          await refundCredit(db, companyId);
          console.error("analyze_tender failed after credit consumption", e);
          return Response.json(
            { detail: "Analysis failed unexpectedly. Your credit has been refunded." },
            { status: 500 },
          );
        }
      },
    },
  },
});

async function deleteQuietly(storage: R2Bucket, key: string): Promise<void> {
  try {
    await storage.delete(key);
  } catch {
    // ignore cleanup failure
  }
}

function parseJsonArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}
