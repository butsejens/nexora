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
      // Reset after one frame so React can flush and re-mount cleanly
      setTimeout(() => this.setState({ hasError: false }), 80);
    }
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}
