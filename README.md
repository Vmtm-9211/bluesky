# Company Expense Tracking Dashboard

Full-stack hackathon MVP for centralized company expense tracking with admin/user portals, role-based access, budget alerts, receipt analysis workflow, certification reimbursements, and reporting.

## Stack

- Frontend: React, Tailwind CSS, Recharts, Axios
- Backend: FastAPI, SQLAlchemy, Pydantic, JWT auth
- Database: SQLite locally, PostgreSQL/Cloud SQL via `DATABASE_URL`
- AI extension point: Vertex AI receipt analyzer service
- Notifications: SMTP/SendGrid-compatible email service

## Quick Start

### Backend

```bash
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload --port 8000
```

The API seeds demo users on first run:

- Admin: `admin@bilvantis.com` / `Admin@123`
- User: `employee@bilvantis.com` / `User@123`

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open the Vite URL shown in the terminal. The frontend expects the backend at `http://localhost:8000` unless `VITE_API_BASE_URL` is set.

## Key API Areas

- `/api/auth`: login, current user, password reset OTP flow
- `/api/admin`: departments and users
- `/api/expenses`: expense CRUD, receipt analysis queue, admin approvals
- `/api/budgets`: department budgets and thresholds
- `/api/certs`: certification reimbursement workflow
- `/api/reports`: organization, department, category, and monthly summaries

## Cloud Notes

- Set `DATABASE_URL` to a Cloud SQL PostgreSQL connection string.
- Set SMTP or SendGrid SMTP values in backend `.env` for budget-breach emails.
- Replace the local analyzer implementation in `backend/app/services/ai.py` with Vertex AI Vision/Document AI calls when GCP credentials are available.
- Use Cloud Scheduler for database export jobs and Cloud Build for CI/CD.
