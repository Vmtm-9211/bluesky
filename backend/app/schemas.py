import re
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.models import CertStatus, ExpenseStatus, ReceiptStatus, Role


def _validate_password_strength(v: str) -> str:
    if len(v) < 8:
        raise ValueError("Password must be at least 8 characters long")
    if not re.search(r"[A-Za-z]", v):
        raise ValueError("Password must contain at least one letter")
    if not re.search(r"\d", v):
        raise ValueError("Password must contain at least one number")
    if not re.search(r"[!@#$%^&*()\-_=+\[\]{};:'\",.<>/?\\|`~]", v):
        raise ValueError("Password must contain at least one special character")
    return v


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserRead"


class DepartmentBase(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    head_name: str | None = None
    head_email: EmailStr | None = None
    is_active: bool = True


class DepartmentCreate(DepartmentBase):
    pass


class DepartmentUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    head_name: str | None = None
    head_email: EmailStr | None = None
    is_active: bool | None = None


class DepartmentRead(DepartmentBase):
    id: int
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class UserCreate(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=120)
    password: str = Field(min_length=8)
    role: Role = Role.USER
    department_id: int
    is_active: bool = True

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        return _validate_password_strength(v)


class UserUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=120)
    role: Role | None = None
    department_id: int | None = None
    is_active: bool | None = None


class UserRead(BaseModel):
    id: int
    email: EmailStr
    full_name: str
    role: Role
    department_id: int | None
    is_active: bool
    must_change_password: bool = False
    department: DepartmentRead | None = None
    model_config = ConfigDict(from_attributes=True)


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)

    @field_validator("new_password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        return _validate_password_strength(v)


class CategoryCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    description: str | None = None
    is_active: bool = True


class CategoryRead(CategoryCreate):
    id: int
    model_config = ConfigDict(from_attributes=True)


class BudgetCreate(BaseModel):
    department_id: int
    period: str = Field(pattern=r"^\d{4}-\d{2}$")
    amount: float = Field(gt=0)
    threshold_percent: float = Field(default=100, gt=0, le=200)


class BudgetRead(BudgetCreate):
    id: int
    created_at: datetime
    department: DepartmentRead
    spent: float = 0
    remaining: float = 0
    percent_used: float = 0
    model_config = ConfigDict(from_attributes=True)


class ExpenseCreate(BaseModel):
    category_id: int
    amount: float = Field(gt=0)
    expense_date: date
    description: str | None = None
    vendor: str | None = None


class ExpenseRead(BaseModel):
    id: int
    user_id: int
    department_id: int
    category_id: int
    amount: float
    expense_date: date
    description: str | None
    vendor: str | None
    status: ExpenseStatus
    receipt_status: ReceiptStatus
    receipt_path: str | None
    ai_amount: float | None
    ai_vendor: str | None
    ai_date: date | None
    ai_gst_number: str | None = None
    ai_tax_amount: float | None = None
    ai_confidence: float | None
    receipt_kind: str | None = None
    receipt_agent_notes: str | None = None
    rejection_reason: str | None
    policy_status: str | None = None
    budget_impact: str | None = None
    recommendation: str | None = None
    risk_score: float | None = None
    agent_workflow: str | None = None
    created_at: datetime
    user: UserRead
    department: DepartmentRead
    category: CategoryRead
    model_config = ConfigDict(from_attributes=True)


class ExpenseApproval(BaseModel):
    approved: bool
    reason: str | None = None


class ReceiptApproval(BaseModel):
    approved: bool
    reason: str | None = None


class ReceiptLineItemRead(BaseModel):
    description: str
    unit_price: float
    quantity: float
    total: float


class ReceiptPreviewRead(BaseModel):
    amount: float | None = None
    vendor: str | None = None
    expense_date: date | None = None
    gst_number: str | None = None
    tax_amount: float | None = None
    tax_type: str | None = None
    receipt_kind: str | None = None
    agent_decision: str
    notes: str
    confidence: float
    line_items: list[ReceiptLineItemRead] = []


class CertificationCreate(BaseModel):
    certificate_name: str = Field(min_length=2, max_length=180)
    provider: str = Field(min_length=2, max_length=180)
    cost: float = Field(gt=0)
    completion_date: date


class CertificationRead(BaseModel):
    id: int
    user_id: int
    department_id: int
    certificate_name: str
    provider: str
    cost: float
    completion_date: date
    proof_path: str | None
    status: CertStatus
    admin_notes: str | None
    created_expense_id: int | None
    created_at: datetime
    user: UserRead
    model_config = ConfigDict(from_attributes=True)


class CertificationApproval(BaseModel):
    approved: bool
    admin_notes: str | None = None


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetConfirm(BaseModel):
    email: EmailStr
    otp_code: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")
    new_password: str = Field(min_length=8)

    @field_validator("new_password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        return _validate_password_strength(v)


class ReportSummary(BaseModel):
    total_spend: float
    approved_spend: float
    pending_spend: float
    rejected_spend: float
    by_department: list[dict]
    by_category: list[dict]
    by_month: list[dict]
    by_user: list[dict] = []
    recent_expenses: list[dict] = []
    budget_health: list[dict]
