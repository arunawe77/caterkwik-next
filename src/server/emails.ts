import type { Enquiry, Order, OrderLine } from "@prisma/client";
import { COMPANY, SITE_URL } from "@/lib/site";
import type { Mail } from "@/server/mail";

// Plain-text emails. Each returns the subject and body; the caller decides who receives it.

type Body = Pick<Mail, "subject" | "text">;

const gbp = (pence: number) => `£${(pence / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
const signoff = `${COMPANY.name}\n${COMPANY.phone} (${COMPANY.hours[0]})\n${SITE_URL}`;

const KIND = { QUOTE: "Quote request", CALLBACK: "Call-back request", GENERAL: "Enquiry" } as const;

export function enquiryForTeam(e: Enquiry): Body {
  return {
    subject: `${KIND[e.kind]} from ${e.name}${e.productName ? `: ${e.productName}` : ""}`,
    text: [
      `${KIND[e.kind]} received.`,
      "",
      `Name: ${e.name}`,
      `Email: ${e.email}`,
      e.phone && `Phone: ${e.phone}`,
      e.company && `Company: ${e.company}`,
      e.productName && `Product: ${e.productName}${e.productId ? ` (${SITE_URL}/search?q=${encodeURIComponent(e.productId)})` : ""}`,
      "",
      e.message,
      "",
      `Open it: ${SITE_URL}/admin/enquiries`,
    ].filter((l): l is string => typeof l === "string").join("\n"),
  };
}

export function enquiryForCustomer(e: Enquiry): Body {
  return {
    subject: `We have your ${KIND[e.kind].toLowerCase()}`,
    text: `Hello ${e.name},\n\nThanks for getting in touch. The team will reply as soon as they can, usually within one working day. If it is urgent, call ${COMPANY.phone}.\n\nYou wrote:\n${e.message}\n\n${signoff}`,
  };
}

export function orderConfirmation(order: Order & { lines: OrderLine[] }): Body {
  const lines = order.lines.map((l) => `${l.qty} x ${l.name}: ${gbp(l.unitIncPence * l.qty)}`);
  return {
    subject: `Caterkwik order #${order.number}`,
    text: [
      `Hello ${order.name},`,
      "",
      order.status === "AWAITING_PAYMENT"
        ? `Thanks for your order. We have it, and the team will contact you to arrange payment.`
        : `Thanks for your order. We have received your payment.`,
      "",
      ...lines,
      "",
      `Total including VAT: ${gbp(order.totalIncPence)}`,
      "",
      "Delivery is kerbside, and the team will be in touch about delivery and installation.",
      "",
      `Deliver to: ${[order.addressLine1, order.addressLine2, order.city, order.postcode].filter(Boolean).join(", ")}`,
      "",
      signoff,
    ].join("\n"),
  };
}

export function orderForTeam(order: Order & { lines: OrderLine[] }): Body {
  return {
    subject: `New order #${order.number} (${order.status === "PAID" ? "paid" : "awaiting payment"}): ${gbp(order.totalIncPence)}`,
    text: `${order.name} <${order.email}>, ${order.phone}\n\n${order.lines.map((l) => `${l.qty} x ${l.name}`).join("\n")}\n\nTotal ${gbp(order.totalIncPence)}\n${SITE_URL}/admin/orders/${order.id}`,
  };
}

export function passwordReset(name: string, token: string): Body {
  return {
    subject: "Reset your Caterkwik password",
    text: `Hello ${name},\n\nUse this link to choose a new password. It works once and expires in one hour:\n${SITE_URL}/account/reset/${token}\n\nIf you did not ask for this, ignore this email and your password stays as it is.\n\n${signoff}`,
  };
}

export function orderShipped(order: Order & { lines: OrderLine[] }): Body {
  return {
    subject: `Caterkwik order #${order.number} has shipped`,
    text: `Hello ${order.name},\n\nYour order #${order.number} is on its way.${order.trackingNote ? `\n\n${order.trackingNote}` : ""}\n\nThe team will be in touch about delivery and installation. Call ${COMPANY.phone} if you need us.\n\n${signoff}`,
  };
}
