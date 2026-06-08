import "../../test/happydom";
import { describe, expect, test } from "bun:test";
import { render } from "@testing-library/react";
import { format, parseISO } from "date-fns";
import { ReviewCard } from "./ReviewCard";

// Note: we import render from @testing-library/react and use the container-bound
// query helpers (getByText, getByRole) from render's return value.
// screen.getByText requires document to be available at @testing-library/dom module
// load time; in Bun's monorepo root context the module is cached before the happydom
// preload fires, so we use per-render queries instead.

const testReview = {
  id: "1",
  appId: "1",
  author: "Jane",
  title: "Nice",
  content: "Great app",
  rating: 4,
  version: "1.0",
  submittedAt: "2026-06-02T14:00:39-07:00",
};

describe("ReviewCard", () => {
  test("renders author, content, and 4 filled stars", () => {
    const { getByText, getByRole } = render(<ReviewCard review={testReview} />);

    expect(getByText("Jane")).toBeDefined();
    expect(getByText("Great app")).toBeDefined();

    // assert 4 filled stars via aria-label "4 out of 5"
    const starsEl = getByRole("img", { name: "4 out of 5" });
    expect(starsEl).toBeDefined();
  });

  test("renders title", () => {
    const { getByText } = render(<ReviewCard review={testReview} />);
    expect(getByText("Nice")).toBeDefined();
  });

  test("renders version when provided", () => {
    const { getByText } = render(<ReviewCard review={testReview} />);
    expect(getByText("Version 1.0")).toBeDefined();
  });

  test("does not render version when null", () => {
    const { container } = render(<ReviewCard review={{ ...testReview, version: null }} />);
    const versionEl = container.querySelector(".review-card-version");
    expect(versionEl).toBeNull();
  });

  test("renders both relative and absolute time", () => {
    const { container } = render(<ReviewCard review={testReview} />);
    const abbr = container.querySelector("abbr");
    expect(abbr).toBeDefined();
    const absoluteTime = format(parseISO(testReview.submittedAt), "PPpp");
    expect(abbr?.getAttribute("title")).toBe(absoluteTime);
  });

  test("renders 5 filled stars for rating 5", () => {
    const { getByRole } = render(<ReviewCard review={{ ...testReview, rating: 5 }} />);
    const starsEl = getByRole("img", { name: "5 out of 5" });
    expect(starsEl).toBeDefined();
  });

  test("renders 1 filled star for rating 1", () => {
    const { getByRole } = render(<ReviewCard review={{ ...testReview, rating: 1 }} />);
    const starsEl = getByRole("img", { name: "1 out of 5" });
    expect(starsEl).toBeDefined();
  });
});
