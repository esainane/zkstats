import { Component } from 'inferno';
import { Crossfilter, Dimension, Group, NaturallyOrderedValue } from 'crossfilter2';
import { PropTypes } from 'inferno-compat';
import { CrossfilterContext } from './CrossfilterSystem';

import debounce from '../utils/debounce';

import * as d3_time from 'd3-time';

// Component which covers a single dimension and associated group.
// This is meant to be extended into specific implementations of charts.

interface CrossfilterComponentProps<TRecord, TKey extends NaturallyOrderedValue, TValue> {
  dim: string;
  grouper?: string | number | ((v: TKey) => TKey);
  keyAccessor: (groupResult: any) => TKey;
  valueAccessor: (groupResult: any) => TValue;
  dimensionSelector: (record: TRecord, component: CrossfilterComponent<TRecord, TKey, TValue>) => TKey;
};

/**
 * CrossfilterComponent
 *
 * The crossfilter component wraps a single dimension and group in a
 * crossfilter instance. It is meant to be extended into specific
 * implementations of charts.
 *
 * The component is responsible for creating a dimension and group based on
 * the props provided. The dimension is created by selecting a single key
 * property from the record, and the group is created by grouping the
 * dimension - typically counting the number of records with the relevant
 * key given current filters.
 *
 * By default, the grouping uses the identity function, meaning that the key
 * has to be exactly the same to be grouped together. However, a custom
 * grouper function or value can be provided. A string value can be used to
 * specify a time interval which d3 understands, such as Day or Week, or a
 * number can be used to specify bins of a specific numeric width.
 * For more complicated applications, a custom grouper function can be
 * provided.
 *
 * If the value needs to contain more information than a simple count, the
 * internal crossfilter group can be retrieved by the group property.
 * Calling group.reduce with custom add, remove, and initial functions can
 * be used to create a custom value with rich information.
 * However, you will need to know exactly what you are doing, as well as
 * much about how crossfilter operates internally.
 * See the crossfilter documentation on group.reduce for more information.
 * Most charts will not need this level of customization.
 */
export default class CrossfilterComponent<TRecord, TKey extends NaturallyOrderedValue, TValue, Props extends CrossfilterComponentProps<TRecord, TKey, TValue> = CrossfilterComponentProps<TRecord, TKey, TValue>, State = {}> extends Component<Props, State> {
  static defaultProps: any = {
    keyAccessor: (groupResult: any) => groupResult.key,
    valueAccessor: (groupResult: any) => groupResult.value,
    dimensionSelector: (record, component) => record[component.props.dim as string],
  };
  static contextTypes = {
    cf: PropTypes.object
  };

  cf: CrossfilterContext<TRecord>;
  dimension: Dimension<TRecord, TKey>;
  group: Group<TRecord, TKey, TValue>;

  filterDebouncer: (actFunc: () => any) => void;

  constructor(props: Props, context: any) {
    super(props);
    this.cf = context.cf;

    this.filterDebouncer = debounce(100, true);

    this.initCrossfilter();
  }

  initCrossfilter() {
    const internal: Crossfilter<TRecord> = this.cf.internal;

    this.dimension = internal.dimension<TKey>((record) => this.props.dimensionSelector(record, this));
    this.group = this.createGroup();
  }

  createGroup(): Group<TRecord, TKey, TValue>{
    // If no grouper is specified, use the default (identity function)
    if (!this.props.grouper) {
      return this.dimension.group();
    }
    // If a grouper is specified as a custom function, use it
    if (this.props.grouper instanceof Function) {
      return this.dimension.group(this.props.grouper);
    }
    // If a grouper is specified as a number, assume it is a bin width
    if (typeof this.props.grouper === 'number') {
      // Coerce types a bit. We have to assume that TKey is a number.
      this.checkKeyType('number', 'grouper prop was a number, so attempted to use as a bin width, but TKey is not a number!');
      const g: number = this.props.grouper;
      const grouper = (k: TKey) => (Math.floor(k as number / g) * g) as TKey;
      return this.dimension.group<TKey, TValue>(grouper);
    }
    // If a grouper is specified as a string, assume it is a time grouper
    // and retrieve the appropriate d3 function
    if (typeof this.props.grouper === 'string') {
      // Coerce types a bit. We have to assume that TKey is a Date.
      this.checkKeyType(Date, 'grouper prop was a number, so attempted to use as a bin width, but TKey is not a number!');
      const f = d3_time['time' + this.props.grouper].round;
      const grouper = (k: TKey) => f(k as Date);
      return this.dimension.group<TKey, TValue>(grouper);
    }
    // If the grouper is not a function, number, or string, throw an error
    throw new Error(`Don't know what to do with grouper prop ${this.props.grouper}!`);
  }

  /**
   * Check that the key type is as expected.
   *
   * The supplied type can either be a typeof string, such as 'number', or a
   * constructor function, such as Date.
   *
   * This is meant as a sanity check to catch common mistakes, such as
   * accidentally using a string key as a number, or vice versa, and not
   * as a comprehensive type check.
   */
  checkKeyType(expected: string|Function, error_msg: string = `TKey is not a ${expected}!`) {
    const sampleRecord = this.cf.internal.all()[0];
    if (!sampleRecord) {
      console.warn('No records in crossfilter yet, cannot validate key type. Proceeding anyway!');
      return;
    }
    const sampleKey = this.props.dimensionSelector(sampleRecord, this);
    // Make a one-shot check to guard against foot-shooting.
    // This is not comprehensive - we would need to check every value in
    // the dataset to be sure, and repeat this every time new data is added.
    // However, this should catch the most common mistake.
    if (typeof expected === 'string') {
      if (typeof sampleKey !== expected) {
        throw new Error(error_msg);
      }
    } else {
      if (!(sampleKey instanceof expected)) {
        throw new Error(error_msg);
      }
    }
  }
}


export { CrossfilterComponentProps, CrossfilterComponent };
