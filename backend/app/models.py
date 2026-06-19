from datetime import date, datetime
from enum import Enum

from sqlalchemy import Boolean, Date, DateTime, Enum as SqlEnum, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Role(str, Enum):
    ADMIN = "ADMIN"
    USER = "USER"


class ExpenseStatus(str, Enum):
    SUBMITTED = "SUBMITTED"
    PENDING_RECEIPT_REVIEW = "PENDING_RECEIPT_REVIEW"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class ReceiptStatus(str, Enum):
    NONE = "NONE"
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class CertStatus(str, Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class Department(Base):
    __tablename__ = "departments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    head_name: Mapped[str | None] = mapped_column(String(120))
    head_email: Mapped[str | None] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    users: Mapped[list["User"]] = relationship(back_populates="department")
    budgets: Mapped[list["Budget"]] = relationship(back_populates="department", cascade="all, delete-orphan")
    expenses: Mapped[list["Expense"]] = relationship(back_populates="department")


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(120), nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[Role] = mapped_column(SqlEnum(Role), default=Role.USER, nullable=False)
    department_id: Mapped[int | None] = mapped_column(ForeignKey("departments.id"))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    department: Mapped[Department | None] = relationship(back_populates="users")
    expenses: Mapped[list["Expense"]] = relationship(back_populates="user")
    cert_requests: Mapped[list["CertificationRequest"]] = relationship(back_populates="user")
    password_history: Mapped[list["PasswordHistory"]] = relationship(cascade="all, delete-orphan")
    password_reset_otps: Mapped[list["PasswordResetOTP"]] = relationship(cascade="all, delete-orphan")


class ExpenseCategory(Base):
    __tablename__ = "expense_categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    expenses: Mapped[list["Expense"]] = relationship(back_populates="category")


class Budget(Base):
    __tablename__ = "budgets"
    __table_args__ = (UniqueConstraint("department_id", "period", name="uq_department_budget_period"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    department_id: Mapped[int] = mapped_column(ForeignKey("departments.id"), nullable=False)
    period: Mapped[str] = mapped_column(String(7), nullable=False)  # YYYY-MM
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    threshold_percent: Mapped[float] = mapped_column(Float, default=100.0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    department: Mapped[Department] = relationship(back_populates="budgets")


class Expense(Base):
    __tablename__ = "expenses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    department_id: Mapped[int] = mapped_column(ForeignKey("departments.id"), nullable=False)
    category_id: Mapped[int] = mapped_column(ForeignKey("expense_categories.id"), nullable=False)
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    expense_date: Mapped[date] = mapped_column(Date, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    vendor: Mapped[str | None] = mapped_column(String(180))
    status: Mapped[ExpenseStatus] = mapped_column(SqlEnum(ExpenseStatus), default=ExpenseStatus.SUBMITTED)
    receipt_status: Mapped[ReceiptStatus] = mapped_column(SqlEnum(ReceiptStatus), default=ReceiptStatus.NONE)
    receipt_path: Mapped[str | None] = mapped_column(String(500))
    ai_amount: Mapped[float | None] = mapped_column(Float)
    ai_vendor: Mapped[str | None] = mapped_column(String(180))
    ai_date: Mapped[date | None] = mapped_column(Date)
    ai_gst_number: Mapped[str | None] = mapped_column(String(32))
    ai_tax_amount: Mapped[float | None] = mapped_column(Float)
    ai_confidence: Mapped[float | None] = mapped_column(Float)
    receipt_kind: Mapped[str | None] = mapped_column(String(40))
    receipt_agent_notes: Mapped[str | None] = mapped_column(Text)
    rejection_reason: Mapped[str | None] = mapped_column(Text)
    policy_status: Mapped[str | None] = mapped_column(String(40))
    budget_impact: Mapped[str | None] = mapped_column(String(40))
    recommendation: Mapped[str | None] = mapped_column(String(60))
    risk_score: Mapped[float | None] = mapped_column(Float)
    agent_workflow: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user: Mapped[User] = relationship(back_populates="expenses")
    department: Mapped[Department] = relationship(back_populates="expenses")
    category: Mapped[ExpenseCategory] = relationship(back_populates="expenses")


class CertificationRequest(Base):
    __tablename__ = "certification_requests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    department_id: Mapped[int] = mapped_column(ForeignKey("departments.id"), nullable=False)
    certificate_name: Mapped[str] = mapped_column(String(180), nullable=False)
    provider: Mapped[str] = mapped_column(String(180), nullable=False)
    cost: Mapped[float] = mapped_column(Float, nullable=False)
    completion_date: Mapped[date] = mapped_column(Date, nullable=False)
    proof_path: Mapped[str | None] = mapped_column(String(500))
    status: Mapped[CertStatus] = mapped_column(SqlEnum(CertStatus), default=CertStatus.PENDING)
    admin_notes: Mapped[str | None] = mapped_column(Text)
    created_expense_id: Mapped[int | None] = mapped_column(ForeignKey("expenses.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user: Mapped[User] = relationship(back_populates="cert_requests")


class PasswordResetOTP(Base):
    __tablename__ = "password_reset_otps"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    otp_code: Mapped[str] = mapped_column(String(12), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    used: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class PasswordHistory(Base):
    __tablename__ = "password_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
