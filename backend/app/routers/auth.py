from datetime import datetime, timedelta
import random

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import PasswordHistory, PasswordResetOTP, User
from app.schemas import ChangePasswordRequest, PasswordResetConfirm, PasswordResetRequest, Token, UserRead
from app.security import create_access_token, get_password_hash, verify_password
from app.services.email import email_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User account is inactive")
    token = create_access_token(subject=user.email)
    return {"access_token": token, "token_type": "bearer", "user": user}


@router.get("/me", response_model=UserRead)
def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.post("/change-password")
def change_password(
    payload: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if verify_password(payload.new_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="New password cannot match any of your last 8 passwords")
    history = (
        db.query(PasswordHistory)
        .filter(PasswordHistory.user_id == current_user.id)
        .order_by(PasswordHistory.created_at.desc())
        .limit(7)
        .all()
    )
    for entry in history:
        if verify_password(payload.new_password, entry.hashed_password):
            raise HTTPException(status_code=400, detail="New password cannot match any of your last 8 passwords")
    all_history = (
        db.query(PasswordHistory)
        .filter(PasswordHistory.user_id == current_user.id)
        .order_by(PasswordHistory.created_at.desc())
        .all()
    )
    for old_entry in all_history[6:]:
        db.delete(old_entry)
    db.add(PasswordHistory(user_id=current_user.id, hashed_password=current_user.hashed_password))
    current_user.hashed_password = get_password_hash(payload.new_password)
    current_user.must_change_password = False
    db.commit()
    return {"message": "Password changed successfully"}


@router.post("/password-reset/request")
def request_password_reset(payload: PasswordResetRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    if not user:
        raise HTTPException(status_code=403, detail="You are not an authorized user to do this.")

    code = f"{random.randint(100000, 999999)}"
    db.add(PasswordResetOTP(user_id=user.id, otp_code=code, expires_at=datetime.utcnow() + timedelta(minutes=10)))
    db.commit()
    email_service.send_email(
        [user.email],
        "Expense dashboard password reset OTP",
        f"Your password reset OTP is {code}. It expires in 10 minutes.",
    )
    return {"message": "If the email exists, an OTP has been sent."}


@router.post("/password-reset/confirm")
def confirm_password_reset(payload: PasswordResetConfirm, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    if not user:
        raise HTTPException(status_code=400, detail="Invalid OTP")

    otp = (
        db.query(PasswordResetOTP)
        .filter(
            PasswordResetOTP.user_id == user.id,
            PasswordResetOTP.otp_code == payload.otp_code,
            PasswordResetOTP.used.is_(False),
            PasswordResetOTP.expires_at >= datetime.utcnow(),
        )
        .order_by(PasswordResetOTP.created_at.desc())
        .first()
    )
    if not otp:
        raise HTTPException(status_code=400, detail="Invalid or expired OTP")

    # Block reuse of current password
    if verify_password(payload.new_password, user.hashed_password):
        raise HTTPException(status_code=400, detail="New password cannot match any of your last 8 passwords")

    # Block reuse of last 7 saved passwords (current + 7 history = 8 total)
    history = (
        db.query(PasswordHistory)
        .filter(PasswordHistory.user_id == user.id)
        .order_by(PasswordHistory.created_at.desc())
        .limit(7)
        .all()
    )
    for entry in history:
        if verify_password(payload.new_password, entry.hashed_password):
            raise HTTPException(status_code=400, detail="New password cannot match any of your last 8 passwords")

    # Trim history to 6 entries so that after archiving the current it stays at 7
    all_history = (
        db.query(PasswordHistory)
        .filter(PasswordHistory.user_id == user.id)
        .order_by(PasswordHistory.created_at.desc())
        .all()
    )
    for old_entry in all_history[6:]:
        db.delete(old_entry)

    # Archive the current password before overwriting
    db.add(PasswordHistory(user_id=user.id, hashed_password=user.hashed_password))

    user.hashed_password = get_password_hash(payload.new_password)
    otp.used = True
    db.commit()
    return {"message": "Password reset successfully"}
