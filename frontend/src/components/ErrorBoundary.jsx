import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
          <section className="panel max-w-xl p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-coral">Frontend error</p>
            <h1 className="mt-2 text-xl font-bold text-ink">The app could not render.</h1>
            <p className="mt-3 rounded-md bg-slate-50 p-3 text-sm text-slate-700">
              {this.state.error.message}
            </p>
            <button
              className="btn-primary mt-4"
              type="button"
              onClick={() => {
                localStorage.clear();
                window.location.href = "/";
              }}
            >
              Clear session and reload
            </button>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}
