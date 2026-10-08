import { Component, type ReactNode } from "react";

export type ErrorBoundaryProps = {
    /** The content that shows instead of the children after an error. `reset` renders the children again. */
    fallback : (error : Error, reset : () => void) => ReactNode;
    /** When this value changes, the boundary clears the error (for example, a new page path). */
    resetKey? : unknown;
    children : ReactNode;
};

type State = { error : Error | undefined; resetKey : unknown };

/** This component stops a render error in one part of the page, so that the rest of the page stays usable. */
export class ErrorBoundary extends Component<ErrorBoundaryProps, State> {
    override state : State = { error : undefined, resetKey : this.props.resetKey };

    static getDerivedStateFromError(error : unknown) : Partial<State> {
        return { error : error instanceof Error ? error : new Error(String(error)) };
    }

    static getDerivedStateFromProps(props : ErrorBoundaryProps, state : State) : Partial<State> | null {
        if (props.resetKey !== state.resetKey) return { error : undefined, resetKey : props.resetKey };
        return null;
    }

    private readonly reset = () : void => {
        this.setState({ error : undefined });
    };

    override render() : ReactNode {
        return this.state.error ? this.props.fallback(this.state.error, this.reset) : this.props.children;
    }
}
