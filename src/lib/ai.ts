import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

import { runtimeEnv } from "@/lib/runtime-env";

const nullableText = z.string().trim().min(1).max(300).nullable();
const aiResultSchema = z
  .object({
    tender_title: z.string().trim().min(1).max(500),
    tender_number: nullableText,
    issuing_entity: nullableText,
    required_cidb: z.string().trim().min(1).max(20).nullable(),
    closing_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine((value) => {
        const date = new Date(`${value}T00:00:00Z`);
        return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
      })
      .nullable(),
    mandatory_returnables: z.array(z.string().trim().min(1).max(300)).max(100),
    evaluation_criteria: z.array(z.string().trim().min(1).max(500)).max(100),
  })
  .strict();

export type AiResult = z.infer<typeof aiResultSchema>;

const STUB_FIXTURE: AiResult = {
  tender_title: "Supply and Delivery of Electrical Components for Municipal Infrastructure",
  tender_number: "MUN/2024/INFRA-045",
  issuing_entity: "City of Tshwane Metropolitan Municipality",
  required_cidb: "4EB",
  closing_date: "2025-03-15",
  mandatory_returnables: [
    "SBD 4 - Declaration of Interest",
    "SBD 6.1 - Preference Points Claim",
    "Tax Clearance Certificate",
    "CSD Registration Report",
    "CIDB Certificate",
  ],
  evaluation_criteria: [
    "Price — 80 points",
    "Specific Goals (B-BBEE) — 20 points",
    "Functionality — minimum 70% threshold",
  ],
};

export async function analyzeTenderWithAi(pdfText: string): Promise<AiResult> {
  if (runtimeEnv.DEV_AI_STUB === "1") {
    if (pdfText.includes("VEKTOR_TEST_AI_FAILURE")) {
      throw new Error("Deterministic AI fixture failure");
    }
    return structuredClone(STUB_FIXTURE);
  }

  const apiKey = runtimeEnv.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

  const gatewayId = runtimeEnv.AI_GATEWAY_ID?.trim();
  const accountId = runtimeEnv.CLOUDFLARE_ACCOUNT_ID?.trim();
  if (gatewayId && !accountId) {
    throw new Error("CLOUDFLARE_ACCOUNT_ID is required when AI_GATEWAY_ID is configured");
  }
  if (!gatewayId && accountId) {
    throw new Error("AI_GATEWAY_ID is required when CLOUDFLARE_ACCOUNT_ID is configured");
  }

  const baseURL = gatewayId
    ? `https://gateway.ai.cloudflare.com/v1/${encodeURIComponent(accountId!)}/${encodeURIComponent(gatewayId)}/openai`
    : undefined;
  const client = new OpenAI({ apiKey, baseURL, timeout: 45_000, maxRetries: 2 });
  const response = await client.responses.parse({
    model: "gpt-4o-mini",
    instructions:
      "You are an expert South African public procurement auditor. Extract only facts present in the supplied tender text. Use null when a nullable fact is absent.",
    input: `Analyze this South African tender document extract:\n\n${pdfText.slice(0, 12_000)}`,
    text: { format: zodTextFormat(aiResultSchema, "tender_analysis") },
  });

  if (!response.output_parsed) throw new Error("AI returned no structured tender analysis");
  const parsed = aiResultSchema.parse(response.output_parsed);
  return {
    ...parsed,
    mandatory_returnables: dedupe(parsed.mandatory_returnables),
    evaluation_criteria: dedupe(parsed.evaluation_criteria),
  };
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.trim().toLocaleLowerCase("en-ZA");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
