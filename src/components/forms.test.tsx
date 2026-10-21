// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/ovens" }));
vi.mock("@/server/enquiry-actions", () => ({ submitEnquiry: vi.fn(async () => ({ ok: true })) }));

import { CartLink } from "@/components/cart-link";
import { ClearBasket } from "@/components/clear-basket";
import { EnquiryForm } from "@/components/enquiry-form";
import { ActionForm, Field } from "@/components/forms";
import { serializeCart } from "@/lib/cart";

afterEach(() => {
  cleanup();
  document.cookie = "ck_cart=; path=/; max-age=0";
});

describe("CartLink", () => {
  it("shows a bare link for an empty basket and the unit count otherwise", () => {
    const { unmount } = render(<CartLink />);
    expect(screen.getByRole("link").textContent).toBe("Basket");
    unmount();

    // As Next writes it: the serialised basket, URL-encoded once more.
    document.cookie = `ck_cart=${encodeURIComponent(serializeCart([{ id: "cr6d", qty: 2 }, { id: "slr6c", qty: 1 }]))}; path=/`;
    render(<CartLink />);
    expect(screen.getByRole("link").textContent).toBe("Basket (3)");
  });
});

describe("ClearBasket", () => {
  it("expires the basket cookie in the browser", () => {
    document.cookie = `ck_cart=${serializeCart([{ id: "cr6d", qty: 1 }])}; path=/`;
    expect(document.cookie).toContain("ck_cart");
    render(<ClearBasket />);
    expect(document.cookie).not.toContain("ck_cart");
  });
});

describe("ActionForm and Field", () => {
  it("shows an error from the action", async () => {
    const action = vi.fn(async () => ({ error: "Nope" }));
    const { container } = render(<ActionForm action={action} submit="Go"><Field name="a" label="A" required /></ActionForm>);
    fireEvent.change(container.querySelector("input[name=a]")!, { target: { value: "filled" } }); // a required field blocks an empty submit
    fireEvent.click(screen.getByText("Go"));
    expect((await screen.findByRole("alert")).textContent).toBe("Nope");
    expect(screen.getByText("A").textContent).toContain("*");
  });

  it("shows the success message once, and a hint and textarea when asked", async () => {
    const action = vi.fn(async () => ({ ok: true }));
    render(<ActionForm action={action} submit="Go" success="Done!"><Field name="m" label="M" rows={3} hint="Help" /></ActionForm>);
    expect(screen.getByText("Help")).toBeTruthy();
    expect(document.querySelector("textarea")).not.toBeNull();
    fireEvent.click(screen.getByText("Go"));
    expect((await screen.findByRole("status")).textContent).toBe("Done!");
  });

  it("is quiet on success when there is no message to show", async () => {
    render(<ActionForm action={async () => ({ ok: true })} submit="Go"><Field name="e" label="E" type="email" autoComplete="email" defaultValue="x@y.co" /></ActionForm>);
    fireEvent.click(screen.getByText("Go"));
    await waitFor(() => expect(screen.queryByText("One moment...")).toBeNull());
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("EnquiryForm", () => {
  it("carries the kind and product as hidden fields on a product page", () => {
    const { container } = render(<EnquiryForm kind="QUOTE" productId="cr6d" />);
    expect(container.querySelector('input[name="kind"]')?.getAttribute("value")).toBe("QUOTE");
    expect(container.querySelector('input[name="productId"]')?.getAttribute("value")).toBe("cr6d");
    expect(screen.getByText("Request a quote", { selector: "button" })).toBeTruthy();
    expect(screen.getByText(/Quantity, delivery postcode/)).toBeTruthy();
  });

  it("lets a visitor on the contact page choose what they need", () => {
    const { container } = render(<EnquiryForm kind="GENERAL" choose />);
    expect(container.querySelector("select[name=kind]")).not.toBeNull();
    expect(container.querySelector('input[name="productId"]')).toBeNull();
    expect(screen.getByText("Send", { selector: "button" })).toBeTruthy();
  });

  it("thanks the visitor after sending", async () => {
    render(<EnquiryForm kind="CALLBACK" />);
    fireEvent.change(screen.getByLabelText(/Your name/), { target: { value: "Sam" } });
    fireEvent.change(screen.getByLabelText(/Email/), { target: { value: "s@x.co" } });
    fireEvent.change(screen.getByLabelText(/Your message/), { target: { value: "Ring me" } });
    fireEvent.click(screen.getByText("Request a call back", { selector: "button" }));
    expect((await screen.findByRole("status")).textContent).toContain("The team has your message");
  });
});
