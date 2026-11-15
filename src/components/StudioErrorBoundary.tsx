import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface StudioErrorBoundaryProps {
  children: React.ReactNode;
  toolName?: string;
  onResetTool?: () => void;
}

interface StudioErrorBoundaryState {
  hasError: boolean;
  errorMessage: string | null;
}

export class StudioErrorBoundary extends React.Component<
  StudioErrorBoundaryProps,
  StudioErrorBoundaryState
> {
  constructor(props: StudioErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: null };
  }

  static getDerivedStateFromError(error: unknown): StudioErrorBoundaryState {
    const msg = error instanceof Error ? error.message : 'Unexpected rendering error in tool view';
    return { hasError: true, errorMessage: msg };
  }

  override componentDidUpdate(prevProps: StudioErrorBoundaryProps) {
    if (prevProps.toolName !== this.props.toolName && this.state.hasError) {
      this.setState({ hasError: false, errorMessage: null });
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, errorMessage: null });
    this.props.onResetTool?.();
  };

  override render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          className="p-6 m-4 bg-rose-50/90 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 rounded-xl space-y-3 text-xs text-rose-900 dark:text-rose-200"
        >
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-sm">
                {this.props.toolName
                  ? `Could not render "${this.props.toolName}"`
                  : 'Tool Workbench Recovery'}
              </div>
              <p className="mt-1 opacity-90">
                {this.state.errorMessage ||
                  'The active file or parameter state encountered an unexpected format issue.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={this.handleReset}
            className="px-3.5 py-2 bg-rose-600 hover:bg-rose-500 text-white font-semibold rounded-lg inline-flex items-center gap-1.5 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Active Tool State</span>
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
