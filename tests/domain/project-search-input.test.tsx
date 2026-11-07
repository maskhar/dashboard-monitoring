// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProjectSearchInput } from "../../src/components/dashboard/sections/project-search-input";

const projects = [
  { id: "11111111-1111-4111-8111-111111111111", code: "DP-001", brand: "Pulangara" },
  { id: "22222222-2222-4222-8222-222222222222", code: "DP-002", brand: "Khong Guan" },
] as never[];

describe("ProjectSearchInput", () => {
  it("accepts typed project code or brand and returns selected project id", () => {
    const onChange = vi.fn();
    render(<ProjectSearchInput projects={projects} value="" ariaLabel="Cari proyek" onChange={onChange} />);
    const input = screen.getByLabelText("Cari proyek");
    fireEvent.change(input, { target: { value: "DP-002 - Khong Guan" } });
    expect(onChange).toHaveBeenCalledWith("22222222-2222-4222-8222-222222222222");
  });

  it("restores current selection when typed value does not match", () => {
    render(<ProjectSearchInput projects={projects} value="11111111-1111-4111-8111-111111111111" ariaLabel="Cari proyek terpilih" onChange={() => undefined} />);
    const input = screen.getByLabelText("Cari proyek terpilih");
    fireEvent.change(input, { target: { value: "Tidak ada" } });
    fireEvent.blur(input);
    expect(input).toHaveValue("DP-001 - Pulangara");
  });
});
