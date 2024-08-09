import { Component, InfernoNode } from 'inferno';

type LoadWaitProps = {
  children?: InfernoNode;
  placeholder?: string | InfernoNode;
  promise: Promise<any>;
};

/**
 * Simple element that displays a loading message until the provided promise
 * resolves, then renders its children.
 */
export class LoadWait extends Component<{}, {resolved: boolean}> {
  props: LoadWaitProps;
  constructor(props: LoadWaitProps) {
    super(props);
    this.props = props;
    this.state = {resolved: false};
  }
  render() {
    const { children, promise } = this.props;
    // If the promise has already resolved, render the children.
    if (this.state?.resolved) {
      return children;
    }

    // Trigger re-render when promise resolves.
    promise.then(() => this.setState({resolved: true}));

    // Return placeholder content.
    let { placeholder } = this.props;
    if (placeholder === undefined) {
      placeholder = (<div>Loading...</div>);
    } else if (typeof placeholder === 'string') {
      placeholder = (<div>{placeholder}</div>);
    }
    return placeholder;
  }
};

export default LoadWait;
