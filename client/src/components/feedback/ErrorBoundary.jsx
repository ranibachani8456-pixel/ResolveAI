import { Component } from "react";

export default class ErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    console.error(`Unexpected frontend rendering failure: ${error?.name || "Error"}`);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="fatal-error">
          <div className="brand-mark">R</div>
          <p className="page-header__eyebrow">ResolveAI</p>
          <h1>We couldn’t display this page</h1>
          <p>Refresh the page to try again. Your backend data has not been changed.</p>
          <button className="button button--primary" onClick={() => window.location.reload()}>Refresh ResolveAI</button>
        </main>
      );
    }
    return this.props.children;
  }
}
