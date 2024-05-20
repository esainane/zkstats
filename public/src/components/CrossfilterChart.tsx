import { InfernoNode, linkEvent } from 'inferno';
import { CrossfilterComponent, CrossfilterComponentProps } from './CrossfilterComponent';

// Common extension of CrossfilterComponent.
// Provides a title, a short description of the active filter, and a button
// to clear the filter.

function handleReset(inst: CrossfilterChart<any, any>) {
  inst.dimension.filterAll();
  inst.cf.system.markDirty();
  console.log('click');
}

interface CrossfilterChartProps extends CrossfilterComponentProps<any, any, any> {
  title?: string;
  filterFormatter: (filter: any, inst: CrossfilterChart<any, any>) => string;
  keyFormatter: (key: any, inst: CrossfilterChart<any, any>) => string;
};

export default class CrossfilterChart<Props extends CrossfilterChartProps, State> extends CrossfilterComponent<any, any, any, Props, State> {
  // Provide default props to format the filter and value.
  static defaultProps = {
    ...CrossfilterComponent.defaultProps,
    filterFormatter: (filter, inst) => {
      if (!(filter instanceof Array && filter.length === 2)) {
        return filter;
      }
      const { keyFormatter } = inst.props;
      const [start, end] = filter;
      return `${keyFormatter(start, inst)} to ${keyFormatter(end, inst)}`;
    },
    keyFormatter: (key, inst) => `${key}`,
  };
  // Render a common chart container. Provides a consistent title, filter
  // information, and a button to clear the filter.
  render() {
    const currentFilter = this.dimension.currentFilter();
    return (
    <div class={[
      'chart', ...(currentFilter === undefined ? [] : ['filtered'])
    ].join(' ')}>
      <h3>{this.props.title}</h3>
      <p>
        <a onclick={ linkEvent(this, handleReset )}>Clear Filter</a>:
        <span class="filterinfo">
          {this.props.filterFormatter(currentFilter, this)}
        </span>
      </p>
      {this.renderChart()}
    </div>);
  }

  // Subclasses should implement this method to render the actual chart.
  renderChart(): InfernoNode {
    const name = this.constructor.name;
    throw new Error(`renderChart should be implemented by ${name}!`);
  }
};
export { CrossfilterChart, CrossfilterChartProps };
