from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user, require_admin
from app.models import Budget, Department, Role, User
from app.schemas import BudgetCreate, BudgetRead
from app.services.budget import budget_service

router = APIRouter(prefix="/budgets", tags=["budgets"])


def budget_to_read(db: Session, budget: Budget) -> dict:
    spent = budget_service.spent_for_period(db, budget.department_id, budget.period)
    return {
        **BudgetRead.model_validate(budget).model_dump(),
        "spent": spent,
        "remaining": budget.amount - spent,
        "percent_used": (spent / budget.amount) * 100 if budget.amount else 0,
    }


@router.get("", response_model=list[BudgetRead])
def list_budgets(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    query = db.query(Budget).join(Department)
    if current_user.role != Role.ADMIN:
        query = query.filter(Budget.department_id == current_user.department_id)
    budgets = query.order_by(Budget.period.desc(), Department.name).all()
    return [budget_to_read(db, budget) for budget in budgets]


@router.post("", response_model=BudgetRead, dependencies=[Depends(require_admin)])
def upsert_budget(payload: BudgetCreate, db: Session = Depends(get_db)):
    budget = (
        db.query(Budget)
        .filter(Budget.department_id == payload.department_id, Budget.period == payload.period)
        .first()
    )
    if budget:
        budget.amount = payload.amount
        budget.threshold_percent = payload.threshold_percent
    else:
        budget = Budget(**payload.model_dump())
        db.add(budget)
    db.commit()
    db.refresh(budget)
    budget_service.check_and_alert(db, payload.department_id, payload.period)
    return budget_to_read(db, budget)


@router.delete("/{budget_id}", dependencies=[Depends(require_admin)])
def delete_budget(budget_id: int, db: Session = Depends(get_db)):
    budget = db.get(Budget, budget_id)
    if not budget:
        raise HTTPException(status_code=404, detail="Budget not found")
    db.delete(budget)
    db.commit()
    return {"message": "Budget deleted"}
