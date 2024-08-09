import { NaturallyOrderedValue } from "crossfilter2";
import { CrossfilterChart, CrossfilterChartProps } from "./CrossfilterChart";
import { DefaultGroupValue } from "./CrossfilterSystem";

// Get axis labelling from d3
import * as d3_brush from 'd3-brush';
import * as d3_scale from 'd3-scale';
import * as d3_selection from 'd3-selection';
import * as d3_time from 'd3-time';

interface BarChartProps<TKey extends NaturallyOrderedValue> extends CrossfilterChartProps {
  titleFunc: (d: DefaultGroupValue<TKey>) => string;
  marginLeft: number;
  marginRight: number;
  marginTop: number;
  marginBottom: number;
  width: number;
  height: number;
  emptyKey: TKey;
}

class BarChart<TKey extends NaturallyOrderedValue> extends CrossfilterChart<BarChartProps<TKey>, any> {
  static defaultProps = {
    ...CrossfilterChart.defaultProps,

    marginLeft: 60,
    marginRight: 18,
    marginTop: 5,
    marginBottom: 60,
    width: 960,
    height: 130,

    // In practice, DefaultGroupValue<TKey>, but we can't reference TKey in
    // the static context where we set defaultProps.
    titleFunc: (d: DefaultGroupValue<any>) => `${d.key}: ${d.value}`,
    emptyKey: 0,
  };

  brushNode: SVGGElement | null;
  brush: d3_brush.BrushBehavior<any>;

  minX: TKey;
  maxX: TKey;

  xScale: d3_scale.ScaleLinear<number, number> | d3_scale.ScaleTime<number, number>;
  yScale: d3_scale.ScaleLinear<number, number>;

  constructor(props: any, context: any) {
    super(props, context);

    // Create our d3 brush instance.
    // The brush is responsible for much of the interaction with the chart.
    // We specify the brush extent later, once we render and perform prop
    // based calculations.
    // We attach the brush to a DOM object even later, in componentDidMount
    // and componentDidUpdate, once Inferno has a real brower DOM object
    // available.
    this.brush = d3_brush.brushX()
      .on('start brush end', this._brushing.bind(this));
  }

  _brushIsEmpty(selection: [TKey, TKey] | null) {
    return !selection || selection[1] <= selection[0];
  };

  _brushing(event: d3_brush.D3BrushEvent<any>) {
    if (!event.sourceEvent) return; // Only transition after input.
    if (!event.selection) return; // Ignore empty selections.
    const s = event.selection;
    // Turn this selection into a filter
    const filter = s.map(this.xScale.invert);

    // Update the filter, eventually. Either immediately, if it hasn't
    // happened recently, or after the debounce period otherwise.
    this.filterDebouncer(() => {
      console.log('filtering', this.props.title, s, filter);
      // Notify crossfilter internals
      if (this._brushIsEmpty(filter)) {
        this.dimension.filterAll();
      } else {
        this.dimension.filter(filter);
      }
      // Have the parent CrossfilterSystem update all listeners
      // FIXME: This is somewhat excessive
      this.cf.system.markDirty();
    });
  }

  _nextBinX(key: TKey) {
    const { grouper } = this.props;
    if (typeof grouper === 'string') {
      // If the grouper is a string, we're using a time grouper.
      // We need to add a time unit to our key to get the end.
      return d3_time['time' + grouper].offset(key as Date, 1);
    } else if (typeof grouper === 'number') {
      // If the grouper is a number, we're using a bin width.
      // We can just add the bin width to our key to get the end.
      return key as number + grouper;
    }
    return key as number + 1;
  }

  _getDataBounds(data: DefaultGroupValue<TKey>[]) {
    const { dimensionSelector, valueAccessor, dim, emptyKey } = this.props;
    const isDate = emptyKey instanceof Date;
    // If there's no data, we can't determine the bounds.
    // Do what we can and we'll come back when we have actual data.
    if (!this.cf.internal.all().length) {
      return { minX: emptyKey, maxX: emptyKey, maxY: 0, isDate };
    }

    // Determine the bounds of the data.
    // We want bounds to be "sticky" - they should only extend, never shrink.
    const curLowest = this.dimension.bottom(1)[0];
    const minX = curLowest === undefined ? this.minX : dimensionSelector(curLowest, this);
    // If we have a new minimum, update it.
    if (!(curLowest === undefined || minX >= this.minX)) {
      this.minX = minX;
    }
    const curHighest = this.dimension.top(1)[0];
    const maxX = curHighest === undefined ? this.maxX : dimensionSelector(curHighest, this);
    // If we have a new maximum, update it.
    if (!(curHighest === undefined || maxX <= this.maxX)) {
      this.maxX = maxX;
    }
    // Work out what the next X point would be.
    // This is to be used for working out what the drawn bounds of the chart
    // should be, and to make sure that the chart's end exceeds the data's end.
    const nextX = this._nextBinX(this.maxX);

    // Work out what the maximum Y value is.
    const maxY = Math.max(...data.map(valueAccessor), 0);

    if (!(emptyKey instanceof Date) && dim === 'started') {
      throw new Error('BarChart: Non-date key provided for time grouper. Please provide a Date key.');
    }

    // Determine if the key is a Date. We need a different scale if so.
    return { minX: this.minX || 0, maxX: this.maxX || 0, nextX, maxY, isDate };
  }

  _isBarIntersecting(d: DefaultGroupValue<TKey>): boolean {
    // Determine if the current filter intersects with the current bar.
    const currentFilter = this.dimension.currentFilter();
    if (!currentFilter) {
      // No filter, everything is available.
      return true;
    }
    const { keyAccessor, grouper } = this.props;
    // We have a set filter. Bar charts are always range filters.
    // Note that crossfilter always returns a range filter as an array of
    // two values, [start, end], where end is exclusive.
    const [min, max] = currentFilter as [TKey, TKey];

    // Get our current key.
    const key = keyAccessor(d);
    if (!grouper) {
      // If there's no grouper, key values are atomic.
      return key >= min && key < max;
    }
    // If there is a grouper, we need to work out where our current bar
    // ends.
    let keyEnd;
    if (typeof grouper === 'string') {
      // If the grouper is a string, we're using a time grouper.
      // We need to add a time unit to our key to get the end.
      keyEnd = d3_time['time' + grouper].offset(key as Date, 1);
    } else if (typeof grouper === 'number') {
      // If the grouper is a number, we're using a bin width.
      // We can just add the bin width to our key to get the end.
      keyEnd = key as number + grouper;
    } else {
      // Otherwise, if we were given a custom function... all bets are off.
      // We can't know what the end is.
      // Treat the key as atomic.
      // FIXME: Provide a mechanism for the caller to compute the end, and
      // throw an error if it isn't provided to a BarChart in this situation
      console.warn('BarChart: Custom grouper function provided, but no end key can be computed. Treating key as atomic.');
      return key >= min && key < max;
    }
    // If any part of the bar intersects with the filter, we're intersecting.
    return key < max && keyEnd > min;
  }

  _newScale(isDate = false) {
    if (isDate) {
      return d3_scale.scaleTime();
    }
    return d3_scale.scaleLinear();
  }

  renderChart() {
    console.log('BarChart render', this.cf.internal.size(), this.group.all());

    const data = this.group.all() as DefaultGroupValue<TKey>[];
    const { minX, nextX, maxY, isDate } = this._getDataBounds(data);

    const {
      children,
      width, height,
      marginLeft, marginRight, marginTop, marginBottom,
      keyAccessor, valueAccessor,
      titleFunc,
      keyFormatter,
    } = this.props;
    const clipWidth = width - marginLeft - marginRight;
    const clipHeight = height - marginBottom;// - marginTop;
    console.log(marginTop);

    // Generate/update our scales.
    const x = this.xScale || (this.xScale = this._newScale(isDate));
    x
      .domain([minX, nextX])
      .range([0, clipWidth]);

    const y = this.yScale || (this.yScale = this._newScale());
    y
      .domain([0, Math.max(1, maxY)])
      .range([0, clipHeight]);

    console.log('y scale for', this.props.title, y.domain(), y.range());

    // With props computed, we can now tell the brush what its active area is.
    this.brush.extent([[0, 0], [clipWidth, clipHeight]]);

    // Render chart
    // If the invisible brush overlay is on top, the bars won't be able to
    // show their title text, as the brush overlay will intercept the mouse
    // events.
    // However, if the invisible brush overlay is behind the bars, we won't be
    // able to use the brush except between the bars.
    // FIXME: This means we currently can't view title text.
    return (
      <svg width={width} height={height}>
        <g transform={`translate(${marginLeft},${marginTop})`}>
          <g class="grid-line horizontal" />
          <g class="chart-body" clip-path="url(#clip)">
            {data.map((d, i) => {
              const key = keyAccessor(d);
              return (<rect
                key={i}
                x={x(key)}
                y={clipHeight - y(valueAccessor(d))}
                width={x(this._nextBinX(key)) - x(key)}
                height={y(valueAccessor(d))}
                fill={this._isBarIntersecting(d) ? "steelblue" : "gray"}
              >
                <title>{titleFunc(d)}</title>
              </rect>);
            })}
          </g>
          <g class="axis x" transform={`translate(0,${clipHeight})`}>
            <line class="domain" x2={clipWidth} />
            {x.ticks(5).map((tick, i) => (
              <g key={i} class="tick" transform={`translate(${x(tick)},0)`}>
                <line y2={6} />
                <text y={9}>{keyFormatter(tick, this)}</text>
              </g>
            ))}
          </g>
          <g class="axis y">
            <line class="domain" y2={clipHeight} />
            {y.ticks(5).map((tick, i) => (
              <g key={i} class="tick" transform={`translate(0,${clipHeight - y(tick)})`}>
                <line x1={-6} />
                <text x={-9}>{tick}</text>
              </g>
            ))}
          </g>
          {children}
          <g class="brush" ref={node => this.brushNode = node} />
        </g>
        <defs>
          <clipPath id="clip">
            <rect width={clipWidth} height={clipHeight}></rect>
          </clipPath>
        </defs>
      </svg>
    );
  }

  componentDidMount() {
    // DOM elements have been rendered, so we can now attach the brush
    const brushG = d3_selection.select(this.brushNode);
    brushG.call(this.brush);
  }

  componentDidUpdate() {
    const clipG = d3_selection.select(this.brushNode);
    clipG.call(this.brush);
    // Check to see if the filter was cleared externally.
    // If so, we need to remove the brush.
    if (!this.dimension.currentFilter()) {
      this.brush.move(clipG, null);
    }
  }
}

export default BarChart;
export { BarChart };
