from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import require_admin
from app.models import Department, ExpenseCategory, User
from app.schemas import (
    CategoryCreate,
    CategoryRead,
    DepartmentCreate,
    DepartmentRead,
    DepartmentUpdate,
    UserCreate,
    UserRead,
    UserUpdate,
)
from app.security import get_password_hash
from app.services.email import email_service

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_admin)])


@router.get("/departments", response_model=list[DepartmentRead])
def list_departments(db: Session = Depends(get_db)):
    return db.query(Department).order_by(Department.name).all()


@router.post("/departments", response_model=DepartmentRead)
def create_department(payload: DepartmentCreate, db: Session = Depends(get_db)):
    department = Department(**payload.model_dump())
    db.add(department)
    db.commit()
    db.refresh(department)
    return department


@router.patch("/departments/{department_id}", response_model=DepartmentRead)
def update_department(department_id: int, payload: DepartmentUpdate, db: Session = Depends(get_db)):
    department = db.get(Department, department_id)
    if not department:
        raise HTTPException(status_code=404, detail="Department not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(department, key, value)
    db.commit()
    db.refresh(department)
    return department


@router.get("/users", response_model=list[UserRead])
def list_users(db: Session = Depends(get_db)):
    return db.query(User).order_by(User.full_name).all()


@router.post("/users", response_model=UserRead)
def create_user(payload: UserCreate, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=409, detail="Email already exists")
    plain_password = payload.password
    user_data = payload.model_dump(exclude={"password"})
    user = User(**user_data, hashed_password=get_password_hash(plain_password), must_change_password=True)
    db.add(user)
    db.commit()
    db.refresh(user)
    email_service.send_email(
        [user.email],
        "Welcome to Bilvantis Expense Portal — Your Login Credentials",
        (
            f"Hello {user.full_name},\n\n"
            f"An account has been created for you on the Expense Management Portal.\n\n"
            f"Email (User ID): {user.email}\n"
            f"Temporary Password: {plain_password}\n\n"
            f"You will be required to set a new password on your first login.\n\n"
            f"Please keep your credentials secure.\n\n"
            f"Regards,\nBilvantis Finance Team"
        ),
    )
    return user


@router.patch("/users/{user_id}", response_model=UserRead)
def update_user(user_id: int, payload: UserUpdate, db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(user, key, value)
    db.commit()
    db.refresh(user)
    return user


@router.delete("/users/{user_id}", status_code=204)
def delete_user(user_id: int, db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.role == "ADMIN":
        raise HTTPException(status_code=400, detail="Cannot delete an admin user")
    if user.expenses:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete user — they have {len(user.expenses)} expense record(s). Deactivate the account instead.",
        )
    if user.cert_requests:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete user — they have {len(user.cert_requests)} certification request(s). Deactivate the account instead.",
        )
    db.delete(user)
    db.commit()


@router.post("/users/{user_id}/reset-password")
def admin_reset_password(user_id: int, db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    temporary_password = "Welcome@123"
    user.hashed_password = get_password_hash(temporary_password)
    db.commit()
    return {"message": "Password reset", "temporary_password": temporary_password}


@router.get("/categories", response_model=list[CategoryRead])
def list_categories(db: Session = Depends(get_db)):
    return db.query(ExpenseCategory).order_by(ExpenseCategory.name).all()


@router.post("/categories", response_model=CategoryRead)
def create_category(payload: CategoryCreate, db: Session = Depends(get_db)):
    category = ExpenseCategory(**payload.model_dump())
    db.add(category)
    db.commit()
    db.refresh(category)
    return category
