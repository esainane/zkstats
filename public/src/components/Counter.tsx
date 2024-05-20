import { Component, PropTypes } from 'inferno-compat';
import { GroupAll } from 'crossfilter2';

export default class Counter extends Component<{}, {}> {
  static contextTypes = {
    cf: PropTypes.object
  };
  groupAll: GroupAll<any, any>;
  constructor(props: any, context: any) {
    super(props, context);
    this.groupAll = context.cf.groupAll;
  }
  render() {
    const count = this.groupAll.value();
    const total = this.context.cf.internal.size();
    return (<span>{count} / {total}</span>);
  }
}
