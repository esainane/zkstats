import crossfilter, { NaturallyOrderedValue }  from 'crossfilter2';
import { Crossfilter, Dimension, GroupAll } from 'crossfilter2';
import { Component, InfernoNode } from 'inferno';
import { PropTypes } from 'inferno-compat';

type DefaultGroupValue<TKey extends NaturallyOrderedValue> = {
  key: TKey;
  value: number;
}

type CrossfilterProps<TRecord> = {
  children?: InfernoNode;
  data: TRecord[] | Promise<TRecord[]>;
};

export type CrossfilterContext<TRecord> = {
  internal: Crossfilter<TRecord>;
  dims: Map<string, Dimension<TRecord, any>>;
  groupAll: GroupAll<TRecord, any>;
  system: CrossfilterSystem<TRecord>;
};

export type CrossfilterListener = {
  update: () => void;
};

/**
 * CrossfilterSystem
 *
 * The CrossfilterSystem is a thin component that wraps the crossfilter
 * library. It also serves as the coordinator for the system of coordinated
 * views.
 * Charts which require crossfilter data will find it from the first parent
 * CrossfilterSystem component.
 */
export default class CrossfilterSystem<TRecord> extends Component<CrossfilterProps<TRecord>,  CrossfilterContext<TRecord>> {
  data: TRecord[];
  cf: CrossfilterContext<TRecord>;
  listeners: CrossfilterListener[];

  static childContextTypes = {
    cf: PropTypes.object
  };

  constructor(props: CrossfilterProps<TRecord>) {
    super(props);
    this.props = props;
    // We are either provided the data explicitly, or given a promise that
    // will resolve to it later.
    if (props.data instanceof Promise) {
      // In the case of a Promise, we'll add the data once it resolves,
      // and use an empty array for now.
      const promise: Promise<TRecord[]> = props.data as Promise<TRecord[]>;
      this.data = [];
      promise.then((data) => {
        this.addData(data);
      });
    } else {
      // Otherwise, given an explicit array, we'll use that.
      const arr: TRecord[] = props.data as TRecord[];
      this.data = arr;
    }
    const internal = crossfilter(this.data);
    this.state = this.cf = {
      internal: internal,
      dims: new Map(),
      groupAll: internal.groupAll(),
      system: this
    };
    // testing
    // add another record after 1 second
    // setTimeout(() => {
    //   this.addData([this.data[0]]);
    // }, 1000);
  }

  registerListener(func: () => void): CrossfilterListener {
    const listener = {update: func};
    this.listeners.push(listener);
    return listener;
  }

  removeListener(listener: CrossfilterListener): void {
    const index = this.listeners.indexOf(listener);
    if (index !== -1) {
      this.listeners.splice(index, 1);
    }
  }

  getChildContext() {
    return { cf: this.state };
  }

  addData(newData: TRecord[]): void {
    this.data.push(...newData);
    this.cf.internal.add(newData);
    this.setState(this.cf);
  }

  markDirty(): void {
    this.setState(this.cf);
  }

  render() {
    return this.props.children;
  }
};

export { CrossfilterSystem, DefaultGroupValue };
