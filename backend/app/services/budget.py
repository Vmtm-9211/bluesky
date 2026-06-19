import logging
from sqlalchemy import extract, func
from sqlalchemy.orm import Session

from app.models import Budget, Department, Expense, ExpenseStatus, Role, User
from app.services.email import email_service

logger = logging.getLogger(__name__)


def period_from_date(value) -> str:
    return f"{value.year:04d}-{value.month:02d}"


class BudgetService:
    def spent_for_period(self, db: Session, department_id: int, period: str) -> float:
        year, month = [int(part) for part in period.split("-")]
        spent = (
            db.query(func.coalesce(func.sum(Expense.amount), 0.0))
            .filter(
                Expense.department_id == department_id,
                extract("year", Expense.expense_date) == year,
                extract("month", Expense.expense_date) == month,
                Expense.status == ExpenseStatus.APPROVED,
            )
            .scalar()
        )
        return float(spent or 0)

    def check_and_alert(self, db: Session, department_id: int, period: str) -> dict | None:
        budget = (
            db.query(Budget)
            .filter(Budget.department_id == department_id, Budget.period == period)
            .first()
        )
        if not budget:
            return None

        spent = self.spent_for_period(db, department_id, period)
        threshold_amount = budget.amount * (budget.threshold_percent / 100)
        percent_used = (spent / budget.amount) * 100 if budget.amount else 0
        breached = spent >= threshold_amount

        if breached:
            try:
                department = db.get(Department, department_id)
                dept_name = department.name if department else str(department_id)

                admin_users = (
                    db.query(User)
                    .filter(User.role == Role.ADMIN, User.is_active.is_(True))
                    .all()
                )
                recipients = list({str(u.email) for u in admin_users if u.email})

                if not recipients:
                    logger.warning(
                        "[budget-alert] Threshold breached for %s (%s) but no active ADMIN users found in DB",
                        dept_name, period,
                    )
                else:
                    logger.info(
                        "[budget-alert] Sending alert for %s (%s) — %.1f%% used — to %s",
                        dept_name, period, percent_used, recipients,
                    )
                    email_service.send_email(
                        recipients,
                        f"Budget Alert: {dept_name} has reached {percent_used:.1f}% ({period})",
                        (
                            f"Budget Alert\n"
                            f"{'=' * 40}\n"
                            f"Department : {dept_name}\n"
                            f"Period     : {period}\n"
                            f"Budget     : ₹{budget.amount:,.2f}\n"
                            f"Alert at   : {budget.threshold_percent:.1f}%  (₹{threshold_amount:,.2f})\n"
                            f"Spent      : ₹{spent:,.2f}  ({percent_used:.1f}%)\n"
                            f"{'=' * 40}\n\n"
                            f"Immediate action may be required to control further spending."
                        ),
                    )
            except Exception as exc:
                # Never let alert errors break the expense approval flow
                logger.error("[budget-alert] Failed to send alert for dept=%s period=%s: %s", department_id, period, exc)

        return {
            "spent": spent,
            "budget": budget.amount,
            "threshold_percent": budget.threshold_percent,
            "percent_used": percent_used,
            "breached": breached,
        }


budget_service = BudgetService()
