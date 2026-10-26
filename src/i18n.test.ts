import { describe, expect, it } from "vitest";
import { formatDate, formatNumber, formatUnit, localizeError, normalizeLocalizedNumber, t } from "./i18n";

describe("English and Persian localization", () => {
  it("translates navigation and operational page content into Persian", () => {
    for (const phrase of [
      "Dashboard", "Accounting", "Human resources", "Human Resources", "Organization", "Procurement", "Reports",
      "Trial balance", "Employee directory", "Stock movements",
      "Apply filters", "No data for the selected filters.",
      "Journal entry must be balanced before it can be posted.",
      "Net debit/(credit)", "No posted financial activity to report.",
      "No employee records yet. Add a department, position, or employee to start.",
      "Lead", "Total records", "Current organization", "At or below reorder point",
      "Account code", "Debit", "Credit", "Department", "Job position",
      "Add Product", "Purchase cost", "Selling price", "Opening stock",
      "Reorder point", "Out of stock", "Stock status", "Unit of measure",
    ]) {
      expect(t("fa", phrase)).not.toBe(phrase);
    }
  });

  it("keeps English text and formatting when English is selected", () => {
    expect(t("en", "Trial balance")).toBe("Trial balance");
    expect(formatNumber(1234, "en")).toBe("1,234");
    expect(formatNumber(1234, "fa")).not.toBe("1,234");
  });

  it("formats dates using Persian and English locales", () => {
    expect(formatDate("2026-01-01", "fa")).not.toBe(formatDate("2026-01-01", "en"));
  });

  it("uses a safe Persian fallback for missing translations", () => {
    expect(t("fa", "Unknown interface text")).toBe("ترجمه در دسترس نیست");
  });

  it("localizes known API and validation errors without changing English", () => {
    expect(localizeError("fa", "Stock cannot become negative.")).toBe("موجودی نمی‌تواند منفی شود.");
    expect(localizeError("en", "Stock cannot become negative.")).toBe("Stock cannot become negative.");
    expect(localizeError("fa", "Unknown server response")).toBe("درخواست ناموفق بود.");
  });

  it("normalizes Persian and Arabic numeric digits and separators for API input", () => {
    expect(normalizeLocalizedNumber("۱٬۲۳۴٫۵۰")).toBe("1234.50");
    expect(normalizeLocalizedNumber("١،٢٣٤٫٥٠")).toBe("1234.50");
  });

  it("formats invalid dates safely instead of throwing during page rendering", () => {
    expect(formatDate("not-a-date", "fa")).toBe("—");
  });

  it("translates known units without corrupting user-defined unit labels", () => {
    expect(formatUnit("unit", "fa")).toBe("عدد");
    expect(formatUnit("piece", "fa")).toBe("piece");
  });
});
