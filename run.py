#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Start the Expense Dashboard locally - no Docker, no manual Node install needed.

  python run.py           - first run builds everything; subsequent runs just start the server
  python run.py --rebuild - force-rebuild the React frontend
  python run.py --install - force-reinstall all Python + Node packages

Everything is self-contained:
  * Python packages  -> installed via pip into your current Python environment
  * Node.js          -> downloaded once into  node_env/  (via nodeenv, a pip package)
  * React build      -> built once into       backend/static/
  * Database         -> backend/expense_dashboard.db  (SQLite, auto-created on first run)

After the first run the app is at  http://localhost:8080
"""
import os
import shutil
import subprocess
import sys
import threading
import time
import webbrowser
from pathlib import Path

# Force UTF-8 output on Windows to avoid encoding errors
if sys.platform == "win32":
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

ROOT = Path(__file__).parent.resolve()
BACKEND = ROOT / "backend"
FRONTEND = ROOT / "frontend"
NODE_ENV = ROOT / "node_env"      # nodeenv installs Node.js here
STATIC_DIR = BACKEND / "static"  # built React files land here
PORT = 8080

IS_WIN = sys.platform == "win32"

# Paths inside node_env created by nodeenv
_BIN = NODE_ENV / ("Scripts" if IS_WIN else "bin")
NPM = _BIN / ("npm.cmd" if IS_WIN else "npm")
NODE = _BIN / ("node.exe" if IS_WIN else "node")


# ── helpers ───────────────────────────────────────────────────────────────────

def say(msg):
    print(msg, flush=True)


def node_env_vars():
    """Return an env dict that includes node_env/Scripts (or bin) on PATH."""
    env = os.environ.copy()
    bin_dir = str(_BIN)
    path = env.get("PATH", "")
    if bin_dir not in path:
        env["PATH"] = bin_dir + os.pathsep + path
    return env


def run_check(cmd, cwd=None, env=None, **kw):
    """Run a command; raise CalledProcessError on failure."""
    subprocess.check_call(cmd, cwd=cwd, env=env or os.environ.copy(), **kw)


# ── step 1: Python packages ───────────────────────────────────────────────────

def pip_ok():
    try:
        import uvicorn, fastapi, sqlalchemy, nodeenv  # noqa: F401
        return True
    except ImportError:
        return False


def ensure_pip():
    say("\n[1/4] Installing Python packages ...")
    run_check([sys.executable, "-m", "pip", "install", "-r",
               str(BACKEND / "requirements.txt")])
    say("      [OK] Python packages ready.")


# ── step 2: Node.js via nodeenv ───────────────────────────────────────────────

def node_ok():
    return NODE.exists()


def ensure_node():
    say("\n[2/4] Bootstrapping Node.js (one-time download, ~2 min) ...")
    run_check([sys.executable, "-m", "nodeenv",
               "--node=lts", "--prebuilt", str(NODE_ENV)])
    say("      [OK] Node.js ready.")


# ── step 3: npm install + build ───────────────────────────────────────────────

def frontend_built():
    return (STATIC_DIR / "index.html").exists()


def ensure_frontend(force=False):
    if not force and frontend_built():
        return

    say("\n[3/4] Building React frontend ...")

    # node_env/Scripts must be on PATH so npm post-install scripts can call 'node'
    nenv = node_env_vars()

    node_modules = FRONTEND / "node_modules"
    if force or not node_modules.exists():
        say("      -> npm install ...")
        run_check([str(NPM), "install"], cwd=FRONTEND, env=nenv)

    # API calls go to /api on the same origin as the backend
    (FRONTEND / ".env.production").write_text(
        "VITE_API_BASE_URL=/api\nVITE_USD_RATE=83\n", encoding="utf-8"
    )

    say("      -> npm run build ...")
    run_check([str(NPM), "run", "build"], cwd=FRONTEND, env=nenv)

    # Copy dist/ -> backend/static/
    dist = FRONTEND / "dist"
    if STATIC_DIR.exists():
        shutil.rmtree(STATIC_DIR)
    shutil.copytree(dist, STATIC_DIR)
    say("      [OK] Frontend built -> " + str(STATIC_DIR))


# ── step 4: start backend ─────────────────────────────────────────────────────

def start_backend():
    say("\n[4/4] Starting backend on http://localhost:" + str(PORT) + " ...")
    return subprocess.Popen(
        [sys.executable, "-m", "uvicorn",
         "app.main:app",
         "--host", "0.0.0.0",
         "--port", str(PORT),
         "--reload"],
        cwd=BACKEND,
    )


# ── entry point ───────────────────────────────────────────────────────────────

def main():
    force_install = "--install" in sys.argv or "--fresh" in sys.argv
    force_rebuild = "--rebuild" in sys.argv or force_install

    print()
    print("=" * 54)
    print("  Expense Dashboard - Local Startup")
    print("=" * 54)

    # Step 1: Python packages
    if force_install or not pip_ok():
        ensure_pip()
    else:
        say("\n[1/4] Python packages ... [OK] already installed")

    # Step 2: Node.js
    if force_install or not node_ok():
        ensure_node()
    else:
        say("[2/4] Node.js        ... [OK] already installed")

    # Step 3: React build
    if force_rebuild or not frontend_built():
        ensure_frontend(force=force_rebuild)
    else:
        say("[3/4] React frontend ... [OK] already built")

    # Step 4: Backend server
    backend_proc = start_backend()

    def _open_browser():
        time.sleep(5)
        webbrowser.open("http://localhost:" + str(PORT))

    threading.Thread(target=_open_browser, daemon=True).start()

    say("")
    say("  App running!")
    say("")
    say("    App      ->  http://localhost:" + str(PORT))
    say("    API docs ->  http://localhost:" + str(PORT) + "/docs")
    say("")
    say("    Login credentials:")
    say("      Admin     ->  admin@bilvantis.com    /  Admin@123")
    say("      Employee  ->  employee@bilvantis.com /  User@123")
    say("")
    say("    Database  ->  backend/expense_dashboard.db  (SQLite)")
    say("")
    say("    Press Ctrl+C to stop.")
    say("    To rebuild frontend: python run.py --rebuild")
    say("")

    try:
        while True:
            if backend_proc.poll() is not None:
                say("\n[ERROR] Backend stopped unexpectedly. Check the output above.")
                sys.exit(1)
            time.sleep(2)
    except KeyboardInterrupt:
        say("\nStopping ...")
        backend_proc.terminate()
        try:
            backend_proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            backend_proc.kill()
        say("Stopped. Goodbye!")


if __name__ == "__main__":
    main()
