// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import SyncAttention from "./SyncAttention";

it("offers a review action with error details and clears it when resolved", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div"), root = createRoot(host), onReview = vi.fn();
  try {
    await act(async () => root.render(<SyncAttention error="Drive is offline" onReview={onReview}/>));
    const button = host.querySelector("button")!;
    expect(button.title).toBe("Drive is offline");
    expect(button.textContent).toContain("Review");
    await act(async () => button.click());
    expect(onReview).toHaveBeenCalledOnce();
    await act(async () => root.render(<SyncAttention onReview={onReview}/>));
    expect(host.querySelector("button")).toBeNull();
  } finally {
    await act(async () => root.unmount()); vi.unstubAllGlobals();
  }
});
