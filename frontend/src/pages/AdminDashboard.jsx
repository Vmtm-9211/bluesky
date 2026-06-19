import { Children, useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  Building2,
  CalendarRange,
  Check,
  CircleDollarSign,
  Eye,
  KeyRound,
  Pencil,
  ReceiptText,
  Trash2,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { api, getErrorMessage } from "../api/client";
import Badge from "../components/Badge";
import { CategoryPie, SpendBar, SpendLine } from "../components/Charts";
import Layout from "../components/Layout";
import ChatPanel from "../components/ChatPanel";
import Stat from "../components/Stat";
import { shortDate } from "../utils/format";
import { useCurrency } from "../context/CurrencyContext";

function tone(status) {
  if (status === "APPROVED") return "green";
  if (status === "REJECTED") return "red";
  if (status?.includes("PENDING") || status === "SUBMITTED") return "amber";
  return "blue";
}

function aiText(expense, fc) {
  if (!expense.ai_confidence || expense.ai_confidence < 0.7) {
    return "Not detected";
  }
  return [
    expense.ai_vendor || "Vendor not detected",
    expense.ai_amount ? fc(expense.ai_amount) : "Amount not detected",
    expense.ai_date ? shortDate(expense.ai_date) : "Date not detected",
    `${Math.round(expense.ai_confidence * 100)}% confidence`,
  ].join(" | ");
}

function receiptKindLabel(kind) {
  if (kind === "SYSTEM_GENERATED") return "Computer generated";
  if (kind === "HANDWRITTEN") return "Hand written";
  return "Unclassified";
}

function currentQuarterPeriod() {
  const now = new Date();
  return `${now.getFullYear()}-Q${Math.floor(now.getMonth() / 3) + 1}`;
}

export default function AdminDashboard() {
  const { formatCurrency } = useCurrency();
  const [tab, setTab] = useState("overview");
  const [summary, setSummary] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [receiptQueue, setReceiptQueue] = useState([]);
  const [certs, setCerts] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [users, setUsers] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [receiptPreview, setReceiptPreview] = useState(null);
  const [editingUser, setEditingUser] = useState(null);

  const currentMonth = new Date().toISOString().slice(0, 7);
  const currentYear = String(new Date().getFullYear());
  const [filters, setFilters] = useState({
    department_id: "",
    user_id: "",
    period_type: "month",
    period: currentMonth,
  });
  const [departmentForm, setDepartmentForm] = useState({ name: "", head_name: "", head_email: "" });
  const [budgetForm, setBudgetForm] = useState({ department_id: "", period: currentMonth, amount: "", threshold_percent: 90 });
  const [userForm, setUserForm] = useState({
    full_name: "",
    email: "",
    password: "Welcome@123",
    role: "USER",
    department_id: "",
  });

  function apiParams() {
    const params = {};
    if (filters.department_id) params.department_id = filters.department_id;
    if (filters.user_id) params.user_id = filters.user_id;
    if (filters.period_type !== "all") {
      params.period_type = filters.period_type;
      params.period = filters.period;
    }
    return params;
  }

  async function loadData() {
    const params = apiParams();
    const [summaryRes, expensesRes, receiptRes, certsRes, departmentsRes, usersRes, budgetsRes, categoriesRes] =
      await Promise.all([
        api.get("/reports/summary", { params }),
        api.get("/expenses", { params }),
        api.get("/expenses/receipt-queue"),
        api.get("/certs"),
        api.get("/admin/departments"),
        api.get("/admin/users"),
        api.get("/budgets"),
        api.get("/admin/categories"),
      ]);
    setSummary(summaryRes.data);
    setExpenses(expensesRes.data);
    setReceiptQueue(receiptRes.data);
    setCerts(certsRes.data);
    setDepartments(departmentsRes.data);
    setUsers(usersRes.data);
    setBudgets(budgetsRes.data);
    setCategories(categoriesRes.data);
  }

  useEffect(() => {
    loadData().catch((err) => setError(getErrorMessage(err)));
  }, [filters]);

  const filteredUsers = useMemo(() => {
    if (!filters.department_id) return users;
    return users.filter((user) => String(user.department_id) === String(filters.department_id));
  }, [filters.department_id, users]);

  const pendingCerts = useMemo(() => certs.filter((cert) => cert.status === "PENDING"), [certs]);
  const receiptExpenses = useMemo(() => expenses.filter((expense) => expense.receipt_path), [expenses]);
  const pendingExpenses = useMemo(
    () => expenses.filter((expense) => expense.status === "SUBMITTED" || expense.status === "PENDING_RECEIPT_REVIEW"),
    [expenses]
  );
  const approvedExpenses = useMemo(() => expenses.filter((expense) => expense.status === "APPROVED"), [expenses]);

  async function runAction(action) {
    setSaving(true);
    setError("");
    try {
      await action();
      await loadData();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function openReceipt(expense) {
    setError("");
    try {
      const response = await api.get(`/expenses/${expense.id}/receipt-file`, { responseType: "blob" });
      const url = URL.createObjectURL(response.data);
      setReceiptPreview({
        url,
        type: response.data.type,
        title: `${expense.user.full_name} - ${expense.vendor || expense.category.name}`,
      });
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  function closeReceiptPreview() {
    if (receiptPreview?.url) URL.revokeObjectURL(receiptPreview.url);
    setReceiptPreview(null);
  }

  function setPeriodType(period_type) {
    const nextPeriod =
      period_type === "month" ? currentMonth : period_type === "quarter" ? currentQuarterPeriod() : period_type === "year" ? currentYear : "";
    setFilters((prev) => ({ ...prev, period_type, period: nextPeriod }));
  }

  function submitEditUser(data) {
    runAction(async () => {
      await api.patch(`/admin/users/${editingUser.id}`, data);
      setEditingUser(null);
    });
  }

  function submitDepartment(event) {
    event.preventDefault();
    runAction(async () => {
      await api.post("/admin/departments", departmentForm);
      setDepartmentForm({ name: "", head_name: "", head_email: "" });
    });
  }

  function submitBudget(event) {
    event.preventDefault();
    runAction(async () => {
      await api.post("/budgets", {
        ...budgetForm,
        department_id: Number(budgetForm.department_id),
        amount: Number(budgetForm.amount),
        threshold_percent: Number(budgetForm.threshold_percent),
      });
      setBudgetForm({ department_id: "", period: currentMonth, amount: "", threshold_percent: 90 });
    });
  }

  function submitUser(event) {
    event.preventDefault();
    runAction(async () => {
      await api.post("/admin/users", {
        ...userForm,
        department_id: Number(userForm.department_id),
      });
      setUserForm({ full_name: "", email: "", password: "Welcome@123", role: "USER", department_id: "" });
    });
  }

  function deleteUser(user) {
    if (!window.confirm(`Delete user "${user.full_name}" (${user.email})?\n\nThis cannot be undone. Users with existing expenses or certification records cannot be deleted — deactivate them instead.`)) return;
    runAction(() => api.delete(`/admin/users/${user.id}`));
  }

  const tabs = [
    ["overview", "Overview"],
    ["expense", "Expense"],
    ["controls", "Controls"],
    ["people", "People"],
  ];

  return (
    <Layout
      title="Finance Command Center"
      actions={
        <button className="btn-secondary h-10 w-10 p-0" title="Refresh" type="button" onClick={() => runAction(loadData)}>
          <RefreshCcw size={18} aria-hidden="true" />
        </button>
      }
    >
      <section
        className="mb-4 sm:mb-6 rounded-2xl px-3 py-4 sm:px-4 sm:py-5 text-white"
        style={{
          background: "linear-gradient(135deg, rgba(0,140,149,0.12), rgba(8,145,178,0.08), rgba(109,40,217,0.08))",
          border: "1px solid rgba(0,212,255,0.15)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(0,212,255,0.05) inset",
        }}
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-end">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-cyan-200">
              <Sparkles size={13} aria-hidden="true" />
              Live financial operations
            </p>
            <h2 className="mt-1.5 text-lg sm:text-xl lg:text-2xl font-bold">Department-aware spend intelligence</h2>
            <p className="mt-1 text-xs sm:text-sm text-slate-300">Official spend is counted only after finance approval.</p>
          </div>
          <FilterBar
            filters={filters}
            setFilters={setFilters}
            setPeriodType={setPeriodType}
            departments={departments}
            users={filteredUsers}
          />
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

      {/* ── Horizontal tab bar (< xl screens) ── */}
      <nav
        className="mb-4 flex gap-1 overflow-x-auto rounded-xl p-1 xl:hidden"
        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
      >
        {tabs.map(([id, label]) => (
          <button
            key={id}
            className="shrink-0 rounded-lg px-4 py-2 text-sm font-semibold whitespace-nowrap transition-all"
            style={
              tab === id
                ? {
                    background: "linear-gradient(135deg, rgba(0,180,192,0.25), rgba(0,212,255,0.12))",
                    color: "#22d3ee",
                    border: "1px solid rgba(0,212,255,0.25)",
                    boxShadow: "0 0 12px rgba(0,212,255,0.1)",
                  }
                : {
                    color: "rgba(255,255,255,0.55)",
                    background: "transparent",
                    border: "1px solid transparent",
                  }
            }
            type="button"
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="flex items-start gap-5">
        {/* ── Vertical sidebar (xl+ only) ── */}
        <aside className="sticky top-4 hidden w-40 shrink-0 xl:block">
          <nav
            className="space-y-1 rounded-xl p-2"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            {tabs.map(([id, label]) => (
              <button
                key={id}
                className="w-full rounded-lg px-3 py-2.5 text-left text-sm font-semibold transition-all"
                style={
                  tab === id
                    ? {
                        background: "linear-gradient(135deg, rgba(0,180,192,0.25), rgba(0,212,255,0.12))",
                        color: "#22d3ee",
                        border: "1px solid rgba(0,212,255,0.25)",
                        boxShadow: "0 0 12px rgba(0,212,255,0.1)",
                      }
                    : {
                        color: "rgba(255,255,255,0.65)",
                        background: "transparent",
                        border: "1px solid transparent",
                      }
                }
                type="button"
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </nav>
        </aside>
        <div className="min-w-0 flex-1">

      {tab === "overview" && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-4">
            <Stat label="Approved spend" value={formatCurrency(summary?.approved_spend)} icon={CircleDollarSign} />
            <Stat label="Pending approval" value={formatCurrency(summary?.pending_spend)} tone="amber" icon={ReceiptText} />
            <Stat label="Approved claims" value={approvedExpenses.length} tone="lagoon" icon={ShieldCheck} />
            <Stat label="Active users" value={filteredUsers.filter((user) => user.is_active).length} tone="ink" icon={Users} />
          </div>

          <section className="mt-4 sm:mt-6 grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <div className="panel p-3 sm:p-4">
              <h2 className="mb-3 flex items-center gap-2 text-sm sm:text-base font-bold text-white">
                <Building2 size={16} className="text-cyan-400" aria-hidden="true" />
                Department spend
              </h2>
              <SpendBar data={summary?.by_department || []} />
            </div>
            <div className="panel p-3 sm:p-4">
              <h2 className="mb-3 text-sm sm:text-base font-bold text-white">Category signal</h2>
              <CategoryPie data={summary?.by_category || []} />
            </div>
            <div className="panel p-3 sm:p-4 sm:col-span-2 xl:col-span-1">
              <h2 className="mb-3 flex items-center gap-2 text-sm sm:text-base font-bold text-white">
                <CalendarRange size={16} style={{ color: "#f87171" }} aria-hidden="true" />
                Spend timeline
              </h2>
              <SpendLine data={summary?.by_month || []} />
            </div>
          </section>

          <section className="mt-4 sm:mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-[1fr_1.15fr]">
            <div className="panel overflow-hidden">
              <TableHeader title="User-wise approved spend" />
              <SimpleTable
                columns={["User", "Department", "Approved Spend"]}
                rows={(summary?.by_user || []).map((row) => [row.name, row.department, formatCurrency(row.value)])}
                emptyText="No approved spend for this filter."
              />
            </div>
            <BudgetHealth budgets={summary?.budget_health || []} />
          </section>
        </>
      )}

      {tab === "expense" && (
        <section className="grid grid-cols-1 gap-4 sm:gap-5 md:grid-cols-2 xl:grid-cols-3">
          <QueuePanel title="Receipt AI queue" emptyText="No receipts waiting for review">
            {receiptQueue.map((expense) => (
              <ApprovalCard key={expense.id} expense={expense}>
                <div className="mt-3 space-y-2">
                  {/* AI extracted cost — most prominent element */}
                  <div
                    className="flex items-start justify-between rounded-lg px-3 py-2.5"
                    style={{ background: "rgba(0,212,255,0.08)", border: "1px solid rgba(0,212,255,0.2)" }}
                  >
                    <div>
                      <p
                        className="text-[10px] font-bold uppercase tracking-widest"
                        style={{ color: "rgba(0,212,255,0.7)" }}
                      >
                        AI Extracted Cost
                      </p>
                      <p className="mt-0.5 text-lg font-bold text-white">
                        {expense.ai_amount != null ? formatCurrency(expense.ai_amount) : "—"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.4)" }}>Submitted</p>
                      <p className="text-sm font-semibold" style={{ color: "rgba(255,255,255,0.6)" }}>
                        {formatCurrency(expense.amount)}
                      </p>
                      {expense.ai_amount != null && Math.abs(expense.ai_amount - expense.amount) > 1 && (
                        <Badge tone="amber">Mismatch</Badge>
                      )}
                    </div>
                  </div>

                  {/* Tax info grid */}
                  <div className="grid grid-cols-2 gap-2">
                    <div
                      className="rounded-lg px-3 py-2"
                      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                    >
                      <p
                        className="text-[10px] font-bold uppercase tracking-widest"
                        style={{ color: "rgba(255,255,255,0.4)" }}
                      >
                        GST Number
                      </p>
                      <p className="mt-0.5 break-all font-mono text-xs text-white">
                        {expense.ai_gst_number || "—"}
                      </p>
                    </div>
                    <div
                      className="rounded-lg px-3 py-2"
                      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                    >
                      <p
                        className="text-[10px] font-bold uppercase tracking-widest"
                        style={{ color: "rgba(255,255,255,0.4)" }}
                      >
                        Tax Amount
                      </p>
                      <p className="mt-0.5 text-xs text-white">
                        {expense.ai_tax_amount ? formatCurrency(expense.ai_tax_amount) : "—"}
                      </p>
                    </div>
                  </div>

                  {/* Vendor / date / confidence */}
                  <p className="text-xs text-slate-400">
                    {expense.ai_vendor || expense.vendor || "Vendor unknown"}{" "}
                    · {shortDate(expense.ai_date || expense.expense_date)}
                    {expense.ai_confidence != null && (
                      <> · <span style={{ color: "#22d3ee" }}>{Math.round(expense.ai_confidence * 100)}% confidence</span></>
                    )}
                  </p>

                  {/* Receipt kind + agent notes */}
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={expense.receipt_kind === "SYSTEM_GENERATED" ? "green" : "amber"}>
                      {receiptKindLabel(expense.receipt_kind)}
                    </Badge>
                    {expense.receipt_agent_notes && (
                      <span
                        className="max-w-[180px] truncate text-xs text-slate-400"
                        title={expense.receipt_agent_notes}
                      >
                        {expense.receipt_agent_notes}
                      </span>
                    )}
                  </div>

                  <button className="btn-secondary w-fit" type="button" onClick={() => openReceipt(expense)}>
                    <Eye size={16} aria-hidden="true" />
                    View receipt
                  </button>
                </div>
                <ActionPair
                  disabled={saving}
                  requireReason
                  onApprove={() => runAction(() => api.post(`/expenses/${expense.id}/receipt-review`, { approved: true }))}
                  onReject={(reason) =>
                    runAction(() =>
                      api.post(`/expenses/${expense.id}/receipt-review`, { approved: false, reason })
                    )
                  }
                />
              </ApprovalCard>
            ))}
          </QueuePanel>

          <QueuePanel title="Expense approvals" emptyText="No submitted expenses for this filter">
            {pendingExpenses.map((expense) => (
              <ApprovalCard key={expense.id} expense={expense}>
                <p className="text-sm text-slate-400">
                  {expense.category.name} | {expense.vendor || "-"} | {shortDate(expense.expense_date)}
                </p>
                <p className="text-sm text-slate-400">Spent on: {expense.description || "-"}</p>
                {expense.receipt_path && (
                  <button className="btn-secondary mt-2 w-fit" type="button" onClick={() => openReceipt(expense)}>
                    <Eye size={16} aria-hidden="true" />
                    View receipt
                  </button>
                )}
                <ActionPair
                  disabled={saving || expense.receipt_status === "PENDING"}
                  requireReason
                  onApprove={() => runAction(() => api.post(`/expenses/${expense.id}/approval`, { approved: true }))}
                  onReject={(reason) =>
                    runAction(() => api.post(`/expenses/${expense.id}/approval`, { approved: false, reason }))
                  }
                />
              </ApprovalCard>
            ))}
          </QueuePanel>

          <QueuePanel title="Certification queue" emptyText="No certification requests">
            {pendingCerts.map((cert) => (
              <div
                key={cert.id}
                className="rounded-xl p-3 transition-colors"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{cert.certificate_name}</p>
                    <p className="text-sm text-slate-400">
                      {cert.user.full_name} | {cert.provider} | {formatCurrency(cert.cost)}
                    </p>
                  </div>
                  <ActionPair
                    disabled={saving}
                    onApprove={() => runAction(() => api.post(`/certs/${cert.id}/approval`, { approved: true }))}
                    onReject={() =>
                      runAction(() => api.post(`/certs/${cert.id}/approval`, { approved: false, admin_notes: "Not approved" }))
                    }
                  />
                </div>
              </div>
            ))}
          </QueuePanel>
        </section>
      )}

      {tab === "expense" && (
        <section className="panel mt-4 sm:mt-6 overflow-hidden">
          <TableHeader title="Agent extracted bill details" />
          <div className="overflow-x-auto">
            <table className="resp-table w-full min-w-[640px] text-left text-sm text-slate-200">
              <thead className="bg-slate-950 text-xs uppercase tracking-wide text-cyan-100">
                <tr>
                  <th className="px-3 py-2.5">Employee</th>
                  <th className="px-3 py-2.5">Bill type</th>
                  <th className="px-3 py-2.5">Vendor</th>
                  <th className="px-3 py-2.5">Amount</th>
                  <th className="px-3 py-2.5 hidden lg:table-cell">GST No</th>
                  <th className="px-3 py-2.5 hidden lg:table-cell">Tax</th>
                  <th className="px-3 py-2.5">Bill date</th>
                  <th className="px-3 py-2.5">Receipt</th>
                  <th className="px-3 py-2.5 hidden lg:table-cell">Agent notes</th>
                  <th className="px-3 py-2.5">View</th>
                </tr>
              </thead>
              <tbody>
                {receiptExpenses.map((expense) => (
                  <tr key={expense.id} className="transition-colors" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                    <td className="px-3 py-2.5 font-semibold">{expense.user.full_name}</td>
                    <td className="px-3 py-2.5">
                      <Badge tone={expense.receipt_kind === "SYSTEM_GENERATED" ? "green" : "amber"}>
                        {receiptKindLabel(expense.receipt_kind)}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5">{expense.ai_vendor || expense.vendor || "-"}</td>
                    <td className="px-3 py-2.5 font-semibold">{expense.ai_amount ? formatCurrency(expense.ai_amount) : formatCurrency(expense.amount)}</td>
                    <td className="px-3 py-2.5 hidden lg:table-cell">{expense.ai_gst_number || "-"}</td>
                    <td className="px-3 py-2.5 hidden lg:table-cell">{expense.ai_tax_amount ? formatCurrency(expense.ai_tax_amount) : "-"}</td>
                    <td className="px-3 py-2.5">{expense.ai_date ? shortDate(expense.ai_date) : shortDate(expense.expense_date)}</td>
                    <td className="px-3 py-2.5">
                      <Badge tone={tone(expense.receipt_status)}>{expense.receipt_status}</Badge>
                    </td>
                    <td className="px-3 py-2.5 hidden lg:table-cell max-w-[160px] truncate">{expense.receipt_agent_notes || "-"}</td>
                    <td className="px-3 py-2.5">
                      <button className="btn-secondary h-8 w-8 p-0" title="View receipt" type="button" onClick={() => openReceipt(expense)}>
                        <Eye size={14} aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                ))}
                {receiptExpenses.length === 0 && (
                  <tr>
                    <td className="px-4 py-6 text-center text-sm" style={{ color: "rgba(255,255,255,0.3)" }} colSpan={10}>No receipts match this filter.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === "expense" && (
        <section className="panel overflow-hidden">
          <TableHeader title="Filtered expense ledger" />
          <div className="overflow-x-auto">
            <table className="resp-table w-full min-w-[560px] text-left text-sm text-slate-200">
              <thead className="bg-slate-950 text-xs uppercase tracking-wide text-cyan-100">
                <tr>
                  <th className="px-3 py-2.5">Date</th>
                  <th className="px-3 py-2.5">Employee</th>
                  <th className="px-3 py-2.5 hidden md:table-cell">Department</th>
                  <th className="px-3 py-2.5">Category</th>
                  <th className="px-3 py-2.5 hidden lg:table-cell">Bill type</th>
                  <th className="px-3 py-2.5 hidden xl:table-cell">Spent on</th>
                  <th className="px-3 py-2.5 hidden lg:table-cell">Vendor</th>
                  <th className="px-3 py-2.5">Amount</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5">Receipt</th>
                  <th className="px-3 py-2.5">View</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((expense) => (
                  <tr key={expense.id} className="transition-colors" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                    <td className="px-3 py-2.5">{shortDate(expense.expense_date)}</td>
                    <td className="px-3 py-2.5 font-semibold">{expense.user.full_name}</td>
                    <td className="px-3 py-2.5 hidden md:table-cell">{expense.department.name}</td>
                    <td className="px-3 py-2.5">{expense.category.name}</td>
                    <td className="px-3 py-2.5 hidden lg:table-cell">{expense.receipt_path ? receiptKindLabel(expense.receipt_kind) : "-"}</td>
                    <td className="px-3 py-2.5 hidden xl:table-cell max-w-[120px] truncate">{expense.description || "-"}</td>
                    <td className="px-3 py-2.5 hidden lg:table-cell">{expense.vendor || "-"}</td>
                    <td className="px-3 py-2.5 font-semibold">{formatCurrency(expense.amount)}</td>
                    <td className="px-3 py-2.5"><Badge tone={tone(expense.status)}>{expense.status}</Badge></td>
                    <td className="px-3 py-2.5"><Badge tone={tone(expense.receipt_status)}>{expense.receipt_status}</Badge></td>
                    <td className="px-3 py-2.5">
                      {expense.receipt_path ? (
                        <button className="btn-secondary h-8 w-8 p-0" title="View receipt" type="button" onClick={() => openReceipt(expense)}>
                          <Eye size={14} aria-hidden="true" />
                        </button>
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                ))}
                {expenses.length === 0 && (
                  <tr>
                    <td className="px-4 py-6 text-center text-sm" style={{ color: "rgba(255,255,255,0.3)" }} colSpan={11}>No expenses match this filter.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === "controls" && (
        <section className="grid grid-cols-1 gap-4 sm:gap-5 md:grid-cols-2">
          <form id="budget-form" className="panel p-4 md:col-span-2" onSubmit={submitBudget}>
            <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-white">
              <CircleDollarSign size={18} className="text-amber-400" aria-hidden="true" />
              Budget threshold
            </h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <select
                className="field md:col-span-2"
                required
                value={budgetForm.department_id}
                onChange={(e) => setBudgetForm((p) => ({ ...p, department_id: e.target.value }))}
              >
                <option value="">Department</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>{department.name}</option>
                ))}
              </select>
              <input
                className="field"
                required
                type="month"
                value={budgetForm.period}
                onChange={(e) => setBudgetForm((p) => ({ ...p, period: e.target.value }))}
              />
              <input
                className="field"
                required
                min="1"
                type="number"
                placeholder="Amount (₹)"
                value={budgetForm.amount}
                onChange={(e) => setBudgetForm((p) => ({ ...p, amount: e.target.value }))}
              />
              <input
                className="field"
                required
                min="1"
                max="200"
                type="number"
                placeholder="Alert at %"
                value={budgetForm.threshold_percent}
                onChange={(e) => setBudgetForm((p) => ({ ...p, threshold_percent: e.target.value }))}
              />
            </div>
            <div className="mt-4">
              <button className="btn-primary" disabled={saving} type="submit">
                Add budget
              </button>
            </div>
          </form>

          <div className="panel overflow-hidden md:col-span-2">
            <TableHeader title="Budgets" />
            <div className="overflow-x-auto">
              <table className="resp-table w-full min-w-[360px] text-left text-sm text-slate-200">
                <thead style={{ background: "rgba(255,255,255,0.07)" }}>
                  <tr className="text-xs uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.6)" }}>
                    <th className="px-3 py-2.5">Department</th>
                    <th className="px-3 py-2.5 hidden sm:table-cell">Period</th>
                    <th className="px-3 py-2.5">Budget</th>
                    <th className="px-3 py-2.5">Alert at</th>
                    <th className="px-3 py-2.5">Spend</th>
                    <th className="px-3 py-2.5">Used</th>
                  </tr>
                </thead>
                <tbody>
                  {budgets.map((budget) => (
                    <tr
                      key={budget.id}
                      className="transition-colors"
                      style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
                    >
                      <td className="px-3 py-2.5 font-semibold text-white">{budget.department.name}</td>
                      <td className="px-3 py-2.5 hidden sm:table-cell">{budget.period}</td>
                      <td className="px-3 py-2.5 font-semibold text-white">{formatCurrency(budget.amount)}</td>
                      <td className="px-3 py-2.5">
                        <span
                          className="rounded-md px-2 py-0.5 text-xs font-semibold"
                          style={{ background: "rgba(245,158,11,0.12)", color: "#fbbf24", border: "1px solid rgba(245,158,11,0.25)" }}
                        >
                          {budget.threshold_percent}%
                        </span>
                      </td>
                      <td className="px-3 py-2.5">{formatCurrency(budget.spent)}</td>
                      <td className="px-3 py-2.5">
                        <span
                          className="rounded-md px-2 py-0.5 text-xs font-semibold"
                          style={
                            budget.percent_used >= budget.threshold_percent
                              ? { background: "rgba(239,68,68,0.12)", color: "#f87171", border: "1px solid rgba(239,68,68,0.25)" }
                              : { background: "rgba(16,185,129,0.1)", color: "#34d399", border: "1px solid rgba(16,185,129,0.25)" }
                          }
                        >
                          {Math.round(budget.percent_used)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                  {budgets.length === 0 && (
                    <tr>
                      <td className="px-4 py-6 text-center text-sm" style={{ color: "rgba(255,255,255,0.3)" }} colSpan={6}>
                        No budgets yet. Add one using the form above.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {tab === "people" && (
        <section className="grid grid-cols-1 gap-4 sm:gap-5 md:grid-cols-[300px_1fr] lg:grid-cols-[340px_1fr] xl:grid-cols-[400px_1fr]">
          <div className="flex flex-col gap-4">
          <form className="panel p-4" onSubmit={submitUser}>
            <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-white">
              <UserPlus size={18} className="text-cyan-400" aria-hidden="true" />
              New user
            </h2>
            <div className="space-y-3">
              <input className="field" required placeholder="Full name" value={userForm.full_name} onChange={(e) => setUserForm((p) => ({ ...p, full_name: e.target.value }))} />
              <input className="field" required placeholder="Email" type="email" value={userForm.email} onChange={(e) => setUserForm((p) => ({ ...p, email: e.target.value }))} />
              <input className="field" required placeholder="Password" value={userForm.password} onChange={(e) => setUserForm((p) => ({ ...p, password: e.target.value }))} />
              <select className="field" value={userForm.role} onChange={(e) => setUserForm((p) => ({ ...p, role: e.target.value }))}>
                <option value="USER">User</option>
                <option value="ADMIN">Admin</option>
              </select>
              <select className="field" required value={userForm.department_id} onChange={(e) => setUserForm((p) => ({ ...p, department_id: e.target.value }))}>
                <option value="" disabled>Select department *</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>{department.name}</option>
                ))}
              </select>
            </div>
            <button className="btn-primary mt-4 w-full" disabled={saving} type="submit">Create user</button>
          </form>

          <form className="panel p-4" onSubmit={submitDepartment}>
            <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-white">
              <Building2 size={18} className="text-cyan-400" aria-hidden="true" />
              Department
            </h2>
            <div className="space-y-3">
              <input className="field" placeholder="Name" required value={departmentForm.name} onChange={(e) => setDepartmentForm((p) => ({ ...p, name: e.target.value }))} />
              <input className="field" placeholder="Head name" value={departmentForm.head_name} onChange={(e) => setDepartmentForm((p) => ({ ...p, head_name: e.target.value }))} />
              <input className="field" placeholder="Head email" value={departmentForm.head_email} onChange={(e) => setDepartmentForm((p) => ({ ...p, head_email: e.target.value }))} />
            </div>
            <button className="btn-primary mt-4 w-full" disabled={saving} type="submit">Save department</button>
          </form>
          </div>

          <div className="panel overflow-hidden">
            <TableHeader title="Users" />
            <div className="overflow-x-auto">
              <table className="resp-table w-full min-w-[420px] text-left text-sm text-slate-200">
                <thead style={{ background: "rgba(255,255,255,0.07)" }}>
                  <tr className="text-xs uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.6)" }}>
                    <th className="px-3 py-2.5">Name</th>
                    <th className="px-3 py-2.5 hidden sm:table-cell">Email</th>
                    <th className="px-3 py-2.5 hidden md:table-cell">Department</th>
                    <th className="px-3 py-2.5">Role</th>
                    <th className="px-3 py-2.5">Status</th>
                    <th className="px-3 py-2.5">Edit</th>
                    <th className="px-3 py-2.5">Delete</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="transition-colors" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                      <td className="px-3 py-2.5 font-semibold text-white">
                        {u.full_name}
                        {u.must_change_password && (
                          <span
                            className="ml-2 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                            style={{ background: "rgba(245,158,11,0.15)", color: "#fbbf24", border: "1px solid rgba(245,158,11,0.3)" }}
                            title="Must change password on next login"
                          >
                            Temp pwd
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 hidden sm:table-cell text-slate-300">{u.email}</td>
                      <td className="px-3 py-2.5 hidden md:table-cell text-slate-300">{u.department?.name || "—"}</td>
                      <td className="px-3 py-2.5">
                        <Badge tone={u.role === "ADMIN" ? "blue" : "green"}>{u.role}</Badge>
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge tone={u.is_active ? "green" : "red"}>{u.is_active ? "Active" : "Inactive"}</Badge>
                      </td>
                      <td className="px-3 py-2.5">
                        <button
                          className="btn-secondary h-8 w-8 p-0"
                          title="Edit user"
                          type="button"
                          onClick={() => setEditingUser(u)}
                        >
                          <Pencil size={14} aria-hidden="true" />
                        </button>
                      </td>
                      <td className="px-3 py-2.5">
                        <button
                          className="h-8 w-8 p-0 rounded-lg flex items-center justify-center transition-colors"
                          style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171" }}
                          title="Delete user"
                          type="button"
                          disabled={u.role === "ADMIN"}
                          onClick={() => deleteUser(u)}
                        >
                          <Trash2 size={14} aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 && (
                    <tr>
                      <td className="px-4 py-6 text-center text-sm" style={{ color: "rgba(255,255,255,0.3)" }} colSpan={7}>
                        No users yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel overflow-hidden lg:col-span-2">
            <TableHeader title="Expense categories" />
            <SimpleTable columns={["Category", "Description", "Active"]} rows={categories.map((category) => [category.name, category.description || "-", category.is_active ? "Yes" : "No"])} />
          </div>
        </section>
      )}
        </div>
      </div>
      {receiptPreview && <ReceiptPreview preview={receiptPreview} onClose={closeReceiptPreview} />}
      {editingUser && (
        <EditUserModal
          user={editingUser}
          departments={departments}
          saving={saving}
          onClose={() => setEditingUser(null)}
          onSave={submitEditUser}
        />
      )}
      <ChatPanel isAdmin={true} />
    </Layout>
  );
}

function FilterBar({ filters, setFilters, setPeriodType, departments, users }) {
  return (
    <div className="grid w-full min-w-0 grid-cols-2 gap-2 rounded-xl p-2 sm:p-3 sm:grid-cols-3 lg:grid-cols-5" style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)", backdropFilter: "blur(8px)" }}>
      <label>
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-cyan-100">Department</span>
        <select
          className="field"
          value={filters.department_id}
          onChange={(event) => setFilters((prev) => ({ ...prev, department_id: event.target.value, user_id: "" }))}
        >
          <option value="">All departments</option>
          {departments.map((department) => (
            <option key={department.id} value={department.id}>{department.name}</option>
          ))}
        </select>
      </label>
      <label>
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-cyan-100">User</span>
        <select className="field" value={filters.user_id} onChange={(event) => setFilters((prev) => ({ ...prev, user_id: event.target.value }))}>
          <option value="">All users</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>{user.full_name}</option>
          ))}
        </select>
      </label>
      <label>
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-cyan-100">Range</span>
        <select className="field" value={filters.period_type} onChange={(event) => setPeriodType(event.target.value)}>
          <option value="all">All time</option>
          <option value="month">Month</option>
          <option value="quarter">Quarter</option>
          <option value="year">Year</option>
        </select>
      </label>
      <label className="col-span-2 sm:col-span-1 lg:col-span-2">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-cyan-100">Period</span>
        <PeriodInput filters={filters} setFilters={setFilters} />
      </label>
    </div>
  );
}

function PeriodInput({ filters, setFilters }) {
  if (filters.period_type === "all") {
    return <input className="field" disabled value="All records" readOnly />;
  }
  if (filters.period_type === "month") {
    return <input className="field" type="month" value={filters.period} onChange={(event) => setFilters((prev) => ({ ...prev, period: event.target.value }))} />;
  }
  if (filters.period_type === "quarter") {
    return (
      <select className="field" value={filters.period} onChange={(event) => setFilters((prev) => ({ ...prev, period: event.target.value }))}>
        {[2026, 2025, 2024].map((year) =>
          [1, 2, 3, 4].map((quarter) => (
            <option key={`${year}-Q${quarter}`} value={`${year}-Q${quarter}`}>{year} Q{quarter}</option>
          ))
        )}
      </select>
    );
  }
  return <input className="field" type="number" min="2020" max="2035" value={filters.period} onChange={(event) => setFilters((prev) => ({ ...prev, period: event.target.value }))} />;
}

function BudgetHealth({ budgets }) {
  const { formatCurrency } = useCurrency();
  return (
    <div className="panel overflow-hidden">
      <TableHeader title="Budget health" />
      <div className="grid grid-cols-1 gap-3 p-3 sm:p-4 sm:grid-cols-2">
        {budgets.map((budget) => (
          <div
            key={`${budget.department}-${budget.period}`}
            className="rounded-xl p-3 transition-colors"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <div className="flex items-center justify-between">
              <p className="font-semibold text-white">{budget.department}</p>
              <Badge tone={budget.breached ? "red" : "green"}>{budget.period}</Badge>
            </div>
            <div className="mt-3 h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
              <div
                className="h-1.5 rounded-full transition-all"
                style={{
                  width: `${Math.min(100, budget.percent_used)}%`,
                  background: budget.breached
                    ? "linear-gradient(90deg,#dc2626,#ef4444)"
                    : "linear-gradient(90deg,#0891b2,#22d3ee)",
                  boxShadow: budget.breached ? "0 0 8px rgba(239,68,68,0.5)" : "0 0 8px rgba(0,212,255,0.4)",
                }}
              />
            </div>
            <p className="mt-2 text-sm text-slate-400">{formatCurrency(budget.spent)} of {formatCurrency(budget.budget)}</p>
          </div>
        ))}
        {budgets.length === 0 && <p className="p-3 text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>No budgets match this filter.</p>}
      </div>
    </div>
  );
}

function ApprovalCard({ expense, children }) {
  const { formatCurrency } = useCurrency();
  const childItems = Children.toArray(children);
  const details = childItems.slice(0, -1);
  const actions = childItems.at(-1);
  return (
    <div
      className="rounded-xl p-3 transition-colors"
      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-white">{expense.user.full_name}</p>
            <Badge tone={tone(expense.status)}>{expense.status}</Badge>
          </div>
          <p className="mt-1 text-sm text-slate-400">{expense.department.name} | {formatCurrency(expense.amount)}</p>
          <p className="text-sm text-slate-400">Spent on: {expense.description || "-"}</p>
          {details}
        </div>
        <div className="shrink-0">{actions}</div>
      </div>
    </div>
  );
}

function QueuePanel({ title, children, emptyText }) {
  const items = Array.isArray(children) ? children.filter(Boolean) : children;
  const empty = Array.isArray(items) ? items.length === 0 : !items;
  return (
    <div className="panel p-4">
      <h2 className="mb-4 text-base font-bold text-white">{title}</h2>
      <div className="space-y-3">
        {empty
          ? <p className="text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>{emptyText}</p>
          : items}
      </div>
    </div>
  );
}

function ActionPair({ onApprove, onReject, disabled, requireReason = false }) {
  const [showReason, setShowReason] = useState(false);
  const [reason, setReason] = useState("");

  function handleRejectClick() {
    if (requireReason) {
      setShowReason(true);
    } else {
      onReject("");
    }
  }

  function confirmReject() {
    if (!reason.trim()) return;
    onReject(reason.trim());
    setShowReason(false);
    setReason("");
  }

  if (showReason) {
    return (
      <div className="mt-2 space-y-2">
        <textarea
          className="field min-h-[72px] w-full text-sm"
          placeholder="Enter rejection reason (required)…"
          value={reason}
          autoFocus
          onChange={(e) => setReason(e.target.value)}
        />
        <div className="flex gap-2">
          <button
            className="btn-danger h-8 flex-1 text-sm"
            type="button"
            disabled={!reason.trim()}
            onClick={confirmReject}
          >
            Confirm reject
          </button>
          <button
            className="btn-secondary h-8 px-3 text-sm"
            type="button"
            onClick={() => { setShowReason(false); setReason(""); }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <button className="btn-primary h-9 w-9 p-0" title="Approve" type="button" disabled={disabled} onClick={onApprove}>
        <Check size={16} aria-hidden="true" />
      </button>
      <button className="btn-danger h-9 w-9 p-0" title="Reject" type="button" disabled={disabled} onClick={handleRejectClick}>
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

function ReceiptPreview({ preview, onClose }) {
  const isPdf = preview.type === "application/pdf";
  const isImage = preview.type?.startsWith("image/");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4" style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)" }}>
      <section
        className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl shadow-2xl"
        style={{ background: "#0d0d0d", border: "1px solid rgba(255,255,255,0.1)" }}
      >
        <div
          className="flex shrink-0 items-center justify-between px-4 py-3"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}
        >
          <h2 className="text-base font-bold text-white">{preview.title}</h2>
          <button className="btn-secondary h-9 w-9 p-0" type="button" title="Close" onClick={onClose}>
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <div
          className="flex min-h-[60vh] items-center justify-center overflow-auto p-4"
          style={{ background: "rgba(255,255,255,0.02)" }}
        >
          {isImage && <img className="max-h-[78vh] max-w-full rounded-xl object-contain" style={{ boxShadow: "0 8px 40px rgba(0,0,0,0.6)" }} src={preview.url} alt={preview.title} />}
          {isPdf && <iframe className="h-[78vh] w-full rounded-xl" src={preview.url} title={preview.title} />}
          {!isImage && !isPdf && (
            <a className="btn-primary" href={preview.url} target="_blank" rel="noreferrer">Open receipt file</a>
          )}
        </div>
      </section>
    </div>
  );
}

function TableHeader({ title }) {
  return (
    <div
      className="flex items-center gap-2 p-4"
      style={{ borderBottom: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.02)" }}
    >
      <BadgeCheck size={18} className="text-cyan-400" aria-hidden="true" />
      <h2 className="text-base font-bold text-white">{title}</h2>
    </div>
  );
}

function EditUserModal({ user, departments, saving, onClose, onSave }) {
  const [form, setForm] = useState({
    full_name: user.full_name,
    role: user.role,
    department_id: user.department_id ?? "",
    is_active: user.is_active,
  });

  function handleSubmit(e) {
    e.preventDefault();
    onSave({
      full_name: form.full_name,
      role: form.role,
      department_id: form.department_id ? Number(form.department_id) : null,
      is_active: form.is_active,
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)" }}
    >
      <section
        className="w-full max-w-md rounded-2xl p-4 sm:p-6 shadow-2xl"
        style={{ background: "#0d0d0d", border: "1px solid rgba(255,255,255,0.12)" }}
      >
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Pencil size={16} style={{ color: "#22d3ee" }} aria-hidden="true" />
            <h2 className="text-base font-bold text-white">Edit User</h2>
          </div>
          <button className="btn-secondary h-8 w-8 p-0" type="button" onClick={onClose}>
            <X size={15} aria-hidden="true" />
          </button>
        </div>

        <p className="mb-4 text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
          Editing: <span className="text-white/60">{user.email}</span>
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="label mb-1 block">Full name</label>
            <input
              className="field"
              required
              minLength={2}
              value={form.full_name}
              onChange={(e) => setForm((p) => ({ ...p, full_name: e.target.value }))}
            />
          </div>
          <div>
            <label className="label mb-1 block">Role</label>
            <select
              className="field"
              value={form.role}
              onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}
            >
              <option value="USER">User</option>
              <option value="ADMIN">Admin</option>
            </select>
          </div>
          <div>
            <label className="label mb-1 block">Department</label>
            <select
              className="field"
              value={form.department_id}
              onChange={(e) => setForm((p) => ({ ...p, department_id: e.target.value }))}
            >
              <option value="">No department</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-3 pt-1">
            <input
              id="edit-is-active"
              type="checkbox"
              className="h-4 w-4 rounded"
              checked={form.is_active}
              onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))}
            />
            <label htmlFor="edit-is-active" className="text-sm cursor-pointer" style={{ color: "rgba(255,255,255,0.7)" }}>
              Account active
            </label>
          </div>
          <div className="flex gap-2 pt-2">
            <button className="btn-primary flex-1" disabled={saving} type="submit">
              <KeyRound size={15} aria-hidden="true" />
              Save changes
            </button>
            <button className="btn-secondary flex-1" type="button" onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function SimpleTable({ columns, rows, emptyText = "No records." }) {
  return (
    <div className="overflow-x-auto">
      <table className="resp-table w-full min-w-[480px] text-left text-sm text-slate-200">
        <thead style={{ background: "rgba(255,255,255,0.07)" }}>
          <tr className="text-xs uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.6)" }}>
            {columns.map((column) => <th key={column} className="px-3 py-2.5">{column}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="transition-colors" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              {row.map((cell, cellIndex) => <td key={cellIndex} className="px-3 py-2.5 text-slate-200">{cell}</td>)}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td className="px-4 py-6 text-center text-sm" style={{ color: "rgba(255,255,255,0.3)" }} colSpan={columns.length}>{emptyText}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
