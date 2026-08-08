/**
 * CineLog — top-level error boundary.
 *
 * Error boundaries have to be class components: React only exposes
 * `getDerivedStateFromError` / `componentDidCatch` through lifecycle methods.
 * https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary
 */

import React, { Component, type PropsWithChildren } from "react";
import { StyleSheet, View } from "react-native";

import { ErrorState } from "@/components/ui/States";
import { COLORS } from "@/constants/theme";

type ErrorBoundaryState = { error: Error | null };

export class ErrorBoundary extends Component<
  PropsWithChildren,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error): void {
    if (__DEV__) console.error("[cinelog] unhandled render error", error);
  }

  private reset = (): void => {
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <View style={styles.root}>
        <ErrorState
          title="CineLog hit a snag"
          message="Something unexpected happened while rendering this screen. Reloading usually fixes it."
          onRetry={this.reset}
        />
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.background,
  },
});
