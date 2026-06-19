const usdRate = Number(import.meta.env.VITE_USD_RATE || 83);

const inr = (value = 0) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 }).format(Number(value || 0));

const usd = (value = 0) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(Number(value || 0) / usdRate);

export const formatCurrency = (value = 0, mode = "INR") => (mode === "USD" ? usd(value) : inr(value));

export const toInrAmount = (value = 0, mode = "INR") => (mode === "USD" ? Number(value || 0) * usdRate : Number(value || 0));

export const fromInrAmount = (value = 0, mode = "INR") => (mode === "USD" ? Number(value || 0) / usdRate : Number(value || 0));

export const currency = (value = 0) => formatCurrency(value, "INR");

export const shortDate = (value) => (value ? new Date(value).toLocaleDateString("en-IN") : "-");
