import { describe, expect, it } from "vitest";
import { createDefaultAppData } from "./defaultData";
import { renderCompanyHtml } from "./pdf";
import { devixThemes, getTheme, themeCssVariables } from "./themes";

describe("Devix themes", () => {
  it("provides distinct complete palettes", () => {
    expect(devixThemes.length).toBeGreaterThanOrEqual(8);
    expect(new Set(devixThemes.map((theme) => theme.id)).size).toBe(devixThemes.length);

    for (const theme of devixThemes) {
      expect(Object.values(theme.colors).every(Boolean)).toBe(true);
      expect(themeCssVariables(theme)["--theme-primary"]).toBe(theme.colors.primary);
    }
  });

  it("falls back to Devix for an unknown theme", () => {
    expect(getTheme("unknown").id).toBe("devix");
  });

  it("uses the selected palette in company PDFs", () => {
    const company = { ...createDefaultAppData().company, themeId: "ocean" as const, name: "Devix" };
    const html = renderCompanyHtml(company);
    const theme = getTheme("ocean");

    expect(html).toContain(theme.colors.primary);
    expect(html).toContain(theme.colors.accent);
    expect(html).toContain(theme.colors.soft);
  });
});
