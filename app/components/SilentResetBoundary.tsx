import React from "react";

/**
 * Catches DOM reconciler errors (removeChild / insertBefore desync on web)
 * and silently resets the subtree instead of crashing.
 */
type State = { hasError: boolean };

export class SilentResetBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidUpdate(_: unknown, prevState: State) {
    if (this.state.hasError && !prevState.hasError) {
      // Use a longer delay to allow in-flight timers to fire and bail out
      // before React re-mounts the children (prevents cascading crash loop)
      setTimeout(() => this.setState({ hasError: false }), 500);
    }
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}
