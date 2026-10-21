// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LegacyScripts } from "@/components/legacy-scripts";
import { VatSwitch } from "@/components/vat-switch";

// Node 25 ships its own localStorage global, which hides jsdom's; use a plain in-memory one.
const memory = new Map<string, string>();
const storage = {
  getItem: (k: string) => memory.get(k) ?? null,
  setItem: (k: string, v: string) => void memory.set(k, String(v)),
  clear: () => memory.clear(),
};

beforeEach(() => {
  vi.stubGlobal("localStorage", storage);
  document.body.className = "";
  document.body.querySelectorAll("script").forEach((s) => s.remove());
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("VatSwitch", () => {
  it("starts on ex VAT and swaps the body class when inc VAT is chosen", () => {
    render(<VatSwitch />);
    expect(screen.getByText("Ex. VAT").getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByText("Inc. VAT"));
    expect(document.body.classList.contains("showinc")).toBe(true);
    expect(screen.getByText("Inc. VAT").getAttribute("aria-pressed")).toBe("true");
    expect(localStorage.getItem("vat")).toBe("inc");

    fireEvent.click(screen.getByText("Ex. VAT"));
    expect(document.body.classList.contains("showinc")).toBe(false);
    expect(screen.getByText("Ex. VAT").getAttribute("aria-pressed")).toBe("true");
  });

  it("reflects a choice already on the page, and survives storage being blocked", () => {
    document.body.classList.add("showinc");
    vi.spyOn(storage, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    render(<VatSwitch />);
    expect(screen.getByText("Inc. VAT").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByText("Ex. VAT"));
    expect(document.body.classList.contains("showinc")).toBe(false);
  });
});

// Scripts record that they ran on <body>, the one object the test and the script share.
const log = () => (document.body.dataset.log ?? "").split(",").filter(Boolean);
const scripts = () => [...document.body.querySelectorAll("script")].map((el) => el.getAttribute("src") ?? "inline");
const pending = (src: string) => document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
const mark = (name: string) => ({ text: `document.body.dataset.log = (document.body.dataset.log ?? "") + "${name},"` });

describe("LegacyScripts", () => {
  beforeEach(() => { delete document.body.dataset.log; });

  it("runs inline scripts at once and waits for each external one to load", async () => {
    const { unmount } = render(<LegacyScripts scripts={[mark("one"), { src: "/assets/x.js" }, mark("two")]} />);

    await waitFor(() => expect(pending("/assets/x.js")).not.toBeNull());
    expect(log()).toEqual(["one"]);

    act(() => { pending("/assets/x.js")!.onload!(new Event("load")); });
    await waitFor(() => expect(log()).toEqual(["one", "two"]));

    unmount();
    expect(scripts()).toEqual([]);
  });

  it("continues past a script that fails to load", async () => {
    render(<LegacyScripts scripts={[{ src: "/assets/missing.js" }, mark("after")]} />);
    await waitFor(() => expect(pending("/assets/missing.js")).not.toBeNull());
    act(() => { pending("/assets/missing.js")!.onerror!(new Event("error")); });
    await waitFor(() => expect(log()).toEqual(["after"]));
  });

  it("removes a script that is still loading, and runs nothing queued behind it, on unmount", async () => {
    const { unmount } = render(<LegacyScripts scripts={[{ src: "/assets/slow.js" }, mark("late")]} />);
    await waitFor(() => expect(pending("/assets/slow.js")).not.toBeNull());
    const slow = pending("/assets/slow.js")!;
    unmount();
    expect(scripts()).toEqual([]);
    slow.onload?.(new Event("load"));
    await Promise.resolve();
    expect(log()).toEqual([]);
  });

  it("treats a script with no text as empty", async () => {
    render(<LegacyScripts scripts={[{}]} />);
    await waitFor(() => expect(scripts()).toEqual(["inline"]));
  });
});
