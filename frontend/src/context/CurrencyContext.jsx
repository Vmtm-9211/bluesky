import { createContext, useContext, useMemo, useState } from "react";
import { formatCurrency } from "../utils/format";

const CurrencyContext = createContext(null);

export function CurrencyProvider({ children }) {
  const [currencyMode, setCurrencyMode] = useState(
    () => localStorage.getItem("currencyMode") || "INR"
  );

  function toggleCurrency() {
    setCurrencyMode((current) => {
      const next = current === "INR" ? "USD" : "INR";
      localStorage.setItem("currencyMode", next);
      return next;
    });
  }

  const value = useMemo(
    () => ({
      currencyMode,
      toggleCurrency,
      formatCurrency: (amount) => formatCurrency(amount, currencyMode),
    }),
    [currencyMode]
  );

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency() {
  const context = useContext(CurrencyContext);
  if (!context) throw new Error("useCurrency must be used inside CurrencyProvider");
  return context;
}
