// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ProjectLogo, type ProjectLogoData } from "./project-logo";

const base: ProjectLogoData = {
  identifier: "GN",
  logo_emoji: null,
  logo_image_url: null,
  name: "GigsNano",
};

afterEach(cleanup);

describe("ProjectLogo", () => {
  it("shows the uploaded image when present (wins over emoji)", () => {
    render(
      <ProjectLogo project={{ ...base, logo_image_url: "/img/x/", logo_emoji: "🚀" }} />,
    );
    const img = screen.getByRole("img", { name: "GigsNano logo" });
    expect(img).toHaveAttribute("src", "/img/x/");
    // no emoji text rendered
    expect(screen.queryByText("🚀")).toBeNull();
  });

  it("falls back to the emoji when there's no image", () => {
    render(<ProjectLogo project={{ ...base, logo_emoji: "🚀" }} />);
    expect(screen.getByText("🚀")).toBeInTheDocument();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("falls back to the identifier initials when neither is set", () => {
    render(<ProjectLogo project={base} />);
    expect(screen.getByText("GN")).toBeInTheDocument();
  });
});
