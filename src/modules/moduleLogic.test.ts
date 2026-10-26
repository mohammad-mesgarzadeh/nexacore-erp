import { describe, expect, it } from "vitest";
import { buildReportQuery } from "../data/reporting";
import { getJournalLineError, getJournalTotals, isDateRangeValid } from "./moduleLogic";

describe("accounting form validation", () => {
  it("rejects unbalanced, incomplete, and one-line journals", () => {
    expect(getJournalLineError([{ account: "1", debit: "10", credit: "" }, { account: "2", debit: "", credit: "9" }]))
      .toBe("Journal entry must be balanced before it can be posted.");
    expect(getJournalLineError([{ account: "1", debit: "10", credit: "2" }, { account: "2", debit: "", credit: "8" }]))
      .toBe("Each line needs exactly one positive debit or credit.");
    expect(getJournalLineError([{ account: "1", debit: "10", credit: "" }]))
      .toBe("Journal entry must have at least two lines.");
  });

  it("accepts balanced multi-line entries using cents precision", () => {
    const lines = [
      { account: "1", debit: "0.10", credit: "" },
      { account: "2", debit: "0.20", credit: "" },
      { account: "3", debit: "", credit: "0.30" },
    ];
    expect(getJournalLineError(lines)).toBeNull();
    expect(getJournalTotals(lines)).toEqual({ debits: 0.3, credits: 0.3, difference: 0 });
  });
});

describe("report filters", () => {
  it("validates date ranges and encodes applied filters into backend query parameters", () => {
    expect(isDateRangeValid("2026-01-01", "2026-01-31")).toBe(true);
    expect(isDateRangeValid("2026-02-01", "2026-01-31")).toBe(false);
    expect(buildReportQuery({ from: "2026-01-01", to: "2026-01-31", status: "paid" }))
      .toBe("from=2026-01-01&to=2026-01-31&status=paid");
    expect(buildReportQuery({ from: "", status: "" })).toBe("");
  });
});
