import io
import tempfile
from datetime import date
import mimetypes
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from PIL import Image, ImageOps
from sqlalchemy import extract
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.deps import get_current_user, require_admin
from app.models import Budget, Department, Expense, ExpenseCategory, ExpenseStatus, ReceiptStatus, Role, User
from app.schemas import ExpenseApproval, ExpenseRead, ReceiptApproval, ReceiptPreviewRead
from app.services.ai import receipt_analyzer
from app.services.budget import budget_service, period_from_date
from app.services.document_agent import DocumentSubmissionContext, expense_document_agent

router = APIRouter(prefix="/expenses", tags=["expenses"])
UPLOAD_ROOT = Path("uploads/receipts")

# PDF + every common image format; MIME prefix "image/" also accepted
_ALLOWED_SUFFIXES = {
    ".pdf",
    ".jpg", ".jpeg", ".png", ".gif", ".webp",
    ".bmp", ".tiff", ".tif", ".heic", ".heif", ".avif",
}


def expense_query(db: Session):
    return db.query(Expense).options(
        joinedload(Expense.user),
        joinedload(Expense.department),
        joinedload(Expense.category),
    )


def _validate_receipt_type(file: UploadFile) -> None:
    suffix = Path(file.filename or "").suffix.lower()
    mime = (file.content_type or "").lower().split(";")[0].strip()
    if suffix in _ALLOWED_SUFFIXES or mime.startswith("image/") or mime == "application/pdf":
        return
    raise HTTPException(
        status_code=422,
        detail=(
            f"File type not supported (got '{suffix or mime}'). "
            "Please upload a PDF or an image file (jpg, png, gif, webp, bmp, tiff, heic, pdf)."
        ),
    )


async def save_upload(file: UploadFile | None) -> str | None:
    if not file or not file.filename:
        return None
    UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)
    suffix = Path(file.filename).suffix.lower()
    target = UPLOAD_ROOT / f"{uuid4().hex}{suffix}"
    content = await file.read()
    # Auto-correct EXIF rotation for image files so Gemini always sees an upright image
    if suffix in {".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".tif", ".webp", ".gif"}:
        try:
            img = Image.open(io.BytesIO(content))
            img = ImageOps.exif_transpose(img)
            buf = io.BytesIO()
            fmt = "JPEG" if suffix in {".jpg", ".jpeg"} else img.format or "PNG"
            img.save(buf, format=fmt)
            content = buf.getvalue()
        except Exception:
            pass  # keep original bytes if PIL fails
    target.write_bytes(content)
    return str(target)


@router.get("", response_model=list[ExpenseRead])
def list_expenses(
    department_id: int | None = Query(None),
    user_id: int | None = Query(None),
    period_type: str = Query("all"),
    period: str | None = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = expense_query(db)
    if current_user.role != Role.ADMIN:
        query = query.filter(Expense.user_id == current_user.id)
    else:
        if department_id:
            query = query.filter(Expense.department_id == department_id)
        if user_id:
            query = query.filter(Expense.user_id == user_id)
    if period and period_type == "month":
        year, month = [int(part) for part in period.split("-")]
        query = query.filter(extract("year", Expense.expense_date) == year, extract("month", Expense.expense_date) == month)
    elif period and period_type == "quarter":
        year, quarter = period.split("-Q")
        start_month = (int(quarter) - 1) * 3 + 1
        query = query.filter(
            extract("year", Expense.expense_date) == int(year),
            extract("month", Expense.expense_date).in_([start_month, start_month + 1, start_month + 2]),
        )
    elif period and period_type == "year":
        query = query.filter(extract("year", Expense.expense_date) == int(period))
    return query.order_by(Expense.created_at.desc()).all()


@router.get("/categories")
def list_expense_categories(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(ExpenseCategory).filter(ExpenseCategory.is_active.is_(True)).order_by(ExpenseCategory.name).all()


@router.post("/receipt-preview", response_model=ReceiptPreviewRead)
async def preview_receipt(
    category_name: str | None = Form(None),
    vendor: str | None = Form(None),
    receipt: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not current_user.department_id:
        raise HTTPException(status_code=400, detail="User has no department")
    if not receipt or not receipt.filename:
        raise HTTPException(status_code=400, detail="Receipt is required")
    _validate_receipt_type(receipt)

    department = db.get(Department, current_user.department_id)
    content = await receipt.read()
    suffix = Path(receipt.filename).suffix.lower()
    if suffix in {".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".tif", ".webp", ".gif"}:
        try:
            img = Image.open(io.BytesIO(content))
            img = ImageOps.exif_transpose(img)
            buf = io.BytesIO()
            fmt = "JPEG" if suffix in {".jpg", ".jpeg"} else img.format or "PNG"
            img.save(buf, format=fmt)
            content = buf.getvalue()
        except Exception:
            pass
    temp = tempfile.NamedTemporaryFile(prefix="receipt-preview-", suffix=suffix, delete=False)
    temp_path = temp.name
    try:
        with temp:
            temp.write(content)
        extraction = receipt_analyzer.analyze(
            temp_path,
            receipt.filename,
            DocumentSubmissionContext(
                submission_type="EXPENSE_RECEIPT",
                employee_name=current_user.full_name,
                department_name=department.name if department else None,
                category_name=category_name,
                vendor=vendor,
            ),
        )
    finally:
        try:
            Path(temp_path).unlink(missing_ok=True)
        except OSError:
            pass

    auto_approved = (
        extraction.receipt_kind == "SYSTEM_GENERATED"
        and extraction.recommendation == "AUTO_APPROVE_RECEIPT"
        and extraction.policy_status == "COMPLIANT"
    )
    return {
        "amount": extraction.amount,
        "vendor": extraction.vendor,
        "expense_date": extraction.expense_date,
        "gst_number": extraction.gst_number,
        "tax_amount": extraction.tax_amount,
        "tax_type": extraction.tax_type,
        "receipt_kind": extraction.receipt_kind,
        "agent_decision": "Auto-approved" if auto_approved else "Needs review",
        "notes": extraction.notes,
        "confidence": extraction.confidence,
        "line_items": [
            {
                "description": item.description,
                "unit_price": item.unit_price,
                "quantity": item.quantity,
                "total": item.total,
            }
            for item in extraction.line_items
        ],
    }


@router.post("", response_model=ExpenseRead)
async def create_expense(
    category_id: int | None = Form(None),
    category_name: str | None = Form(None),
    amount: float = Form(...),
    expense_date: date = Form(...),
    description: str | None = Form(None),
    vendor: str | None = Form(None),
    currency_code: str | None = Form("INR"),
    entered_amount: float | None = Form(None),
    receipt: UploadFile | None = File(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not current_user.department_id:
        raise HTTPException(status_code=400, detail="User has no department")

    if category_id:
        category = db.get(ExpenseCategory, category_id)
        if not category or not category.is_active:
            raise HTTPException(status_code=404, detail="Category not found")
    elif category_name:
        name = category_name.strip()
        category = (
            db.query(ExpenseCategory)
            .filter(ExpenseCategory.name.ilike(name))
            .first()
        )
        if not category:
            category = ExpenseCategory(name=name, is_active=True)
            db.add(category)
            db.flush()
    else:
        raise HTTPException(status_code=400, detail="category_id or category_name is required")

    # Validate type before reading file bytes
    if receipt and receipt.filename:
        _validate_receipt_type(receipt)

    receipt_path = await save_upload(receipt)

    # Build budget context for ADK multi-agent pipeline
    budget_ctx = None
    if receipt_path and current_user.department_id:
        period = period_from_date(expense_date)
        budget_row = (
            db.query(Budget)
            .filter(Budget.department_id == current_user.department_id, Budget.period == period)
            .first()
        )
        budget_pct = None
        budget_threshold = None
        if budget_row and budget_row.amount:
            spent = budget_service.spent_for_period(db, current_user.department_id, period)
            budget_pct = round(spent / budget_row.amount * 100, 1)
            budget_threshold = budget_row.threshold_percent
        dept = current_user.department
        budget_ctx = DocumentSubmissionContext(
            submission_type="EXPENSE_RECEIPT",
            employee_name=current_user.full_name,
            department_name=dept.name if dept else None,
            category_name=category.name if category else None,
            vendor=vendor,
            amount=amount,
            submitted_currency=(currency_code or "INR").upper(),
            submitted_original_amount=entered_amount,
            expense_date=expense_date,
            budget_percent_used=budget_pct,
            budget_threshold_percent=budget_threshold,
        )

    extraction = receipt_analyzer.analyze(receipt_path, receipt.filename if receipt else None, context=budget_ctx) if receipt_path else None

    # Routing decision
    # 1. Receipt has valid GST/tax info  → Receipt AI Queue (admin reviews)
    # 2. Receipt present, no tax data   → direct to expense approval (no receipt review needed)
    # 3. No receipt                      → straight submission
    has_proper_taxes = bool(
        extraction and (
            extraction.gst_number or
            (extraction.tax_amount and extraction.tax_amount > 0)
        )
    )
    agent_auto_approved = bool(
        extraction
        and extraction.receipt_kind == "SYSTEM_GENERATED"
        and extraction.confidence >= 0.75
        and extraction.recommendation == "AUTO_APPROVE_RECEIPT"
        and extraction.policy_status == "COMPLIANT"
    )

    if not receipt_path:
        exp_status = ExpenseStatus.SUBMITTED
        rec_status = ReceiptStatus.NONE
    elif agent_auto_approved:
        exp_status = ExpenseStatus.SUBMITTED
        rec_status = ReceiptStatus.APPROVED
    elif has_proper_taxes:
        # Has taxes → send to Receipt AI Queue for admin review
        exp_status = ExpenseStatus.PENDING_RECEIPT_REVIEW
        rec_status = ReceiptStatus.PENDING
    else:
        # No taxes detected → bypass receipt queue, go straight to expense approval
        exp_status = ExpenseStatus.SUBMITTED
        rec_status = ReceiptStatus.APPROVED

    expense = Expense(
        user_id=current_user.id,
        department_id=current_user.department_id,
        category_id=category.id,
        amount=amount,
        expense_date=expense_date,
        description=description,
        vendor=vendor,
        receipt_path=receipt_path,
        status=exp_status,
        receipt_status=rec_status,
        ai_amount=extraction.amount if extraction else None,
        ai_vendor=extraction.vendor if extraction else None,
        ai_date=extraction.expense_date if extraction else None,
        ai_gst_number=extraction.gst_number if extraction else None,
        ai_tax_amount=extraction.tax_amount if extraction else None,
        ai_confidence=extraction.confidence if extraction else None,
        receipt_kind=extraction.receipt_kind if extraction else None,
        receipt_agent_notes=extraction.notes if extraction else None,
        policy_status=extraction.policy_status if extraction else None,
        budget_impact=extraction.budget_impact if extraction else None,
        recommendation=extraction.recommendation if extraction else None,
        risk_score=extraction.risk_score if extraction else None,
        agent_workflow=expense_document_agent.workflow_json(extraction.workflow_steps) if extraction else None,
    )
    db.add(expense)
    db.commit()
    db.refresh(expense)
    return expense_query(db).filter(Expense.id == expense.id).first()


@router.get("/receipt-queue", response_model=list[ExpenseRead], dependencies=[Depends(require_admin)])
def receipt_queue(db: Session = Depends(get_db)):
    return (
        expense_query(db)
        .filter(Expense.receipt_status == ReceiptStatus.PENDING)
        .order_by(Expense.created_at.asc())
        .all()
    )


@router.get("/{expense_id}/receipt-file")
def get_receipt_file(expense_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    expense = db.get(Expense, expense_id)
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    if current_user.role != Role.ADMIN and expense.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not allowed")
    if not expense.receipt_path:
        raise HTTPException(status_code=404, detail="Receipt not found")

    path = Path(expense.receipt_path)
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404, detail="Receipt file missing")

    media_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    return FileResponse(path, media_type=media_type, filename=path.name)


@router.post("/{expense_id}/receipt-review", response_model=ExpenseRead, dependencies=[Depends(require_admin)])
def review_receipt(expense_id: int, payload: ReceiptApproval, db: Session = Depends(get_db)):
    expense = db.get(Expense, expense_id)
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    if payload.approved:
        expense.receipt_status = ReceiptStatus.APPROVED
        expense.status = ExpenseStatus.SUBMITTED
        expense.rejection_reason = None
    else:
        expense.receipt_status = ReceiptStatus.REJECTED
        expense.status = ExpenseStatus.REJECTED
        expense.rejection_reason = payload.reason or "Receipt rejected by admin"
    db.commit()
    db.refresh(expense)
    return expense_query(db).filter(Expense.id == expense.id).first()


@router.post("/{expense_id}/approval", response_model=ExpenseRead, dependencies=[Depends(require_admin)])
def approve_expense(expense_id: int, payload: ExpenseApproval, db: Session = Depends(get_db)):
    expense = db.get(Expense, expense_id)
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    if expense.receipt_status == ReceiptStatus.PENDING:
        raise HTTPException(status_code=400, detail="Receipt must be reviewed before expense approval")

    expense.status = ExpenseStatus.APPROVED if payload.approved else ExpenseStatus.REJECTED
    expense.rejection_reason = None if payload.approved else (payload.reason or "Rejected by admin")
    db.commit()
    db.refresh(expense)
    if payload.approved:
        budget_service.check_and_alert(db, expense.department_id, period_from_date(expense.expense_date))
    return expense_query(db).filter(Expense.id == expense.id).first()


@router.get("/{expense_id}", response_model=ExpenseRead)
def get_expense(expense_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    expense = expense_query(db).filter(Expense.id == expense_id).first()
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    if current_user.role != Role.ADMIN and expense.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not allowed")
    return expense
