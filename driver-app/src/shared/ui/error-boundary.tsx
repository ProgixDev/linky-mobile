import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import { logger } from '@/shared/lib/logger';

import { AppText } from './text';
import { Button } from './button';

type Props = { children: ReactNode };
type State = { error: Error | null; stack: string | null };

/**
 * App-level error boundary. A render error in any screen would otherwise close a
 * release build outright (no red box) — here it's caught and shown as a recoverable
 * screen, and the message + component stack are surfaced on-device so a crash can be
 * diagnosed without a logcat. Wrap the router in the root layout.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, stack: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ stack: info.componentStack ?? null });
    logger.error('[error-boundary]', error.message);
  }

  reset = () => this.setState({ error: null, stack: null });

  render() {
    const { error, stack } = this.state;
    if (!error) return this.props.children;
    return (
      <View className="flex-1 bg-surface px-6 pb-8 pt-16" testID="error-boundary">
        <ScrollView
          contentContainerClassName="grow justify-center gap-4"
          showsVerticalScrollIndicator={false}
        >
          <AppText variant="title">Oups — un souci est survenu</AppText>
          <AppText variant="caption" className="text-ink-muted">
            L’écran a rencontré une erreur. Réessaie, ou redémarre l’app.
          </AppText>
          <View className="gap-2 rounded-control bg-surface-muted p-3">
            <AppText variant="caption" className="text-danger" selectable>
              {error.message || 'Erreur inconnue'}
            </AppText>
            {stack ? (
              <AppText variant="caption" className="text-ink-faint" selectable numberOfLines={12}>
                {stack.trim()}
              </AppText>
            ) : null}
          </View>
          <Button testID="error-boundary-reset" label="Réessayer" onPress={this.reset} />
        </ScrollView>
      </View>
    );
  }
}
