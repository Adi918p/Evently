import { Component } from "react";

/**
 * Keeps one broken subtree from taking down the page.
 *
 * Used around the WebGL layer (a lost context or a failed chunk load must not
 * blank the site) and around route content, where `fallback` renders a real
 * recovery path rather than a dead end (error-recovery rule).
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    this.props.onError?.(error, info);
    if (import.meta.env.DEV) console.error("[ErrorBoundary]", error, info);
  }

  reset = () => this.setState({ failed: false });

  render() {
    if (!this.state.failed) return this.props.children;
    const { fallback } = this.props;
    if (typeof fallback === "function") return fallback(this.reset);
    return fallback ?? null;
  }
}
