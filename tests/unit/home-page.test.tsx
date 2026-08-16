import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { HomePage } from "@/components/home-page";

describe("HomePage", () => {
  it("renders the application foundation", () => {
    render(<HomePage />);

    expect(screen.getByRole("heading", { name: "TanStack Start is ready." })).toBeTruthy();
    expect(screen.getByText("Vektor")).toBeTruthy();
  });
});
