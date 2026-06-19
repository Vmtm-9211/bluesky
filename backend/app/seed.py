from sqlalchemy.orm import Session

from app.models import Budget, Department, ExpenseCategory, Role, User
from app.security import get_password_hash


def seed_data(db: Session) -> None:
    if db.query(User).first():
        return

    engineering = Department(name="Engineering", head_name="Priya Rao", head_email="engineering.head@bilvantis.com")
    finance = Department(name="Finance", head_name="Finance Admin", head_email="admin@bilvantis.com")
    hr = Department(name="HR", head_name="Meera Shah", head_email="hr.head@bilvantis.com")
    db.add_all([engineering, finance, hr])
    db.flush()

    categories = [
        ExpenseCategory(name="Travel", description="Flights, cabs, hotels, and commute"),
        ExpenseCategory(name="Meals", description="Client and business meals"),
        ExpenseCategory(name="Software", description="Tools, SaaS, and licenses"),
        ExpenseCategory(name="Office Supplies", description="Stationery, devices, and office needs"),
        ExpenseCategory(name="Certification", description="Approved certification reimbursements"),
    ]
    db.add_all(categories)

    admin = User(
        email="admin@bilvantis.com",
        full_name="Bilvantis Finance Admin",
        hashed_password=get_password_hash("Admin@123"),
        role=Role.ADMIN,
        department_id=finance.id,
    )
    employee = User(
        email="employee@bilvantis.com",
        full_name="Demo Employee",
        hashed_password=get_password_hash("User@123"),
        role=Role.USER,
        department_id=engineering.id,
    )
    db.add_all([admin, employee])

    db.add_all(
        [
            Budget(department_id=engineering.id, period="2026-06", amount=250000, threshold_percent=90),
            Budget(department_id=finance.id, period="2026-06", amount=100000, threshold_percent=90),
            Budget(department_id=hr.id, period="2026-06", amount=120000, threshold_percent=90),
        ]
    )
    db.commit()
