import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("projects mobile UI", () => {
  it("renders project cards on mobile and preserves desktop table", () => {
    const component = readFileSync("src/components/dashboard/sections/projects.tsx", "utf8");
    const styles = readFileSync("src/app/globals.css", "utf8");

    expect(component).toContain("function ProjectMobileCard");
    expect(component).toContain('className="projects-mobile-list"');
    expect(component).toContain('className="data-panel projects-desktop-panel"');
    expect(styles).toContain(".projects-mobile-list { display: none; }");
    expect(styles).toContain(".projects-desktop-panel { display: none; }");
    expect(styles).toContain(".project-mobile-card");
  });
});
