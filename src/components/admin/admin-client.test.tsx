// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AssistantDock } from "@/components/admin/assistant-dock";
import { AreaChart, BarList, niceMax } from "@/components/admin/charts";
import { SelectAll } from "@/components/admin/select-all";

// jsdom does not implement scrolling.
Element.prototype.scrollIntoView = () => {};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const reply = (body: unknown, ok = true) => ({ ok, json: async () => body });

describe("AssistantDock", () => {
  it("opens, sends a message and shows the reply with what the assistant did", async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply({ reply: "Dropped it to £90.", actions: [{ tool: "update_product", ok: true, note: "Updated Beta" }, { tool: "search_products", ok: true, note: "Looked it up" }], pending: [] }));
    vi.stubGlobal("fetch", fetchMock);
    render(<AssistantDock configured />);

    fireEvent.click(screen.getByText("Ask the assistant"));
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "drop beta to 90" } });
    fireEvent.click(screen.getByText("Send"));

    expect(await screen.findByText(/Dropped it to/)).toBeTruthy();
    expect(screen.getByText("Updated Beta")).toBeTruthy();
    expect(screen.queryByText("Looked it up")).toBeNull();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/admin/assistant");
    expect(JSON.parse(init.body)).toEqual({ messages: [{ role: "user", content: "drop beta to 90" }] });
  });

  it("sends a suggestion, and Enter submits while Shift+Enter does not", async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply({ reply: "ok", actions: [], pending: [] }));
    vi.stubGlobal("fetch", fetchMock);
    render(<AssistantDock configured />);
    fireEvent.click(screen.getByText("Ask the assistant"));
    fireEvent.click(screen.getByText("What changed recently?"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const box = screen.getByLabelText("Message");
    fireEvent.change(box, { target: { value: "line" } });
    fireEvent.keyDown(box, { key: "Enter", shiftKey: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(box, { key: "Enter" });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it("shows a proposal as a card that only changes anything when Apply is pressed", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(reply({ reply: "Proposed.", actions: [], pending: [{ id: "p1", summary: "Delete \"Old Fryer\"" }] }))
      .mockResolvedValueOnce(reply({ message: "Done." }));
    vi.stubGlobal("fetch", fetchMock);
    render(<AssistantDock configured />);
    fireEvent.click(screen.getByText("Ask the assistant"));
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "delete old fryer" } });
    fireEvent.click(screen.getByText("Send"));

    expect(await screen.findByText(/Delete "Old Fryer"/)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText("Apply"));
    expect(await screen.findByText(/Applied\./)).toBeTruthy();
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ id: "p1", approve: true });
    expect(screen.queryByText("Apply")).toBeNull();
  });

  it("can discard a proposal, and reports a proposal that fails", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(reply({ reply: "Proposed.", actions: [], pending: [{ id: "p1", summary: "A" }, { id: "p2", summary: "B" }] }))
      .mockResolvedValueOnce(reply({ message: "Discarded. Nothing was changed." }))
      .mockResolvedValueOnce(reply({ error: "That request has expired." }, false));
    vi.stubGlobal("fetch", fetchMock);
    render(<AssistantDock configured />);
    fireEvent.click(screen.getByText("Ask the assistant"));
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "go" } });
    fireEvent.click(screen.getByText("Send"));

    const [discard] = await screen.findAllByText("Discard");
    fireEvent.click(discard);
    expect(await screen.findByText(/Nothing was changed/)).toBeTruthy();

    fireEvent.click(await screen.findByText("Apply"));
    expect(await screen.findByText(/Not applied\. That request has expired\./)).toBeTruthy();
  });

  it("shows an error from the server in the conversation, and warns when no key is set", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply({ error: "The assistant is not configured (no ANTHROPIC_API_KEY)." }, false)));
    render(<AssistantDock configured={false} />);
    expect(screen.getByText(/needs ANTHROPIC_API_KEY/)).toBeTruthy();
    fireEvent.click(screen.getByText("Ask the assistant"));
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "hi" } });
    fireEvent.click(screen.getByText("Send"));
    expect(await screen.findByText(/is not configured \(no ANTHROPIC_API_KEY\)\./)).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Close"));
    expect(screen.getByText("Ask the assistant")).toBeTruthy();
  });

  it("does not send an empty message, or a second one while busy", () => {
    const fetchMock = vi.fn(() => new Promise(() => {}));
    vi.stubGlobal("fetch", fetchMock);
    render(<AssistantDock configured />);
    fireEvent.click(screen.getByText("Ask the assistant"));
    fireEvent.keyDown(screen.getByLabelText("Message"), { key: "Enter" });
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "one" } });
    fireEvent.click(screen.getByText("Send"));
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "two" } });
    fireEvent.keyDown(screen.getByLabelText("Message"), { key: "Enter" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("SelectAll", () => {
  it("ticks and clears every row in its form", () => {
    render(
      <form>
        <SelectAll />
        <input type="checkbox" name="ids" value="a" />
        <input type="checkbox" name="ids" value="b" />
        <input type="checkbox" name="other" />
      </form>,
    );
    const rows = () => [...document.querySelectorAll<HTMLInputElement>('input[name="ids"]')].map((b) => b.checked);
    fireEvent.click(screen.getByLabelText("Select all on this page"));
    expect(rows()).toEqual([true, true]);
    expect(document.querySelector<HTMLInputElement>('input[name="other"]')!.checked).toBe(false);
    fireEvent.click(screen.getByLabelText("Select all on this page"));
    expect(rows()).toEqual([false, false]);
  });
});

describe("niceMax", () => {
  it("rounds the top of the axis to a clean number with four even steps", () => {
    expect(niceMax(0)).toEqual({ top: 4, step: 1 });
    expect(niceMax(930)).toEqual({ top: 1000, step: 250 });
    expect(niceMax(4100)).toEqual({ top: 6000, step: 1500 });
    expect(niceMax(7)).toEqual({ top: 8, step: 2 });
    expect(niceMax(100).top).toBeGreaterThanOrEqual(100);
  });
});

describe("AreaChart", () => {
  const points = [
    { label: "1 Oct", value: 100, previous: 50 },
    { label: "2 Oct", value: 400, previous: 80 },
    { label: "3 Oct", value: 250, previous: 300 },
  ];

  it("shows a tooltip for the day under the pointer, and hides it on leave", () => {
    const { container } = render(<AreaChart points={points} kind="money" title="Revenue" previousLabel="Before" />);
    const box = container.querySelector(".chart-box") as HTMLElement;
    box.getBoundingClientRect = () => ({ left: 0, width: 760, top: 0, height: 250, right: 760, bottom: 250, x: 0, y: 0, toJSON: () => ({}) });
    expect(screen.queryByRole("status")).toBeNull();

    fireEvent.pointerMove(box, { clientX: 760 / 2 });
    const tip = screen.getByRole("status");
    expect(tip.textContent).toContain("2 Oct");
    expect(tip.textContent).toContain("Revenue: £400");
    expect(tip.textContent).toContain("Before: £80");

    fireEvent.pointerMove(box, { clientX: 100000 });
    expect(screen.getByRole("status").textContent).toContain("3 Oct");
    fireEvent.pointerMove(box, { clientX: -100000 });
    expect(screen.getByRole("status").textContent).toContain("1 Oct");
    fireEvent.pointerLeave(box);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("offers the same numbers as a table, and a legend only when there is a comparison", () => {
    const { container, rerender } = render(<AreaChart points={points} kind="money" title="Revenue" />);
    expect(container.querySelectorAll("details tbody tr")).toHaveLength(3);
    expect(container.querySelector(".legend")).not.toBeNull();
    rerender(<AreaChart points={points.map(({ label, value }) => ({ label, value }))} kind="count" title="Orders" />);
    expect(container.querySelector(".legend")).toBeNull();
    expect(container.querySelector("details tbody")!.textContent).toContain("400");
  });

  it("draws a single point and an all-zero series without breaking", () => {
    const one = render(<AreaChart points={[{ label: "1 Oct", value: 5 }]} kind="count" title="Orders" />);
    expect(one.container.querySelector("polyline.cur")).not.toBeNull();
    one.unmount();
    const zero = render(<AreaChart points={[{ label: "a", value: 0 }, { label: "b", value: 0 }]} kind="money" title="Revenue" />);
    expect(zero.container.querySelectorAll(".grid")).toHaveLength(5);
  });
});

describe("BarList", () => {
  it("scales bars to the largest, with links and values at the tip", () => {
    const { container } = render(<BarList kind="money" bars={[{ label: "Big", value: 1000, href: "/x", note: "3 sold" }, { label: "Small", value: 250 }, { label: "Tiny", value: 0 }]} />);
    const widths = [...container.querySelectorAll<HTMLElement>(".bar-fill")].map((b) => b.style.width);
    expect(widths).toEqual(["100%", "25%", "1.5%"]);
    expect(container.querySelector("a")!.getAttribute("href")).toBe("/x");
    expect(container.querySelector("li")!.getAttribute("title")).toBe("Big: £1,000, 3 sold");
    expect(container.textContent).toContain("£250");
  });

  it("counts without a currency, and says so when empty", () => {
    const { container } = render(<BarList kind="count" bars={[{ label: "Paid", value: 1234 }]} />);
    expect(container.textContent).toContain("1,234");
    expect(container.textContent).not.toContain("£");
    cleanup();
    expect(render(<BarList kind="money" bars={[]} empty="Nothing here." />).container.textContent).toBe("Nothing here.");
    expect(render(<BarList kind="money" bars={[]} />).container.textContent).toContain("Nothing to show yet.");
  });
});
