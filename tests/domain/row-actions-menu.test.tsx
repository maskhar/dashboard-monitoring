// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RowActionsMenu } from "../../src/components/dashboard/sections/row-actions-menu";

describe("RowActionsMenu", () => {
  it("renders the dropdown in a body portal without expanding the table row", () => {
    render(<table><tbody><tr data-testid="row"><td><RowActionsMenu label="Aksi proyek DP-001"><button type="button" role="menuitem">Arsipkan</button></RowActionsMenu></td></tr></tbody></table>);
    fireEvent.click(screen.getByRole("button", { name: "Aksi proyek DP-001" }));
    const menu = screen.getByRole("menu");
    expect(menu).toBeVisible();
    expect(menu.parentElement).toBe(document.body);
    expect(screen.getByTestId("row")).not.toContainElement(menu);
  });
});
