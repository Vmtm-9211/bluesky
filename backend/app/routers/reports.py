from sqlalchemy import extract, func
from sqlalchemy.orm import Session

from fastapi import APIRouter, Depends, HTTPException, Query

from app.database import get_db
from app.deps import get_current_user
from app.models import Budget, Department, Expense, ExpenseCategory, ExpenseStatus, Role, User
from app.schemas import ReportSummary
from app.services.budget import budget_service

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/summary", response_model=ReportSummary)
def summary(
    department_id: int | None = Query(None),
    user_id: int | None = Query(None),
    period_type: str = Query("all"),
    period: str | None = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    expense_filters = []
    if current_user.role != Role.ADMIN:
        expense_filters.append(Expense.department_id == current_user.department_id)
    else:
        if department_id:
            expense_filters.append(Expense.department_id == department_id)
        if user_id:
            expense_filters.append(Expense.user_id == user_id)

    if period:
        if period_type == "month":
            year, month = [int(part) for part in period.split("-")]
            expense_filters.extend([extract("year", Expense.expense_date) == year, extract("month", Expense.expense_date) == month])
        elif period_type == "quarter":
            try:
                year_text, quarter_text = period.split("-Q")
                quarter = int(quarter_text)
            except ValueError as exc:
                raise HTTPException(status_code=400, detail="Quarter period must look like 2026-Q2") from exc
            start_month = (quarter - 1) * 3 + 1
            expense_filters.extend(
                [
                    extract("year", Expense.expense_date) == int(year_text),
                    extract("month", Expense.expense_date).in_([start_month, start_month + 1, start_month + 2]),
                ]
            )
        elif period_type == "year":
            expense_filters.append(extract("year", Expense.expense_date) == int(period))

    base = db.query(Expense).filter(*expense_filters)
    approved_base = base.filter(Expense.status == ExpenseStatus.APPROVED)
    approved = float(
        approved_base.with_entities(func.coalesce(func.sum(Expense.amount), 0)).scalar() or 0
    )
    pending = float(
        base.filter(Expense.status.in_([ExpenseStatus.SUBMITTED, ExpenseStatus.PENDING_RECEIPT_REVIEW]))
        .with_entities(func.coalesce(func.sum(Expense.amount), 0))
        .scalar()
        or 0
    )
    rejected = float(
        base.filter(Expense.status == ExpenseStatus.REJECTED)
        .with_entities(func.coalesce(func.sum(Expense.amount), 0))
        .scalar()
        or 0
    )

    by_department_query = (
        db.query(Department.name.label("name"), func.coalesce(func.sum(Expense.amount), 0).label("value"))
        .join(Expense, Expense.department_id == Department.id)
        .filter(*expense_filters, Expense.status == ExpenseStatus.APPROVED)
        .group_by(Department.name)
        .all()
    )
    by_category_query = (
        db.query(ExpenseCategory.name.label("name"), func.coalesce(func.sum(Expense.amount), 0).label("value"))
        .join(Expense, Expense.category_id == ExpenseCategory.id)
        .filter(*expense_filters, Expense.status == ExpenseStatus.APPROVED)
        .group_by(ExpenseCategory.name)
        .all()
    )
    by_user_query = (
        db.query(User.full_name.label("name"), Department.name.label("department"), func.coalesce(func.sum(Expense.amount), 0).label("value"))
        .join(Expense, Expense.user_id == User.id)
        .join(Department, Expense.department_id == Department.id)
        .filter(*expense_filters, Expense.status == ExpenseStatus.APPROVED)
        .group_by(User.full_name, Department.name)
        .order_by(func.coalesce(func.sum(Expense.amount), 0).desc())
        .all()
    )
    by_month_query = (
        db.query(
            extract("year", Expense.expense_date).label("year"),
            extract("month", Expense.expense_date).label("month"),
            func.coalesce(func.sum(Expense.amount), 0).label("value"),
        )
        .filter(*expense_filters, Expense.status == ExpenseStatus.APPROVED)
        .group_by("year", "month")
        .order_by("year", "month")
        .all()
    )

    budget_query = db.query(Budget).join(Department)
    if current_user.role != Role.ADMIN:
        budget_query = budget_query.filter(Budget.department_id == current_user.department_id)
    elif department_id:
        budget_query = budget_query.filter(Budget.department_id == department_id)
    budgets = budget_query.order_by(Budget.period.desc()).all()
    health = []
    for budget in budgets:
        spent = budget_service.spent_for_period(db, budget.department_id, budget.period)
        health.append(
            {
                "department": budget.department.name,
                "period": budget.period,
                "budget": budget.amount,
                "spent": spent,
                "percent_used": (spent / budget.amount) * 100 if budget.amount else 0,
                "breached": spent > budget.amount * (budget.threshold_percent / 100),
            }
        )

    recent = (
        base.join(User, Expense.user_id == User.id)
        .join(Department, Expense.department_id == Department.id)
        .join(ExpenseCategory, Expense.category_id == ExpenseCategory.id)
        .order_by(Expense.expense_date.desc(), Expense.created_at.desc())
        .limit(12)
        .all()
    )

    return {
        "total_spend": approved,
        "approved_spend": approved,
        "pending_spend": pending,
        "rejected_spend": rejected,
        "by_department": [{"name": row.name, "value": float(row.value)} for row in by_department_query],
        "by_category": [{"name": row.name, "value": float(row.value)} for row in by_category_query],
        "by_user": [
            {"name": row.name, "department": row.department, "value": float(row.value)}
            for row in by_user_query
        ],
        "by_month": [
            {"name": f"{int(row.year)}-{int(row.month):02d}", "value": float(row.value)}
            for row in by_month_query
        ],
        "recent_expenses": [
            {
                "id": expense.id,
                "user": expense.user.full_name,
                "department": expense.department.name,
                "category": expense.category.name,
                "vendor": expense.vendor,
                "amount": expense.amount,
                "status": expense.status,
                "expense_date": expense.expense_date.isoformat(),
            }
            for expense in recent
        ],
        "budget_health": health,
    }
