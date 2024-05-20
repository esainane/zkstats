
import { Group, NaturallyOrderedValue } from 'crossfilter2';
import CrossfilterComponent, { CrossfilterComponentProps } from './CrossfilterComponent';

// RecordList always uses a number as the TValue.
// It's aliased to TValue for consistency with other components.
type TValue = number;

interface RecordListProps<TRecord, TKey extends NaturallyOrderedValue> extends CrossfilterComponentProps<TRecord, TKey, TValue> {
  limit?: number;
  linkFormat: (key: TKey) => string;
}


/**
 * RecordList component
 *
 * The crossfilter component is a thin component that wraps the crossfilter
 * library. Charts which require crossfilter data will find it from the first
 * parent Crossfilter component.
 *
 * Crossfilter dimension/group properties:
 * - TKey can be any naturally ordered value, such as a name or ID.
 * - TValue is always a number, representing the count of records with the key.
 *   This is designed to be 0 or 1, but this is technically not required.
 */
class RecordList<TRecord, TKey extends NaturallyOrderedValue> extends CrossfilterComponent<TRecord, TKey, TValue, RecordListProps<TRecord, TKey>> {
  static defaultProps = {
    ...CrossfilterComponent.defaultProps,
  };

  constructor(props: any, context: any) {
    super(props, context);
  }

  render() {
    console.log('RecordList render', this.cf.internal.size(), this.group.all(), this.group.top(Infinity), this.dimension.top(Infinity));
    let data: TRecord[];
    if (this.props.limit) {
      data = this.dimension.top(this.props.limit);
    } else {
      data = this.dimension.top(Infinity);
    }
    return (<ul>
      {data.map((record) => {
        const key = this.props.dimensionSelector(record, this);
        return (<li key={key as string}>
          <a href={this.props.linkFormat(key)}>{key}</a>
        </li>);
      })}
    </ul>);
  }

  createGroup(): Group<TRecord, TKey, TValue> {
    console.log('createGroup');
    return super.createGroup();
  }
};

export default RecordList;
export { RecordList, RecordListProps };
