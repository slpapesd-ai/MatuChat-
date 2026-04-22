import React, { ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-chrome-100 flex flex-col items-center justify-center p-8 text-center space-y-6">
          <div className="matu-title text-4xl italic">¡Ups! Algo salió mal</div>
          <div className="chrome-card p-6 max-w-md w-full space-y-4">
            <p className="font-bold uppercase text-sm text-red-600">Se ha producido un error en la aplicación.</p>
            <div className="bg-black text-green-500 p-4 rounded-xl text-left font-mono text-xs overflow-auto max-h-40">
              {this.state.error && this.state.error.toString()}
            </div>
            <button 
              onClick={() => {
                localStorage.removeItem('matu_user');
                window.location.reload();
              }}
              className="chrome-button w-full py-3"
            >
              REINICIAR APLICACIÓN
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
