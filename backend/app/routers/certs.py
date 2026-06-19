from datetime import date
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.deps import get_current_user, require_admin
from app.models import CertStatus, CertificationRequest, Expense, ExpenseCategory, ExpenseStatus, Role, User
from app.schemas import CertificationApproval, CertificationRead
from app.services.budget import budget_service, period_from_date
from app.services.certification_ai import SubmittedCertification, certification_proof_analyzer

router = APIRouter(prefix="/certs", tags=["certifications"])
PROOF_ROOT = Path("uploads/receipts")


async def save_proof(file: UploadFile | None) -> str | None:
    if not file or not file.filename:
        return None
    PROOF_ROOT.mkdir(parents=True, exist_ok=True)
    target = PROOF_ROOT / f"cert-{uuid4().hex}{Path(file.filename).suffix}"
    target.write_bytes(await file.read())
    return str(target)


def cert_query(db: Session):
    return db.query(CertificationRequest).options(joinedload(CertificationRequest.user))


@router.get("", response_model=list[CertificationRead])
def list_certifications(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    query = cert_query(db)
    if current_user.role != Role.ADMIN:
        query = query.filter(CertificationRequest.user_id == current_user.id)
    return query.order_by(CertificationRequest.created_at.desc()).all()


@router.post("", response_model=CertificationRead)
async def submit_certification(
    certificate_name: str = Form(...),
    provider: str = Form(...),
    cost: float = Form(...),
    completion_date: date = Form(...),
    proof: UploadFile | None = File(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not current_user.department_id:
        raise HTTPException(status_code=400, detail="User has no department")
    proof_path = await save_proof(proof)
    ai_notes = None
    if proof_path:
        try:
            result = certification_proof_analyzer.analyze(
                proof_path,
                proof.filename if proof else None,
                SubmittedCertification(
                    certificate_name=certificate_name,
                    provider=provider,
                    cost=cost,
                    completion_date=completion_date,
                    employee_name=current_user.full_name,
                ),
            )
            ai_notes = f"[AI] {result.validation_status} | {result.notes}"
        except Exception as exc:
            print(f"[certs] certification AI failed: {exc}")
    request = CertificationRequest(
        user_id=current_user.id,
        department_id=current_user.department_id,
        certificate_name=certificate_name,
        provider=provider,
        cost=cost,
        completion_date=completion_date,
        proof_path=proof_path,
        admin_notes=ai_notes,
    )
    db.add(request)
    db.commit()
    db.refresh(request)
    return cert_query(db).filter(CertificationRequest.id == request.id).first()


@router.post("/{cert_id}/approval", response_model=CertificationRead, dependencies=[Depends(require_admin)])
def approve_certification(cert_id: int, payload: CertificationApproval, db: Session = Depends(get_db)):
    request = db.get(CertificationRequest, cert_id)
    if not request:
        raise HTTPException(status_code=404, detail="Certification request not found")
    if request.status != CertStatus.PENDING:
        raise HTTPException(status_code=400, detail="Request already reviewed")

    request.status = CertStatus.APPROVED if payload.approved else CertStatus.REJECTED
    request.admin_notes = payload.admin_notes

    if payload.approved:
        category = db.query(ExpenseCategory).filter(ExpenseCategory.name == "Certification").first()
        if not category:
            category = ExpenseCategory(name="Certification", description="Approved certification reimbursements")
            db.add(category)
            db.flush()
        expense = Expense(
            user_id=request.user_id,
            department_id=request.department_id,
            category_id=category.id,
            amount=request.cost,
            expense_date=request.completion_date,
            description=f"Certification reimbursement: {request.certificate_name} ({request.provider})",
            vendor=request.provider,
            status=ExpenseStatus.APPROVED,
        )
        db.add(expense)
        db.flush()
        request.created_expense_id = expense.id
        budget_service.check_and_alert(db, expense.department_id, period_from_date(expense.expense_date))

    db.commit()
    db.refresh(request)
    return cert_query(db).filter(CertificationRequest.id == request.id).first()
