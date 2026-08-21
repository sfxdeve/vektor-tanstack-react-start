import { describe, expect, it } from "vitest";

import { generateSbd4, generateSbd61, getSbd4Fields, getSbd61Fields } from "@/lib/sbd";

describe("SBD field mapping — mirrors generate_sbd4/generate_sbd61", () => {
  const fullCompany = {
    companyName: "Vektor Test Pty Ltd",
    cipcNum: "2021/123456/07",
    csdMaaaNum: "MAAA0123456",
    sarsTcsPin: "1234567890",
    cidbCrsNum: "4GB",
    bbbeeLevel: 2,
    authorisedSignatoryName: "Jane Doe",
    authorisedSignatoryPosition: "Director",
  };

  const minimalCompany = {
    companyName: "Minimal Co",
    cipcNum: "2020/000001/07",
  };

  const tenderFull = {
    tenderNumber: "MUN/2024-INFRA-045",
    title: "Supply and Delivery of Electrical Components for Municipal Infrastructure",
    issuingEntity: "City of Tshwane Metropolitan Municipality",
    closingDate: "2025-03-15",
  };

  const tenderMinimal = {
    title: "South African Tender",
  };

  it("SBD4 bidder details map with N/A for missing optional fields", () => {
    const fields = getSbd4Fields(minimalCompany, tenderMinimal);
    const map = Object.fromEntries(fields.bidderDetails);
    expect(map["Full Name of Bidder / Entity"]).toBe("Minimal Co");
    expect(map["CIPC Registration Number"]).toBe("2020/000001/07");
    expect(map["CSD / MAAA Number"]).toBe("N/A");
    expect(map["Tax Reference / TCS PIN"]).toBe("N/A");
    expect(map["CIDB Grade"]).toBe("N/A");
    expect(map["B-BBEE Contributor Level"]).toBe("N/A");
  });

  it("SBD4 tender details use 'To be inserted' for missing tender fields", () => {
    const fields = getSbd4Fields(fullCompany, tenderMinimal);
    const map = Object.fromEntries(fields.tenderDetails);
    expect(map["Tender Number"]).toBe("To be inserted");
    expect(map["Issuing Entity"]).toBe("To be inserted");
    expect(map["Closing Date"]).toBe("To be inserted");
    expect(map["Tender Title"]).toBe("South African Tender");
  });

  it("SBD4 preserves long tender title without clipping (field not empty)", () => {
    const longTitle =
      "Construction of New Municipal Offices Including All Civil, Electrical and Mechanical Works for the City of Tshwane Metropolitan Municipality — Phase 2 (Extended Title to Test Wrapping)";
    const fields = getSbd4Fields(fullCompany, { ...tenderFull, title: longTitle });
    const map = Object.fromEntries(fields.tenderDetails);
    expect(map["Tender Title"]).toBe(longTitle);
  });

  it("SBD4 empty cells retain row height — signature rows still have 4 entries even when empty", () => {
    const fields = getSbd4Fields(minimalCompany, tenderMinimal);
    expect(fields.signature).toHaveLength(4);
    // Signature row should be present even though signatory fields are empty
    const sigMap = Object.fromEntries(fields.signature);
    expect(sigMap["Signature"]).toBe("");
    expect(sigMap["Name of Authorised Signatory"]).toBe("");
    expect(sigMap["Position"]).toBe("");
    expect(sigMap["Date"]).toMatch(/\d{2} \w+ \d{4}/);
  });

  it("SBD4 handles XML-sensitive characters without crashing", () => {
    const companyWithXml = {
      ...fullCompany,
      companyName: "A & B <Test> Co",
      cipcNum: "2021/123456/07",
    };
    const tenderWithXml = {
      ...tenderFull,
      title: "Tender for <special> & urgent Works > 2024",
      issuingEntity: "Dept & Co <Test>",
    };
    const fields = getSbd4Fields(companyWithXml, tenderWithXml);
    const bidderMap = Object.fromEntries(fields.bidderDetails);
    expect(bidderMap["Full Name of Bidder / Entity"]).toBe("A & B <Test> Co");
    const tenderMap = Object.fromEntries(fields.tenderDetails);
    expect(tenderMap["Tender Title"]).toContain("<special>");
  });

  it("SBD4 declarations are always NO (6 rows)", () => {
    const fields = getSbd4Fields(fullCompany, tenderFull);
    expect(fields.declarations).toHaveLength(6);
    for (const [, answer] of fields.declarations) {
      expect(answer).toBe("NO");
    }
    expect(fields.declarations[0]![0]).toContain("3.1");
    expect(fields.declarations[5]![0]).toContain("3.6");
  });

  it("SBD6.1 preference system defaults to 80/20 and max points correct", () => {
    const fields80 = getSbd61Fields(fullCompany, tenderFull, "80/20", 14);
    expect(fields80.preferenceSystem).toBe("80/20");
    expect(fields80.maxPoints).toBe(20);
    expect(fields80.schedule[1]).toEqual(["1", "20"]);

    const fields90 = getSbd61Fields(fullCompany, tenderFull, "90/10", 6);
    expect(fields90.preferenceSystem).toBe("90/10");
    expect(fields90.maxPoints).toBe(10);
    expect(fields90.schedule[1]).toEqual(["1", "10"]);

    const fieldsDefault = getSbd61Fields(fullCompany, tenderFull, null, 0);
    expect(fieldsDefault.preferenceSystem).toBe("80/20");
  });

  it("SBD6.1 B-BBEE Level N/A when not set, otherwise Level X", () => {
    const fieldsWith = getSbd61Fields(fullCompany, tenderFull, "80/20", 18);
    const mapWith = Object.fromEntries(fieldsWith.bbbeeSection);
    expect(mapWith["B-BBEE Status Level of Contributor"]).toBe("Level 2");

    const fieldsWithout = getSbd61Fields(minimalCompany, tenderMinimal, "80/20", 0);
    const mapWithout = Object.fromEntries(fieldsWithout.bbbeeSection);
    expect(mapWithout["B-BBEE Status Level of Contributor"]).toBe("N/A");
  });

  it("SBD6.1 points claimed formatted as 'X / max'", () => {
    const fields = getSbd61Fields(fullCompany, tenderFull, "80/20", 14);
    const map = Object.fromEntries(fields.bbbeeSection);
    expect(map["Number of Points Claimed"]).toBe("14 / 20");

    const fields90 = getSbd61Fields(fullCompany, tenderFull, "90/10", 5);
    const map90 = Object.fromEntries(fields90.bbbeeSection);
    expect(map90["Number of Points Claimed"]).toBe("5 / 10");
  });

  it("SBD6.1 schedule has correct rows for both systems", () => {
    const f80 = getSbd61Fields(fullCompany, tenderFull, "80/20", 20);
    expect(f80.schedule).toHaveLength(10); // header + 8 levels + non-compliant
    expect(f80.schedule[0]![1]).toContain("80/20");

    const f90 = getSbd61Fields(fullCompany, tenderFull, "90/10", 10);
    expect(f90.schedule[0]![1]).toContain("90/10");
  });

  it("SBD6.1 tender fallback for missing tender_number is 'To be inserted'", () => {
    const fields = getSbd61Fields(fullCompany, tenderMinimal, "80/20", 0);
    const map = Object.fromEntries(fields.bidderDetails);
    expect(map["Tender Number"]).toBe("To be inserted");
    expect(map["Tender Title"]).toBe("South African Tender");
  });

  it("handles camelCase company/tender inputs (Drizzle shape) as well as snake_case", () => {
    const drizzleCompany = {
      companyName: "Drizzle Co",
      cipcNum: "2021/999999/07",
      csdMaaaNum: null,
      sarsTcsPin: null,
      cidbCrsNum: "6CE",
      bbbeeLevel: 4,
      authorisedSignatoryName: "John",
      authorisedSignatoryPosition: "CEO",
    };
    const drizzleTender = {
      tenderNumber: "TST/123",
      title: "Drizzle Tender",
      issuingEntity: "Dept",
      closingDate: "2025-12-01",
    };
    const fields = getSbd4Fields(drizzleCompany, drizzleTender);
    const bm = Object.fromEntries(fields.bidderDetails);
    expect(bm["Full Name of Bidder / Entity"]).toBe("Drizzle Co");
    expect(bm["CIDB Grade"]).toBe("6CE");
    const tm = Object.fromEntries(fields.tenderDetails);
    expect(tm["Tender Number"]).toBe("TST/123");
  });
});

describe("SBD PDF generation — pdf-lib bytes", () => {
  it("generateSbd4 produces valid PDF bytes with %PDF header", async () => {
    const company = {
      companyName: "Vektor Test Pty Ltd",
      cipcNum: "2021/123456/07",
      csdMaaaNum: "MAAA0123456",
      sarsTcsPin: "1234567890",
      cidbCrsNum: "4GB",
      bbbeeLevel: 1,
      authorisedSignatoryName: "Jane Doe",
      authorisedSignatoryPosition: "Director",
    };
    const tender = {
      tenderNumber: "MUN/2024-045",
      title: "Test Tender Title",
      issuingEntity: "City Test",
      closingDate: "2025-03-15",
    };
    const bytes = await generateSbd4(company, tender);
    expect(bytes.length).toBeGreaterThan(1000);
    const header = new TextDecoder().decode(bytes.slice(0, 8));
    expect(header).toContain("%PDF");
  });

  it("generateSbd61 produces valid PDF bytes and respects preference system", async () => {
    const company = {
      companyName: "Vektor Test Pty Ltd",
      cipcNum: "2021/123456/07",
      bbbeeLevel: 3,
    };
    const tender = {
      tenderNumber: "T/123",
      title: "Another Tender",
      issuingEntity: "Dept",
      closingDate: "2025-06-01",
    };
    const bytes80 = await generateSbd61(company, tender, "80/20", 14);
    const bytes90 = await generateSbd61(company, tender, "90/10", 6);
    expect(bytes80.length).toBeGreaterThan(1000);
    expect(bytes90.length).toBeGreaterThan(1000);
    expect(new TextDecoder().decode(bytes80.slice(0, 8))).toContain("%PDF");
    expect(new TextDecoder().decode(bytes90.slice(0, 8))).toContain("%PDF");
    // bytes should differ for different preference systems (schedule differs)
    expect(bytes80.length).not.toBe(bytes90.length);
  });

  it("empty cells still produce PDF without error and retain structure", async () => {
    const company = { companyName: "", cipcNum: "" };
    const tender = { title: "" };
    const bytes4 = await generateSbd4(company, tender);
    const bytes61 = await generateSbd61(company, tender, "80/20", 0);
    expect(bytes4.length).toBeGreaterThan(500);
    expect(bytes61.length).toBeGreaterThan(500);
  });

  it("handles long declaration text wrapping without throwing", async () => {
    const company = {
      companyName:
        "A very long company name that should wrap across multiple lines in the table cell to test flowable paragraph handling in the PDF generator",
      cipcNum: "2021/123456/07",
      csdMaaaNum: "MAAA0000001",
      sarsTcsPin: "1234567890",
      cidbCrsNum: "9GB CE EB ME",
      bbbeeLevel: 8,
    };
    const tender = {
      tenderNumber: "LONG/TENDER/NUMBER/WITH/VERY/LONG/IDENTIFIER/2024-001",
      title:
        "This is an extremely long tender title that is designed to test the text wrapping capabilities of the pdf-lib table implementation and ensure that long strings do not overflow the page margins but instead break into multiple lines correctly",
      issuingEntity:
        "A Very Long Issuing Entity Name That Also Needs Wrapping — City of Somewhere Metropolitan Municipality Department of Infrastructure Development and Service Delivery",
      closingDate: "2025-12-31",
    };
    const bytes = await generateSbd4(company, tender);
    expect(bytes.length).toBeGreaterThan(1000);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  });

  it("handles XML-sensitive characters in PDF generation without parser crash", async () => {
    const company = { companyName: "A & B <Test> & Co", cipcNum: "2021/123456/07" };
    const tender = { title: "Tender <special> & urgent > 2024", tenderNumber: "T&123<>" };
    const bytes4 = await generateSbd4(company, tender);
    const bytes61 = await generateSbd61(company, tender, "80/20", 10);
    expect(bytes4.length).toBeGreaterThan(500);
    expect(bytes61.length).toBeGreaterThan(500);
  });
});
