from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import inspect, text

from app.core.config import get_settings
from app.database import Base, SessionLocal, engine
from app.routers import admin, auth, budgets, certs, chat, expenses, reports
from app.seed import seed_data

settings = get_settings()

# Built React frontend lives at  backend/static/  after `run.py` builds it
_STATIC_DIR = Path(__file__).resolve().parent.parent / "static"

app = FastAPI(title=settings.app_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        str(settings.frontend_url),
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8080",
        "http://127.0.0.1:8080",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup():
    Base.metadata.create_all(bind=engine)
    ensure_schema()
    db = SessionLocal()
    try:
        seed_data(db)
    finally:
        db.close()


@app.get("/health")
def health():
    return {"status": "ok", "service": settings.app_name}


def ensure_schema():
    inspector = inspect(engine)
    tables = inspector.get_table_names()

    # users table migrations
    if "users" in tables:
        user_cols = {c["name"] for c in inspector.get_columns("users")}
        user_ddl = []
        if "must_change_password" not in user_cols:
            user_ddl.append("ALTER TABLE users ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT FALSE")
        if user_ddl:
            with engine.begin() as conn:
                for stmt in user_ddl:
                    conn.execute(text(stmt))

    if "expenses" not in tables:
        return
    columns = {column["name"] for column in inspector.get_columns("expenses")}
    ddl = []
    if "receipt_kind" not in columns:
        ddl.append("ALTER TABLE expenses ADD COLUMN receipt_kind VARCHAR(40)")
    if "receipt_agent_notes" not in columns:
        ddl.append("ALTER TABLE expenses ADD COLUMN receipt_agent_notes TEXT")
    if "ai_gst_number" not in columns:
        ddl.append("ALTER TABLE expenses ADD COLUMN ai_gst_number VARCHAR(32)")
    if "ai_tax_amount" not in columns:
        ddl.append("ALTER TABLE expenses ADD COLUMN ai_tax_amount FLOAT")
    if "policy_status" not in columns:
        ddl.append("ALTER TABLE expenses ADD COLUMN policy_status VARCHAR(40)")
    if "budget_impact" not in columns:
        ddl.append("ALTER TABLE expenses ADD COLUMN budget_impact VARCHAR(40)")
    if "recommendation" not in columns:
        ddl.append("ALTER TABLE expenses ADD COLUMN recommendation VARCHAR(60)")
    if "risk_score" not in columns:
        ddl.append("ALTER TABLE expenses ADD COLUMN risk_score FLOAT")
    if "agent_workflow" not in columns:
        ddl.append("ALTER TABLE expenses ADD COLUMN agent_workflow TEXT")
    if ddl:
        with engine.begin() as connection:
            for statement in ddl:
                connection.execute(text(statement))


app.include_router(auth.router, prefix="/api")
app.include_router(admin.router, prefix="/api")
app.include_router(expenses.router, prefix="/api")
app.include_router(budgets.router, prefix="/api")
app.include_router(certs.router, prefix="/api")
app.include_router(reports.router, prefix="/api")
app.include_router(chat.router, prefix="/api")

# ── Serve built React frontend ────────────────────────────────────────────────
if _STATIC_DIR.exists():
    app.mount("/assets", StaticFiles(directory=str(_STATIC_DIR / "assets")), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa_fallback(full_path: str):
        # Serve exact file if it exists (favicon, manifest, etc.)
        candidate = _STATIC_DIR / full_path
        if candidate.is_file():
            return FileResponse(str(candidate))
        # All other paths → React's index.html (client-side routing)
        return FileResponse(str(_STATIC_DIR / "index.html"))
