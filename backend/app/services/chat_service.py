from pathlib import Path

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import (
    Budget,
    CertificationRequest,
    CertStatus,
    Department,
    Expense,
    ExpenseStatus,
    ReceiptStatus,
    Role,
    User,
)

settings = get_settings()

SYSTEM_PROMPT = """You are an intelligent AI assistant built into the Company Expense Tracking Dashboard.
You have real-time access to the user's expense, budget, and certification data shown below.

Rules:
- Answer concisely and clearly based ONLY on the data provided.
- Use ₹ (Indian Rupee) for all currency values.
- Never invent or assume data that is not in the context.
- If data is not available, say so honestly.
- Be conversational but professional.
- For numeric summaries, round to 2 decimal places.
- Keep answers short unless a detailed breakdown is asked."""


def _fmt(val) -> str:
    if val is None:
        return "N/A"
    return f"₹{val:,.2f}"


# ── Per-role context builders ─────────────────────────────────────────────────

def build_user_context(user: User, db: Session) -> str:
    expenses = (
        db.query(Expense)
        .filter(Expense.user_id == user.id)
        .order_by(Expense.expense_date.desc())
        .limit(30)
        .all()
    )

    budgets = (
        db.query(Budget)
        .filter(Budget.department_id == user.department_id)
        .order_by(Budget.period.desc())
        .limit(6)
        .all()
    )

    certs = (
        db.query(CertificationRequest)
        .filter(CertificationRequest.user_id == user.id)
        .order_by(CertificationRequest.completion_date.desc())
        .limit(10)
        .all()
    )

    approved_total = sum(e.amount for e in expenses if e.status == ExpenseStatus.APPROVED)
    pending_total  = sum(e.amount for e in expenses if e.status == ExpenseStatus.SUBMITTED)

    lines = [
        "=== CURRENT USER ===",
        f"Name: {user.full_name}",
        f"Email: {user.email}",
        f"Department: {user.department.name if user.department else 'Not assigned'}",
        "",
        "=== MY EXPENSE SUMMARY ===",
        f"Total Approved: {_fmt(approved_total)}",
        f"Total Pending Approval: {_fmt(pending_total)}",
        f"Total Expenses Filed: {len(expenses)}",
        "",
        f"=== MY RECENT EXPENSES (last {len(expenses)}) ===",
    ]

    for exp in expenses:
        cat = exp.category.name if exp.category else "Unknown"
        lines.append(
            f"- [{exp.expense_date}] {cat} | {_fmt(exp.amount)} | "
            f"Vendor: {exp.vendor or 'N/A'} | Status: {exp.status}"
        )

    if budgets:
        lines += ["", "=== DEPARTMENT BUDGET ==="]
        for b in budgets:
            spent = sum(
                e.amount for e in expenses
                if str(e.expense_date)[:7] == b.period and e.status == ExpenseStatus.APPROVED
            )
            remaining = b.amount - spent
            lines.append(
                f"- {b.period}: Allocated {_fmt(b.amount)} | "
                f"Spent {_fmt(spent)} | Remaining {_fmt(remaining)} | Threshold {b.threshold_percent}%"
            )

    if certs:
        lines += ["", "=== MY CERTIFICATIONS ==="]
        for c in certs:
            lines.append(
                f"- {c.certificate_name} ({c.provider}) | "
                f"Cost: {_fmt(c.cost)} | Date: {c.completion_date} | Status: {c.status}"
            )

    return "\n".join(lines)


def build_admin_context(user: User, db: Session) -> str:
    recent_expenses = (
        db.query(Expense)
        .order_by(Expense.expense_date.desc())
        .limit(60)
        .all()
    )

    budgets = (
        db.query(Budget)
        .order_by(Budget.period.desc())
        .limit(30)
        .all()
    )

    departments = db.query(Department).filter(Department.is_active.is_(True)).all()
    total_users  = db.query(User).count()

    pending_approvals = (
        db.query(Expense).filter(Expense.status == ExpenseStatus.SUBMITTED).count()
    )
    pending_receipts  = (
        db.query(Expense).filter(Expense.receipt_status == ReceiptStatus.PENDING).count()
    )
    pending_certs     = (
        db.query(CertificationRequest).filter(CertificationRequest.status == CertStatus.PENDING).count()
    )

    approved_total = sum(e.amount for e in recent_expenses if e.status == ExpenseStatus.APPROVED)
    pending_total  = sum(e.amount for e in recent_expenses if e.status == ExpenseStatus.SUBMITTED)

    lines = [
        "=== ADMIN CONTEXT ===",
        f"Admin: {user.full_name}",
        "",
        "=== ORGANISATION OVERVIEW ===",
        f"Active Departments: {len(departments)}",
        f"Total Users: {total_users}",
        f"Pending Expense Approvals: {pending_approvals}",
        f"Pending Receipt Reviews: {pending_receipts}",
        f"Pending Certification Approvals: {pending_certs}",
        f"Approved Amount (recent 60 expenses): {_fmt(approved_total)}",
        f"Pending Amount  (recent 60 expenses): {_fmt(pending_total)}",
        "",
        "=== DEPARTMENTS ===",
    ]

    for dept in departments:
        lines.append(f"- {dept.name} | Head: {dept.head_name or 'N/A'}")

    lines += ["", "=== RECENT EXPENSES (last 60) ==="]
    for exp in recent_expenses:
        uname  = exp.user.full_name if exp.user else "Unknown"
        dname  = exp.department.name if exp.department else "N/A"
        cname  = exp.category.name if exp.category else "Unknown"
        lines.append(
            f"- [{exp.expense_date}] {uname} | {dname} | "
            f"{cname}: {_fmt(exp.amount)} | {exp.status}"
        )

    if budgets:
        lines += ["", "=== BUDGET OVERVIEW ==="]
        for b in budgets:
            dname = b.department.name if b.department else "Unknown"
            spent = sum(
                e.amount for e in recent_expenses
                if e.department_id == b.department_id
                and str(e.expense_date)[:7] == b.period
                and e.status == ExpenseStatus.APPROVED
            )
            lines.append(
                f"- {dname} | {b.period}: "
                f"Allocated {_fmt(b.amount)} | ~Spent {_fmt(spent)}"
            )

    return "\n".join(lines)


# ── Gemini chat call ──────────────────────────────────────────────────────────

def call_gemini_chat(context: str, history: list[dict], message: str) -> str:
    from google import genai
    from google.genai import types as gtypes

    api_key = settings.gemini_api_key or settings.google_api_key
    if not api_key:
        raise RuntimeError(
            "GEMINI_API_KEY is not set. Add it to docker-compose.yml under the backend environment."
        )

    client = genai.Client(api_key=api_key)

    contents = []
    for msg in history:
        role = "user" if msg.get("role") == "user" else "model"
        contents.append(gtypes.Content(role=role, parts=[gtypes.Part(text=msg.get("text", ""))]))
    contents.append(gtypes.Content(role="user", parts=[gtypes.Part(text=message)]))

    response = client.models.generate_content(
        model=settings.gemini_model,
        contents=contents,
        config=gtypes.GenerateContentConfig(
            system_instruction=f"{SYSTEM_PROMPT}\n\n{context}",
            temperature=0.3,
            max_output_tokens=1024,
        ),
    )
    return response.text.strip()
