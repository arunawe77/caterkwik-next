import type { OrderStatus } from "@prisma/client";

// Where an order may go next. The team moves it forward by hand; an order that is shipped
// cannot be cancelled, and a finished or cancelled one is closed.
const NEXT: Record<OrderStatus, OrderStatus[]> = {
  AWAITING_PAYMENT: ["PAID", "CANCELLED"],
  PAID: ["PROCESSING", "CANCELLED"],
  PROCESSING: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
};

export const nextStatuses = (from: OrderStatus): OrderStatus[] => NEXT[from];
export const canMove = (from: OrderStatus, to: OrderStatus) => NEXT[from].includes(to);

export const STATUS_LABEL: Record<OrderStatus, string> = {
  AWAITING_PAYMENT: "Awaiting payment",
  PAID: "Paid",
  PROCESSING: "Processing",
  SHIPPED: "Shipped",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};
