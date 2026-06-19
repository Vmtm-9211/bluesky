import { useEffect, useRef, useState } from "react";
import {
  AlertCircle, BadgeCheck, CalendarDays, CheckCircle2, ChevronRight,
  DollarSign, FileText, IndianRupee, Loader2, Plus, Sparkles, UploadCloud, Wallet,
} from "lucide-react";
import { api, getErrorMessage } from "../api/client";
import Badge from "../components/Badge";
import Layout from "../components/Layout";
import ChatPanel from "../components/ChatPanel";
import Stat from "../components/Stat";
import { shortDate, toInrAmount, fromInrAmount } from "../utils/format";
import { useCurrency } from "../context/CurrencyContext";

const ALLOWED_RECEIPT_EXTS = new Set([
  "pdf", "jpg", "jpeg", "png", "gif", "webp", "bmp", "tiff", "tif", "heic", "heif", "avif",
]);

function validateReceiptFile(file) {
  if (!file) return null;
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  if (file.type.startsWith("image/") || file.type === "application/pdf" || ALLOWED_RECEIPT_EXTS.has(ext)) {
    return null;
  }
  return `"${file.name}" is not supported. Upload a PDF or image (jpg, png, gif, webp, bmp, tiff, heic).`;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function statusTone(status) {
  if (status === "APPROVED") return "green";
  if (status === "REJECTED") return "red";
  if (status?.includes("PENDING")) return "amber";
  return "blue";
}

export default function UserDashboard() {
  const { formatCurrency, currencyMode } = useCurrency();
  const [summary, setSummary] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [certs, setCerts] = useState([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [fileError, setFileError] = useState(null);
  const [formTab, setFormTab] = useState("expense");
  const [receiptPreview, setReceiptPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewAbort = useRef(null);

  const [expenseForm, setExpenseForm] = useState({
    category_name: "",
    amount: "",
    expense_date: new Date().toISOString().slice(0, 10),
    description: "",
    vendor: "",
    receipt: null,
  });
  const [certForm, setCertForm] = useState({
    certificate_name: "",
    provider: "",
    cost: "",
    completion_date: new Date().toISOString().slice(0, 10),
    proof: null,
  });

  async function loadData() {
    const [summaryRes, expensesRes, categoriesRes, certsRes] = await Promise.all([
      api.get("/reports/summary"),
      api.get("/expenses"),
      api.get("/expenses/categories"),
      api.get("/certs"),
    ]);
    setSummary(summaryRes.data);
    setExpenses(expensesRes.data);
    setCategories(categoriesRes.data.filter((item) => item.is_active));
    setCerts(certsRes.data);
  }

  useEffect(() => {
    loadData().catch((err) => setError(getErrorMessage(err)));
  }, []);

  async function handleReceiptChange(event) {
    const file = event.target.files?.[0] ?? null;
    const err = validateReceiptFile(file);
    setFileError(err);
    setReceiptPreview(null);
    if (!err && file) {
      setExpenseForm((prev) => ({ ...prev, receipt: file }));
      // Cancel any in-flight preview
      if (previewAbort.current) previewAbort.current.abort();
      const controller = new AbortController();
      previewAbort.current = controller;
      setPreviewLoading(true);
      try {
        const body = new FormData();
        body.append("receipt", file);
        if (expenseForm.category_name) body.append("category_name", expenseForm.category_name);
        if (expenseForm.vendor) body.append("vendor", expenseForm.vendor);
        const res = await api.post("/expenses/receipt-preview", body, { signal: controller.signal });
        setReceiptPreview(res.data);
        // Auto-fill form fields from AI extraction
        if (res.data.vendor && !expenseForm.vendor) {
          setExpenseForm((prev) => ({ ...prev, vendor: res.data.vendor }));
        }
        if (res.data.amount && !expenseForm.amount) {
          // AI always returns INR; convert to user's active currency for the form field
          const displayAmt = fromInrAmount(res.data.amount, currencyMode);
          setExpenseForm((prev) => ({ ...prev, amount: String(Number(displayAmt.toFixed(2))) }));
        }
        if (res.data.expense_date && expenseForm.expense_date === new Date().toISOString().slice(0, 10)) {
          setExpenseForm((prev) => ({ ...prev, expense_date: res.data.expense_date }));
        }
      } catch (e) {
        if (e?.code !== "ERR_CANCELED") {
          setReceiptPreview({ error: getErrorMessage(e) });
        }
      } finally {
        setPreviewLoading(false);
      }
    } else {
      event.target.value = "";
      setExpenseForm((prev) => ({ ...prev, receipt: null }));
    }
  }

  async function handleFormSubmit(event) {
    event.preventDefault();
    if (formTab === "expense" && fileError) return;
    setSaving(true);
    setError("");
    try {
      if (formTab === "expense") {
        const body = new FormData();
        body.append("category_name", expenseForm.category_name.trim());
        if (expenseForm.amount) {
          // Always send amount in INR to backend; convert from USD if needed
          const inrAmount = toInrAmount(Number(expenseForm.amount), currencyMode);
          body.append("amount", String(inrAmount));
          if (currencyMode === "USD") body.append("entered_amount", expenseForm.amount);
        }
        if (expenseForm.expense_date) body.append("expense_date", expenseForm.expense_date);
        if (expenseForm.description) body.append("description", expenseForm.description);
        if (expenseForm.vendor) body.append("vendor", expenseForm.vendor);
        body.append("currency_code", currencyMode);
        if (expenseForm.receipt) body.append("receipt", expenseForm.receipt);
        await api.post("/expenses", body);
        setFileError(null);
        setReceiptPreview(null);
        setExpenseForm({
          category_name: "",
          amount: "",
          expense_date: new Date().toISOString().slice(0, 10),
          description: "",
          vendor: "",
          receipt: null,
        });
      } else {
        const body = new FormData();
        Object.entries(certForm).forEach(([key, value]) => {
          if (value) body.append(key, value);
        });
        await api.post("/certs", body);
        setCertForm({
          certificate_name: "",
          provider: "",
          cost: "",
          completion_date: new Date().toISOString().slice(0, 10),
          proof: null,
        });
      }
      await loadData();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const approvedCount = expenses.filter((e) => e.status === "APPROVED").length;
  const pendingCount  = expenses.filter((e) => e.status === "SUBMITTED" || e.status?.includes("PENDING")).length;

  return (
    <Layout title="User Portal">
      {/* ── Hero banner ── */}
      <section
        className="mb-5 rounded-2xl px-4 py-5 sm:px-6 sm:py-6 text-white"
        style={{
          background: "linear-gradient(135deg, rgba(0,140,149,0.14), rgba(8,145,178,0.09), rgba(109,40,217,0.09))",
          border: "1px solid rgba(0,212,255,0.15)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.4), inset 0 0 0 1px rgba(0,212,255,0.05)",
        }}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-cyan-300">
              <Sparkles size={12} aria-hidden="true" />
              My finance overview
            </p>
            <h2 className="mt-1 text-xl sm:text-2xl font-bold">Track, submit &amp; manage your expenses</h2>
            <p className="mt-1 text-xs sm:text-sm" style={{ color: "rgba(255,255,255,0.5)" }}>
              Approved spend is counted only after finance review.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 sm:gap-4 shrink-0 sm:w-auto w-full">
            <Stat label="Total spend"  value={formatCurrency(summary?.total_spend)}    icon={Wallet}    />
            <Stat label="Approved"     value={formatCurrency(summary?.approved_spend)} icon={currencyMode === "USD" ? DollarSign : IndianRupee} tone="lagoon" />
            <Stat label="Pending"      value={formatCurrency(summary?.pending_spend)}  icon={CalendarDays} tone="amber" />
          </div>
        </div>
      </section>

      {error && (
        <div
          className="mb-4 rounded-xl px-3 py-2 text-sm"
          style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", color: "#f87171" }}
        >
          {error}
        </div>
      )}

      {/* ── Main two-column layout ── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[400px_1fr] xl:grid-cols-[440px_1fr]">

        {/* ── Left: submission form ── */}
        <form className="panel p-4 sm:p-5 h-fit" onSubmit={handleFormSubmit}>
          <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-white">
            <Plus size={18} className="text-cyan-400" aria-hidden="true" />
            New submission
          </h2>

          {/* Tab toggle */}
          <div
            className="mb-4 flex rounded-xl p-1"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            {["expense", "cert"].map((tab) => (
              <button
                key={tab}
                type="button"
                className="flex-1 rounded-lg py-2 text-sm font-semibold transition-all"
                style={
                  formTab === tab
                    ? { background: "rgba(0,212,255,0.12)", color: "#22d3ee", border: "1px solid rgba(0,212,255,0.2)" }
                    : { color: "rgba(255,255,255,0.4)", background: "transparent", border: "1px solid transparent" }
                }
                onClick={() => setFormTab(tab)}
              >
                {tab === "expense" ? "Expense" : "Certification"}
              </button>
            ))}
          </div>

          {formTab === "expense" && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <label>
                  <span className="label">Category</span>
                  <input
                    className="field"
                    required
                    list="category-suggestions"
                    placeholder="Type a category…"
                    value={expenseForm.category_name}
                    onChange={(e) => setExpenseForm((p) => ({ ...p, category_name: e.target.value }))}
                  />
                  <datalist id="category-suggestions">
                    {categories.map((c) => <option key={c.id} value={c.name} />)}
                  </datalist>
                </label>
                <label>
                  <span className="label">
                    Amount{" "}
                    <span className="font-normal normal-case tracking-normal" style={{ color: "rgba(255,255,255,0.4)" }}>
                      ({currencyMode === "USD" ? "$" : "₹"})
                    </span>
                  </span>
                  <input
                    className="field"
                    required
                    min="0.01"
                    step="0.01"
                    type="number"
                    placeholder={currencyMode === "USD" ? "0.00" : "0"}
                    value={expenseForm.amount}
                    onChange={(e) => setExpenseForm((p) => ({ ...p, amount: e.target.value }))}
                  />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label>
                  <span className="label">Date</span>
                  <input
                    className="field"
                    required
                    type="date"
                    value={expenseForm.expense_date}
                    onChange={(e) => setExpenseForm((p) => ({ ...p, expense_date: e.target.value }))}
                  />
                </label>
                <label>
                  <span className="label">Vendor</span>
                  <input
                    className="field"
                    value={expenseForm.vendor}
                    onChange={(e) => setExpenseForm((p) => ({ ...p, vendor: e.target.value }))}
                  />
                </label>
              </div>
              <label>
                <span className="label">Description</span>
                <textarea
                  className="field min-h-[72px]"
                  value={expenseForm.description}
                  onChange={(e) => setExpenseForm((p) => ({ ...p, description: e.target.value }))}
                />
              </label>
              <div>
                <span className="label">
                  Receipt{" "}
                  <span className="font-normal normal-case tracking-normal" style={{ color: "rgba(255,255,255,0.3)" }}>
                    (PDF or any image)
                  </span>
                </span>
                <label
                  className="mt-1 flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-3 transition-colors"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: fileError
                      ? "1px dashed rgba(239,68,68,0.5)"
                      : expenseForm.receipt
                      ? "1px dashed rgba(0,212,255,0.4)"
                      : "1px dashed rgba(255,255,255,0.18)",
                  }}
                >
                  <input className="sr-only" type="file" accept="image/*,.pdf" onChange={handleReceiptChange} />
                  {expenseForm.receipt ? (
                    <>
                      <FileText size={15} className="shrink-0" style={{ color: "#22d3ee" }} aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate text-sm text-white">{expenseForm.receipt.name}</span>
                      <span className="shrink-0 text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
                        {formatBytes(expenseForm.receipt.size)}
                      </span>
                      <span
                        className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                        style={{ background: "rgba(0,212,255,0.1)", color: "#22d3ee" }}
                      >
                        AI scan
                      </span>
                    </>
                  ) : (
                    <>
                      <UploadCloud size={15} className="shrink-0" style={{ color: "rgba(255,255,255,0.35)" }} aria-hidden="true" />
                      <span className="text-sm" style={{ color: "rgba(255,255,255,0.35)" }}>Click to attach receipt…</span>
                    </>
                  )}
                </label>
                {fileError && (
                  <p className="mt-1 flex items-center gap-1 text-xs" style={{ color: "#f87171" }}>
                    <AlertCircle size={12} aria-hidden="true" />
                    {fileError}
                  </p>
                )}
              </div>

              {/* AI Receipt Preview Panel */}
              {previewLoading && (
                <div
                  className="flex items-center gap-2 rounded-xl px-3 py-3 text-sm"
                  style={{ background: "rgba(0,212,255,0.06)", border: "1px solid rgba(0,212,255,0.15)" }}
                >
                  <Loader2 size={14} className="animate-spin text-cyan-400 shrink-0" />
                  <span style={{ color: "rgba(255,255,255,0.6)" }}>AI is scanning your receipt…</span>
                </div>
              )}

              {receiptPreview && !previewLoading && (
                <div
                  className="rounded-xl px-3 py-3 space-y-2"
                  style={{
                    background: receiptPreview.error
                      ? "rgba(239,68,68,0.06)"
                      : receiptPreview.agent_decision === "Auto-approved"
                      ? "rgba(52,211,153,0.07)"
                      : "rgba(251,191,36,0.07)",
                    border: receiptPreview.error
                      ? "1px solid rgba(239,68,68,0.2)"
                      : receiptPreview.agent_decision === "Auto-approved"
                      ? "1px solid rgba(52,211,153,0.25)"
                      : "1px solid rgba(251,191,36,0.2)",
                  }}
                >
                  {receiptPreview.error ? (
                    <p className="flex items-center gap-1.5 text-xs" style={{ color: "#f87171" }}>
                      <AlertCircle size={12} />
                      AI scan failed: {receiptPreview.error}
                    </p>
                  ) : (
                    <>
                      <div className="flex items-center justify-between">
                        <p className="flex items-center gap-1.5 text-xs font-semibold"
                          style={{ color: receiptPreview.agent_decision === "Auto-approved" ? "#34d399" : "#fbbf24" }}>
                          {receiptPreview.agent_decision === "Auto-approved"
                            ? <CheckCircle2 size={13} />
                            : <Sparkles size={13} />}
                          AI: {receiptPreview.agent_decision}
                        </p>
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                          style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.5)" }}>
                          {Math.round((receiptPreview.confidence ?? 0) * 100)}% confidence
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                        {receiptPreview.vendor && (
                          <p className="text-xs"><span style={{ color: "rgba(255,255,255,0.4)" }}>Vendor</span>{" "}
                            <span className="font-medium text-white">{receiptPreview.vendor}</span></p>
                        )}
                        {receiptPreview.amount != null && (
                          <p className="text-xs"><span style={{ color: "rgba(255,255,255,0.4)" }}>Amount</span>{" "}
                            <span className="font-medium text-white">{formatCurrency(receiptPreview.amount)}</span></p>
                        )}
                        {receiptPreview.expense_date && (
                          <p className="text-xs"><span style={{ color: "rgba(255,255,255,0.4)" }}>Date</span>{" "}
                            <span className="font-medium text-white">{receiptPreview.expense_date}</span></p>
                        )}
                        {receiptPreview.gst_number && (
                          <p className="text-xs"><span style={{ color: "rgba(255,255,255,0.4)" }}>GST</span>{" "}
                            <span className="font-medium text-white">{receiptPreview.gst_number}</span></p>
                        )}
                        {receiptPreview.tax_amount != null && (
                          <p className="text-xs"><span style={{ color: "rgba(255,255,255,0.4)" }}>{receiptPreview.tax_type || "Tax"}</span>{" "}
                            <span className="font-medium text-white">{formatCurrency(receiptPreview.tax_amount)}</span></p>
                        )}
                        {receiptPreview.receipt_kind && (
                          <p className="text-xs"><span style={{ color: "rgba(255,255,255,0.4)" }}>Type</span>{" "}
                            <span className="font-medium text-white">{receiptPreview.receipt_kind === "SYSTEM_GENERATED" ? "Computer bill" : "Handwritten"}</span></p>
                        )}
                      </div>
                      {receiptPreview.line_items?.length > 0 && (
                        <div className="mt-1 space-y-0.5">
                          <p className="text-[10px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.3)" }}>Line items</p>
                          {receiptPreview.line_items.map((item, i) => (
                            <div key={i} className="flex justify-between text-xs">
                              <span style={{ color: "rgba(255,255,255,0.6)" }}>{item.description}</span>
                              <span className="text-white font-medium">{formatCurrency(item.total)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {receiptPreview.notes && (
                        <p className="text-[11px] italic" style={{ color: "rgba(255,255,255,0.35)" }}>{receiptPreview.notes}</p>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {formTab === "cert" && (
            <div className="space-y-3">
              <label>
                <span className="label">Certificate name</span>
                <input className="field" required value={certForm.certificate_name}
                  onChange={(e) => setCertForm((p) => ({ ...p, certificate_name: e.target.value }))} />
              </label>
              <label>
                <span className="label">Provider</span>
                <input className="field" required value={certForm.provider}
                  onChange={(e) => setCertForm((p) => ({ ...p, provider: e.target.value }))} />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label>
                  <span className="label">Cost</span>
                  <input className="field" required min="1" type="number" value={certForm.cost}
                    onChange={(e) => setCertForm((p) => ({ ...p, cost: e.target.value }))} />
                </label>
                <label>
                  <span className="label">Completion date</span>
                  <input className="field" required type="date" value={certForm.completion_date}
                    onChange={(e) => setCertForm((p) => ({ ...p, completion_date: e.target.value }))} />
                </label>
              </div>
              <label>
                <span className="label">Proof</span>
                <input className="field" type="file" accept="image/*,.pdf"
                  onChange={(e) => setCertForm((p) => ({ ...p, proof: e.target.files?.[0] }))} />
              </label>
            </div>
          )}

          <button className="btn-primary mt-5 w-full" disabled={saving} type="submit">
            <UploadCloud size={18} aria-hidden="true" />
            {saving ? "Submitting…" : formTab === "expense" ? "Submit expense" : "Submit certification"}
          </button>
        </form>

        {/* ── Right: expenses table + cert summary ── */}
        <div className="flex flex-col gap-5 min-w-0">

          {/* Quick count badges */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Total claims",   value: expenses.length,  color: "#22d3ee" },
              { label: "Approved",       value: approvedCount,    color: "#34d399" },
              { label: "Pending",        value: pendingCount,     color: "#fbbf24" },
              { label: "Certifications", value: certs.length,     color: "#a78bfa" },
            ].map(({ label, value, color }) => (
              <div
                key={label}
                className="rounded-xl px-4 py-3"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
              >
                <p className="text-2xl font-bold" style={{ color }}>{value}</p>
                <p className="mt-0.5 text-xs" style={{ color: "rgba(255,255,255,0.45)" }}>{label}</p>
              </div>
            ))}
          </div>

          {/* Expenses table */}
          <div className="panel overflow-hidden flex-1">
            <div
              className="flex items-center gap-2 px-4 py-3"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.02)" }}
            >
              <BadgeCheck size={17} className="text-cyan-400" aria-hidden="true" />
              <h2 className="text-base font-bold text-white">My expenses</h2>
              <span
                className="ml-auto rounded-full px-2.5 py-0.5 text-xs font-semibold"
                style={{ background: "rgba(0,212,255,0.1)", color: "#22d3ee", border: "1px solid rgba(0,212,255,0.2)" }}
              >
                {expenses.length} total
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="resp-table w-full min-w-[380px] text-left text-sm text-slate-200">
                <thead style={{ background: "rgba(255,255,255,0.06)" }}>
                  <tr className="text-xs uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.5)" }}>
                    <th className="px-3 py-2.5">Date</th>
                    <th className="px-3 py-2.5">Category</th>
                    <th className="px-3 py-2.5 hidden sm:table-cell">Vendor</th>
                    <th className="px-3 py-2.5 hidden md:table-cell">Description</th>
                    <th className="px-3 py-2.5">Amount</th>
                    <th className="px-3 py-2.5">Status</th>
                    <th className="px-3 py-2.5 hidden sm:table-cell">Receipt</th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.length === 0 && (
                    <tr>
                      <td
                        className="px-4 py-10 text-center text-sm"
                        style={{ color: "rgba(255,255,255,0.3)" }}
                        colSpan={7}
                      >
                        No expenses yet. Submit your first one using the form.
                      </td>
                    </tr>
                  )}
                  {expenses.map((expense) => (
                    <tr
                      key={expense.id}
                      className="transition-colors"
                      style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}
                    >
                      <td className="px-3 py-2.5 text-slate-300 whitespace-nowrap">{shortDate(expense.expense_date)}</td>
                      <td className="px-3 py-2.5 font-medium text-white">{expense.category.name}</td>
                      <td className="px-3 py-2.5 hidden sm:table-cell text-slate-300">{expense.vendor || "—"}</td>
                      <td className="px-3 py-2.5 hidden md:table-cell text-slate-300 max-w-[160px] truncate">{expense.description || "—"}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className="font-bold text-white">{formatCurrency(expense.amount)}</span>
                        {expense.ai_amount != null && Math.abs(expense.ai_amount - expense.amount) > 1 && (
                          <span className="block text-[11px]" style={{ color: "#22d3ee" }}>
                            AI: {formatCurrency(expense.ai_amount)}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge tone={statusTone(expense.status)}>{expense.status}</Badge>
                        {expense.status === "REJECTED" && expense.rejection_reason && (
                          <p className="mt-1 text-xs" style={{ color: "#f87171" }}>{expense.rejection_reason}</p>
                        )}
                      </td>
                      <td className="px-3 py-2.5 hidden sm:table-cell">
                        <Badge tone={statusTone(expense.receipt_status)}>{expense.receipt_status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Certifications summary */}
          {certs.length > 0 && (
            <div className="panel overflow-hidden">
              <div
                className="flex items-center gap-2 px-4 py-3"
                style={{ borderBottom: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.02)" }}
              >
                <BadgeCheck size={17} className="text-violet-400" aria-hidden="true" />
                <h2 className="text-base font-bold text-white">My certifications</h2>
                <span
                  className="ml-auto rounded-full px-2.5 py-0.5 text-xs font-semibold"
                  style={{ background: "rgba(167,139,250,0.1)", color: "#a78bfa", border: "1px solid rgba(167,139,250,0.2)" }}
                >
                  {certs.length} total
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="resp-table w-full min-w-[360px] text-left text-sm text-slate-200">
                  <thead style={{ background: "rgba(255,255,255,0.06)" }}>
                    <tr className="text-xs uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.5)" }}>
                      <th className="px-3 py-2.5">Certificate</th>
                      <th className="px-3 py-2.5 hidden sm:table-cell">Provider</th>
                      <th className="px-3 py-2.5">Cost</th>
                      <th className="px-3 py-2.5">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {certs.map((cert) => (
                      <tr key={cert.id} className="transition-colors" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                        <td className="px-3 py-2.5 font-medium text-white">{cert.certificate_name}</td>
                        <td className="px-3 py-2.5 hidden sm:table-cell text-slate-300">{cert.provider}</td>
                        <td className="px-3 py-2.5 font-bold text-white">{formatCurrency(cert.cost)}</td>
                        <td className="px-3 py-2.5">
                          <Badge tone={cert.status === "APPROVED" ? "green" : cert.status === "REJECTED" ? "red" : "amber"}>
                            {cert.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      <ChatPanel isAdmin={false} />
    </Layout>
  );
}
