import { describe, expect, it } from "vitest";

import { verifyCipc, verifyCsdMaaa, verifySarsTcs, verify } from "@/lib/verification";

describe("verification", () => {
  describe("verifyCipc", () => {
    it("accepts valid CIPC format YYYY/NNNNNN/TT", () => {
      const r = verifyCipc("2021/123456/07");
      expect(r.valid).toBe(true);
      expect(r.incorporation_year).toBe(2021);
      expect(r.entity_type_label).toBe("Private company (Pty) Ltd");
      expect(r.verify_url).toContain("esearch.cipc.co.za");
    });

    it("accepts 7-digit sequence", () => {
      const r = verifyCipc("2019/1234567/07");
      expect(r.valid).toBe(true);
    });

    it("rejects invalid format", () => {
      const r = verifyCipc("2021-123456-07");
      expect(r.valid).toBe(false);
      expect(r.reason).toContain("YYYY/NNNNNN/TT");
    });

    it("rejects out-of-range year", () => {
      const r = verifyCipc("1899/123456/07");
      expect(r.valid).toBe(false);
      expect(r.reason).toContain("out of realistic range");
    });

    it("exposes entity type map for 06 public company", () => {
      const r = verifyCipc("2020/000001/06");
      expect(r.valid).toBe(true);
      expect(r.entity_type_label).toBe("Public company (Ltd)");
    });
  });

  describe("verifySarsTcs", () => {
    it("accepts 9-char alphanumeric", () => {
      expect(verifySarsTcs("A1B2C3D4E").valid).toBe(true);
      expect(verifySarsTcs("abc123def9").valid).toBe(true);
    });

    it("accepts 10-char alphanumeric and normalizes to upper", () => {
      const r = verifySarsTcs("ab12cd34ef");
      expect(r.valid).toBe(true);
      expect(r.normalized).toBe("AB12CD34EF");
    });

    it("rejects too short", () => {
      expect(verifySarsTcs("ABC123").valid).toBe(false);
    });

    it("rejects with special chars", () => {
      expect(verifySarsTcs("ABC-12345!").valid).toBe(false);
    });

    it("provides SARS portal link", () => {
      const r = verifySarsTcs("ABCDE12345");
      expect(r.verify_url).toContain("tools.sars.gov.za");
    });
  });

  describe("verifyCsdMaaa", () => {
    it("accepts MAAA + 7 digits", () => {
      expect(verifyCsdMaaa("MAAA0123456").valid).toBe(true);
      expect(verifyCsdMaaa("maaa0123456").valid).toBe(true);
    });

    it("rejects wrong prefix or length", () => {
      expect(verifyCsdMaaa("MAAA123").valid).toBe(false);
      expect(verifyCsdMaaa("MAAB0123456").valid).toBe(false);
      expect(verifyCsdMaaa("MAAA012345").valid).toBe(false);
    });

    it("normalizes to upper", () => {
      const r = verifyCsdMaaa("maaa0000001");
      expect(r.normalized).toBe("MAAA0000001");
    });
  });

  describe("verify dispatcher", () => {
    it("dispatches cipc", () => {
      expect(verify("cipc", "2021/123456/07")?.valid).toBe(true);
    });
    it("dispatches sars aliases", () => {
      expect(verify("sars_tcs", "ABCDE12345")?.valid).toBe(true);
      expect(verify("tcs", "ABCDE12345")?.valid).toBe(true);
    });
    it("dispatches csd aliases", () => {
      expect(verify("csd_maaa", "MAAA0123456")?.valid).toBe(true);
      expect(verify("maaa", "MAAA0123456")?.valid).toBe(true);
    });
    it("returns null for unknown kind", () => {
      expect(verify("unknown", "value")).toBeNull();
    });
  });
});
