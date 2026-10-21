const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });

export const money = (n: number) => gbp.format(n);

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// Whole pence to pounds: orders store money as integers.
export const pence = (p: number) => money(p / 100);

export const shortDate = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
