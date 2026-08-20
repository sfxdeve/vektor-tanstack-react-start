/**
 * AI adapter — OpenAI via Cloudflare AI Gateway
 * Uses DEV_AI_STUB for deterministic e2e fixture.
 */

export interface AiResult {
  tender_title: string;
  tender_number: string | null;
  issuing_entity: string | null;
  required_cidb: string | null;
  closing_date: string | null;
  mandatory_returnables: string[];
}

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
};

async function getEnv(): Promise<Record<string, string | undefined>> {
  const fallback: Record<string, string | undefined> = {};
  if (typeof process !== "undefined" && process.env) {
    for (const k of ["DEV_AI_STUB", "OPENAI_API_KEY", "AI_GATEWAY_ID", "CF_ACCOUNT_ID"]) {
      fallback[k] = process.env[k];
    }
  }
  try {
    const mod = await import("cloudflare:workers");
    const env = (mod as unknown as { env: Record<string, string | undefined> }).env;
    if (env) {
      return { ...fallback, ...env };
    }
  } catch {
    // ignore
  }
  return fallback;
}

export async function analyzeTenderWithAi(pdfText: string): Promise<AiResult> {
  const env = await getEnv();

  if (env.DEV_AI_STUB === "1") {
    // Return stub but try to infer CIDB from pdf text for more realistic tests
    // If pdf text contains explicit CIDB like 6CE, use that as required_cidb
    const cidbMatch = pdfText.match(/\b([1-9])\s*([A-Z]{2,3})\b/);
    if (cidbMatch?.[1] && cidbMatch?.[2]) {
      const inferred = `${cidbMatch[1]}${cidbMatch[2]}`;
      // Only override if it's a plausible tender CIDB, not random
      // Use inferred if pdf text is short stub text containing it explicitly for isolation tests
      const hasTenderContext = /tender|required|CIDB/i.test(pdfText);
      if (hasTenderContext) {
        return { ...STUB_FIXTURE, required_cidb: inferred.toUpperCase() };
      }
    }
    return { ...STUB_FIXTURE };
  }

  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  const gatewayId = env.AI_GATEWAY_ID;
  const accountId = env.CF_ACCOUNT_ID;

  let url: string;
  if (gatewayId && accountId) {
    url = `https://gateway.ai.cloudflare.com/v1/${accountId}/${gatewayId}/openai/chat/completions`;
  } else if (gatewayId) {
    // Some deployments use gatewayId as full path
    url = `https://gateway.ai.cloudflare.com/v1/${gatewayId}/openai/chat/completions`;
  } else {
    url = "https://api.openai.com/v1/chat/completions";
  }

  const systemMessage =
    "You are an expert South African public procurement auditor. Extract structured data from tender documents.";

  const prompt = `Analyze this South African tender document extract and return ONLY a valid JSON object with these exact fields:

{
    "tender_title": "string (the tender title/description)",
    "tender_number": "string or null (e.g. RFP/2024/123)",
    "issuing_entity": "string or null (department/municipality name)",
    "required_cidb": "string or null (e.g. 4GB, 6CE)",
    "closing_date": "string or null (ISO date format YYYY-MM-DD if found)",
    "mandatory_returnables": ["list of required document names like SBD 4, Tax Pin, CSD Report"]
}

Tender text extract:
${pdfText.slice(0, 4000)}

Return ONLY the JSON object, no other text.`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: prompt },
      ],
      temperature: 0.2,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`AI analysis failed: ${res.status} ${text.slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = json.choices?.[0]?.message?.content?.trim() ?? "";
  if (!content) throw new Error("AI returned empty response");

  let parsed: unknown = content;
  try {
    // Extract JSON from possible markdown fences
    let candidate = content;
    if (candidate.includes("```json")) {
      candidate = candidate.split("```json")[1]!.split("```")[0]!.trim();
    } else if (candidate.includes("```")) {
      candidate = candidate.split("```")[1]!.split("```")[0]!.trim();
    }
    parsed = JSON.parse(candidate);
  } catch (e) {
    throw new Error(`AI returned unparseable JSON: ${(e as Error).message}`);
  }

  const obj = parsed as Record<string, unknown>;
  return {
    tender_title: (obj.tender_title as string) ?? "South African Tender",
    tender_number: (obj.tender_number as string | null) ?? null,
    issuing_entity: (obj.issuing_entity as string | null) ?? null,
    required_cidb: (obj.required_cidb as string | null) ?? null,
    closing_date: (obj.closing_date as string | null) ?? null,
    mandatory_returnables: Array.isArray(obj.mandatory_returnables)
      ? (obj.mandatory_returnables as string[])
      : [],
  };
}
