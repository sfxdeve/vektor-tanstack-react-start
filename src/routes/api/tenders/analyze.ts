import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";

import { createDb } from "@/db";
import { companies } from "@/db/schema/company";
import { complianceDocuments } from "@/db/schema/compliance";
import { tenders } from "@/db/schema/tender";
import { consumeCredit, refundCredit } from "@/lib/credits";
import { getSessionFromRequest } from "@/lib/server-auth";
import { analyzeTenderWithAi } from "@/lib/ai";
import { scoreTender } from "@/lib/tender-scoring";
import { extractTextFromPdfBytes } from "@/lib/compliance";

export const Route = createFileRoute("/api/tenders/analyze")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const session = await getSessionFromRequest(request);
        if (!session?.user) {
          return new Response(JSON.stringify({ detail: "Not authenticated" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }

        let formData: FormData;
        try {
          formData = await request.formData();
        } catch {
          return new Response(JSON.stringify({ detail: "Invalid form data" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }

        const file = formData.get("file") as File | null;
        const companyId = (formData.get("company_id") ?? formData.get("companyId") ?? "") as string;
        const preferenceSystemRaw = (formData.get("preference_system") ??
          formData.get("preferenceSystem") ??
          "80/20") as string;
        const preferenceSystem = preferenceSystemRaw === "90/10" ? "90/10" : "80/20";

        if (!file || typeof file.arrayBuffer !== "function") {
          return new Response(JSON.stringify({ detail: "File is required" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }
        if (!companyId) {
          return new Response(JSON.stringify({ detail: "company_id is required" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }

        const fileName = (file.name ?? "").toLowerCase();
        const contentType = (file.type ?? "").toLowerCase();
        const isPdf = contentType === "application/pdf" || fileName.endsWith(".pdf");
        if (!isPdf) {
          return new Response(JSON.stringify({ detail: "Only PDF files are supported" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }

        const db = createDb(env.DB as unknown as D1Database);
        const isAdmin = (session.user as unknown as { role?: string }).role === "admin";

        // Fetch company and verify ownership
        const companyRows = await (
          db.select().from(companies).where as unknown as (
            c: unknown,
          ) => Promise<(typeof companies.$inferSelect)[]>
        )(eq(companies.id, companyId));
        const company = companyRows[0];
        if (!company) {
          return new Response(JSON.stringify({ detail: "Company not found" }), {
            status: 404,
            headers: { "content-type": "application/json" },
          });
        }
        if (!isAdmin && company.userId !== session.user.id) {
          return new Response(JSON.stringify({ detail: "You don't have access to this company" }), {
            status: 403,
            headers: { "content-type": "application/json" },
          });
        }

        // Enforce one-credit consumption
        const hasCredit = await consumeCredit(db, companyId);
        if (!hasCredit) {
          return new Response(
            JSON.stringify({
              detail:
                "Insufficient credits. Please purchase a credit pack or subscribe to a monthly plan.",
            }),
            { status: 402, headers: { "content-type": "application/json" } },
          );
        }

        let bytes: Uint8Array;
        try {
          const buf = await file.arrayBuffer();
          bytes = new Uint8Array(buf);
          if (bytes.length === 0) throw new Error("Empty file");
        } catch {
          await refundCredit(db, companyId);
          return new Response(JSON.stringify({ detail: "Failed to read PDF file" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }

        // Extract PDF text (Worker-native via pdfjs)
        let pdfText: string;
        try {
          pdfText = await extractTextFromPdfBytes(bytes);
          if (!pdfText || pdfText.trim().length < 10) {
            // Still attempt AI, but if text is empty we'll refund and error
            if (!pdfText.trim()) {
              throw new Error("Failed to extract PDF text");
            }
          }
        } catch (e) {
          await refundCredit(db, companyId);
          const msg = e instanceof Error ? e.message : "Failed to extract PDF text";
          return new Response(JSON.stringify({ detail: msg }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }

        // Persist original PDF to R2 (best-effort but not fatal if unavailable)
        let pdfStorageKey: string | null = null;
        const storage = (env as unknown as { STORAGE?: R2Bucket }).STORAGE;
        if (storage) {
          try {
            const key = `tenders/${companyId}/${crypto.randomUUID()}.pdf`;
            await storage.put(key, bytes, {
              httpMetadata: { contentType: "application/pdf" },
            });
            pdfStorageKey = key;
          } catch (e) {
            console.warn("R2 put failed for tender PDF", e);
            // non-fatal: continue without storage key
          }
        } else {
          console.warn("STORAGE binding not available, skipping R2 put for tender");
        }

        // AI analysis (can fail)
        let aiResult;
        try {
          aiResult = await analyzeTenderWithAi(pdfText);
        } catch (e) {
          await refundCredit(db, companyId);
          const msg = e instanceof Error ? e.message : "AI analysis failed";
          const isRateLimit = /rate limit/i.test(msg);
          const status = isRateLimit ? 429 : 502;
          return new Response(
            JSON.stringify({
              detail: `AI could not parse this tender document. Your credit has been refunded — ${msg}`,
            }),
            { status, headers: { "content-type": "application/json" } },
          );
        }

        // Fetch compliance docs for scoring
        let complianceDocs: (typeof complianceDocuments.$inferSelect)[] = [];
        try {
          complianceDocs = await (
            db.select().from(complianceDocuments).where as unknown as (
              c: unknown,
            ) => Promise<(typeof complianceDocuments.$inferSelect)[]>
          )(eq(complianceDocuments.companyId, companyId));
        } catch {
          complianceDocs = [];
        }

        // Map to scoring input
        const companyForScoring = {
          bbbeeLevel: company.bbbeeLevel,
          cidbCrsNum: company.cidbCrsNum,
          bargainingCouncils: company.bargainingCouncils
            ? (() => {
                try {
                  return JSON.parse(company.bargainingCouncils) as string[];
                } catch {
                  return [];
                }
              })()
            : [],
        };

        const docsForScoring = complianceDocs.map((d) => ({
          docType: d.docType,
          isCompliant: Boolean(d.isCompliant),
          bargainingCouncil: d.bargainingCouncil ?? null,
          expiryDate: d.expiryDate ? new Date(d.expiryDate as unknown as number) : null,
        }));

        const scoring = scoreTender(
          {
            tender_title: aiResult.tender_title,
            tender_number: aiResult.tender_number,
            issuing_entity: aiResult.issuing_entity,
            required_cidb: aiResult.required_cidb,
            closing_date: aiResult.closing_date,
            mandatory_returnables: aiResult.mandatory_returnables ?? [],
          },
          companyForScoring,
          docsForScoring,
          preferenceSystem,
        );

        const returnables = aiResult.mandatory_returnables ?? [];
        const returnableStatus: Record<
          string,
          { verified: boolean; verified_at: string | null; doc_ref: string | null }
        > = {};
        for (const r of returnables) {
          returnableStatus[r] = { verified: false, verified_at: null, doc_ref: null };
        }

        const tenderId = crypto.randomUUID();
        const now = new Date();

        const row = {
          id: tenderId,
          companyId,
          tenderNumber: aiResult.tender_number ?? null,
          title: aiResult.tender_title ?? "South African Tender",
          issuingEntity: aiResult.issuing_entity ?? null,
          closingDate: aiResult.closing_date ?? null,
          requiredCidbGrade: aiResult.required_cidb ?? null,
          preferencePointSystem: preferenceSystem,
          parsedReturnables: JSON.stringify(returnables),
          fitScore: scoring.fitScore,
          riskFlags: JSON.stringify(scoring.riskFlags),
          eligibleBbbeePoints: scoring.eligibleBbbeePoints,
          returnableStatus: JSON.stringify(returnableStatus),
          pdfStorageKey,
          createdAt: now,
          updatedAt: now,
        };

        try {
          await db.insert(tenders).values(row);
        } catch (e) {
          console.error("Failed to insert tender", e);
          await refundCredit(db, companyId);
          return new Response(JSON.stringify({ detail: "Failed to save tender" }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }

        const responseBody = {
          tender_id: tenderId,
          tender_title: row.title,
          required_cidb: row.requiredCidbGrade,
          mandatory_returnables: returnables,
          fit_score: scoring.fitScore,
          risk_flags: scoring.riskFlags,
          eligible_bbbee_points: scoring.eligibleBbbeePoints,
          closing_date: row.closingDate,
          returnable_status: returnableStatus,
          // snake/camel aliases for frontend convenience
          verdict: scoring.verdict,
          id: tenderId,
        };

        return new Response(JSON.stringify(responseBody), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
