/* Matchups chart: Colour dimensions by favouredness, and size columns by popularity. This allows a quick review of a metagame subject to active filters. */
function matchupChart(parent, chartGroup) {
    "use strict";

    var DEFAULT_BORDER_RADIUS = 6.75;

    var _chartBody;

    var _cols;
    var _rows;
    var _colOrdering = d3.ascending;
    var _rowOrdering = d3.ascending;
    var _colScale = d3.scaleBand();
    var _rowScale = d3.scaleBand();

    var _xBorderRadius = DEFAULT_BORDER_RADIUS;
    var _yBorderRadius = DEFAULT_BORDER_RADIUS;

    var _chart = dc.colorMixin(dc.marginMixin(dc.baseMixin({})));
    _chart._mandatoryAttributes(['group']);
    _chart.title(_chart.colorAccessor());

    var _colsLabel = function (d) {
        return d;
    };
    var _rowsLabel = function (d) {
        return d;
    };

    /**
     * Set or get the column label function. The chart class uses this function to render
     * column labels on the X axis. It is passed the column name.
     * @method colsLabel
     * @memberof dc.heatMap
     * @instance
     * @example
     * // the default label function just returns the name
     * chart.colsLabel(function(d) { return d; });
     * @param  {Function} [labelFunction=function(d) { return d; }]
     * @returns {Function|dc.heatMap}
     */
    _chart.colsLabel = function (labelFunction) {
        if (!arguments.length) {
            return _colsLabel;
        }
        _colsLabel = labelFunction;
        return _chart;
    };

    /**
     * Set or get the row label function. The chart class uses this function to render
     * row labels on the Y axis. It is passed the row name.
     * @method rowsLabel
     * @memberof dc.heatMap
     * @instance
     * @example
     * // the default label function just returns the name
     * chart.rowsLabel(function(d) { return d; });
     * @param  {Function} [labelFunction=function(d) { return d; }]
     * @returns {Function|dc.heatMap}
     */
    _chart.rowsLabel = function (labelFunction) {
        if (!arguments.length) {
            return _rowsLabel;
        }
        _rowsLabel = labelFunction;
        return _chart;
    };

    var _xAxisOnClick = function (d) { filterAxis(0, d); };
    var _yAxisOnClick = function (d) { filterAxis(1, d); };
    var _boxOnClick = function (d) {
        var filter = d.key;
        dc.events.trigger(function () {
            _chart.filter(dc.filters.TwoDimensionalFilter(filter.slice().sort()));
            _chart.redrawGroup();
        });
    };

    function filterAxis (axis, value) {
        var cellsOnAxis = _chart.selectAll('.box-group').filter(function (d) {
            return d.key[axis] === value;
        });
        var unfilteredCellsOnAxis = cellsOnAxis.filter(function (d) {
            return !_chart.hasFilter(d.key.slice().sort());
        });
        dc.events.trigger(function () {
            var selection = unfilteredCellsOnAxis.empty() ? cellsOnAxis : unfilteredCellsOnAxis;
            var filters = selection.data().map(function (kv) {
                return dc.filters.TwoDimensionalFilter(kv.key.slice().sort());
            });
            _chart.filter([filters]);
            _chart.redrawGroup();
        });
    }

    var nonstandardFilter = dc.logger.deprecate(function (filter) {
        return _chart._filter(dc.filters.TwoDimensionalFilter(filter));
    }, 'heatmap.filter taking a coordinate is deprecated - please pass dc.filters.TwoDimensionalFilter instead');
    dc.override(_chart, 'filter', function (filter) {
        if (!arguments.length) {
            return _chart._filter();
        }
        if (filter !== null && filter.filterType !== 'TwoDimensionalFilter' &&
           !(Array.isArray(filter) && Array.isArray(filter[0]) && filter[0][0].filterType === 'TwoDimensionalFilter')) {
            return nonstandardFilter(filter);
        }
        return _chart._filter(filter);
    });

    /**
     * Gets or sets the values used to create the rows of the heatmap, as an array. By default, all
     * the values will be fetched from the data using the value accessor.
     * @method rows
     * @memberof dc.heatMap
     * @instance
     * @param  {Array<String|Number>} [rows]
     * @returns {Array<String|Number>|dc.heatMap}
     */

    _chart.rows = function (rows) {
        if (!arguments.length) {
            return _rows;
        }
        _rows = rows;
        return _chart;
    };

    /**
     * Get or set a comparator to order the rows.
     * Default is {@link https://github.com/d3/d3-array#ascending d3.ascending}.
     * @method rowOrdering
     * @memberof dc.heatMap
     * @instance
     * @param  {Function} [rowOrdering]
     * @returns {Function|dc.heatMap}
     */
    _chart.rowOrdering = function (rowOrdering) {
        if (!arguments.length) {
            return _rowOrdering;
        }
        _rowOrdering = rowOrdering;
        return _chart;
    };

    /**
     * Gets or sets the keys used to create the columns of the heatmap, as an array. By default, all
     * the values will be fetched from the data using the key accessor.
     * @method cols
     * @memberof dc.heatMap
     * @instance
     * @param  {Array<String|Number>} [cols]
     * @returns {Array<String|Number>|dc.heatMap}
     */
    _chart.cols = function (cols) {
        if (!arguments.length) {
            return _cols;
        }
        _cols = cols;
        return _chart;
    };

    /**
     * Get or set a comparator to order the columns.
     * Default is  {@link https://github.com/d3/d3-array#ascending d3.ascending}.
     * @method colOrdering
     * @memberof dc.heatMap
     * @instance
     * @param  {Function} [colOrdering]
     * @returns {Function|dc.heatMap}
     */
    _chart.colOrdering = function (colOrdering) {
        if (!arguments.length) {
            return _colOrdering;
        }
        _colOrdering = colOrdering;
        return _chart;
    };

    _chart._doRender = function () {
        _chart.resetSvg();

        _chartBody = _chart.svg()
            .append('g')
            .attr('class', 'heatmap')
            .attr('transform', 'translate(' + _chart.margins().left + ',' + _chart.margins().top + ')');

        return _chart._doRedraw();
    };

    _chart.boxWidth = function(_) {
        if (!arguments.length) {
            return _boxWidth;
        }
        _boxWidth = _;
        return _chart;
    };

    _chart.boxHeight = function(_) {
        if (!arguments.length) {
            return _boxHeight;
        }
        _boxHeight = _;
        return _chart;
    };

    var _verticalXAxisTicks = false;

    var _showAny = false;
    _chart.showAny = function(_) {
        if (!arguments.length) {
            return _showAny;
        }
        _showAny = _;
        return _chart;
    };

    _chart._doRedraw = function () {
        var data = _chart.data();
        var vsAny = [], unreflectedData = data;

        data = data.reduce((acc, d, i) => _chart.keyAccessor()(d) == _chart.valueAccessor()(d) ? acc : acc.concat([{key: [d.key[1], d.key[0]], value: [d.value[1], d.value[0]] }]), data);

        var rows = _chart.rows() || data.map(_chart.valueAccessor()),
            cols = _chart.cols() || data.map(_chart.keyAccessor());

        if (_showAny) {
            /* Row name -> [wins, picked] */
            vsAny = rows.reduce((acc, d, i) => (acc[d] = [0,0], acc), []);
            unreflectedData.forEach(d => {
                /* If a key won, increase its wins */
                if (d.value[0]) {
                    vsAny[d.key[0]][0] += d.value[0];
                }
                if (d.value[1]) {
                    vsAny[d.key[1]][0] += d.value[1];
                }
                /* Unconditionally increase picks */
                vsAny[d.key[0]][1] += d.value[0] + d.value[1];
                vsAny[d.key[1]][1] += d.value[0] + d.value[1];
            });
            data = data.concat(rows.reduce((acc, d, i) =>
              (acc.push({ key: [ d, 'Any' ], value: [ vsAny[d][0], vsAny[d][1] - vsAny[d][0] ]}), acc),
            []));
        }

        if (_rowOrdering) {
            rows = rows.sort(_rowOrdering);
        }
        if (_colOrdering) {
            cols = cols.sort(_colOrdering);
        }

        rows = _rowScale.domain(rows);
        cols = _colScale.domain(cols);

        var rowCount = rows.domain().length,
            colCount = cols.domain().length,
            boxWidth = Math.floor(_chart.effectiveWidth() / colCount),
            boxHeight = Math.floor(_chart.effectiveHeight() / rowCount);

        cols.rangeRound([0, _chart.effectiveWidth()]);
        rows.rangeRound([_chart.effectiveHeight(), 0]);

        var boxes = _chartBody.selectAll('g.box-group').data(data, function (d, i) {
            const k ='' + [_chart.keyAccessor()(d, i) , _chart.valueAccessor()(d, i)];
            // console.log(d, '=>', k);
            return k;
        });

        boxes.exit().remove();

        var gEnter = boxes.enter().append('g')
            .attr('class', 'box-group');

        gEnter.append('rect')
            .attr('class', 'heat-box')
            .attr('fill', 'white')
            .attr('x', function (d, i) { return cols(_chart.keyAccessor()(d, i)); })
            .attr('y', function (d, i) { return rows(_chart.valueAccessor()(d, i)); })
            .on('click', _chart.boxOnClick());

        boxes = gEnter.merge(boxes);

        if (_chart.renderTitle()) {
            gEnter.append('title');
            boxes.select('title').text(_chart.title());
        }

        function boxSignificance(d) {
            return Math.min(1, (d.value[0] + d.value[1] + 20) / 40);
        }
        boxes.each(d=>d.significance = boxSignificance(d));

        dc.transition(boxes.select('rect'), _chart.transitionDuration(), _chart.transitionDelay())
            .attr('x', function (d, i) { return (boxWidth - boxWidth * d.significance) / 2 + cols(_chart.keyAccessor()(d, i)); })
            .attr('y', function (d, i) { return (boxHeight - boxHeight * d.significance) / 2 + rows(_chart.valueAccessor()(d, i)); })
            .attr('rx', _xBorderRadius)
            .attr('ry', _yBorderRadius)
            .attr('fill', _chart.getColor)
            .attr('width', d => boxWidth * d.significance)
            .attr('height', d => boxHeight * d.significance);

        var gCols = _chartBody.select('g.cols');
        if (gCols.empty()) {
            gCols = _chartBody.append('g').attr('class', 'cols axis');
        }
        var gColsText = gCols.selectAll('text').data(cols.domain(), d => d);

        gColsText.exit().remove();

        gColsText = gColsText
            .enter()
                .append('text')
                .attr('x', function (d) {
                    return cols(d) + boxWidth / 2;
                })
                .style('text-anchor', _verticalXAxisTicks ? 'end' : 'middle')
                .attr('y', _chart.effectiveHeight())
                .attr('dy', 12)
                .on('click', _chart.xAxisOnClick())
                .text(_chart.colsLabel());
        if (_verticalXAxisTicks) {
            gColsText = gColsText.attr('transform', d => 'rotate(-90,' + (cols(d) + boxWidth / 2) + "," + _chart.effectiveHeight() + ')');
        }
        gColsText
            .merge(gColsText);

        dc.transition(gColsText, _chart.transitionDuration(), _chart.transitionDelay())
               .text(_chart.colsLabel())
               .attr('x', function (d) { return cols(d) + boxWidth / 2; })
               .attr('y', _chart.effectiveHeight());

        var gRows = _chartBody.select('g.rows');
        if (gRows.empty()) {
            gRows = _chartBody.append('g').attr('class', 'rows axis');
        }

        var gRowsText = gRows.selectAll('text').data(rows.domain(), d => d);

        gRowsText.exit().remove();

        gRowsText = gRowsText
            .enter()
            .append('text')
                .style('text-anchor', 'end')
                .attr('x', 0)
                .attr('dx', -2)
                .attr('y', function (d) {
                    // console.log('row y', rows(d));
                    return rows(d) + boxHeight / 2; })
                .attr('dy', 6)
                .on('click', _chart.yAxisOnClick())
                .text(_chart.rowsLabel())
            .merge(gRowsText);

        dc.transition(gRowsText, _chart.transitionDuration(), _chart.transitionDelay())
              .text(_chart.rowsLabel())
              .attr('y', function (d) { return rows(d) + boxHeight / 2; });

        if (_chart.hasFilter()) {
            _chart.selectAll('g.box-group').each(function (d) {
                if (_chart.isSelectedNode(d)) {
                    _chart.highlightSelected(this);
                } else {
                    _chart.fadeDeselected(this);
                }
            });
        } else {
            _chart.selectAll('g.box-group').each(function () {
                _chart.resetHighlight(this);
            });
        }
        return _chart;
    };

    _chart.verticalXAxisTicks = function(_) {
        if (!arguments.length) return _verticalXAxisTicks;
        _verticalXAxisTicks = _;
        return _chart;
    };

    /**
     * Gets or sets the handler that fires when an individual cell is clicked in the heatmap.
     * By default, filtering of the cell will be toggled.
     * @method boxOnClick
     * @memberof dc.heatMap
     * @instance
     * @example
     * // default box on click handler
     * chart.boxOnClick(function (d) {
     *     var filter = d.key;
     *     dc.events.trigger(function () {
     *         _chart.filter(filter);
     *         _chart.redrawGroup();
     *     });
     * });
     * @param  {Function} [handler]
     * @returns {Function|dc.heatMap}
     */
    _chart.boxOnClick = function (handler) {
        if (!arguments.length) {
            return _boxOnClick;
        }
        _boxOnClick = handler;
        return _chart;
    };

    /**
     * Gets or sets the handler that fires when a column tick is clicked in the x axis.
     * By default, if any cells in the column are unselected, the whole column will be selected,
     * otherwise the whole column will be unselected.
     * @method xAxisOnClick
     * @memberof dc.heatMap
     * @instance
     * @param  {Function} [handler]
     * @returns {Function|dc.heatMap}
     */
    _chart.xAxisOnClick = function (handler) {
        if (!arguments.length) {
            return _xAxisOnClick;
        }
        _xAxisOnClick = handler;
        return _chart;
    };

    /**
     * Gets or sets the handler that fires when a row tick is clicked in the y axis.
     * By default, if any cells in the row are unselected, the whole row will be selected,
     * otherwise the whole row will be unselected.
     * @method yAxisOnClick
     * @memberof dc.heatMap
     * @instance
     * @param  {Function} [handler]
     * @returns {Function|dc.heatMap}
     */
    _chart.yAxisOnClick = function (handler) {
        if (!arguments.length) {
            return _yAxisOnClick;
        }
        _yAxisOnClick = handler;
        return _chart;
    };

    /**
     * Gets or sets the X border radius.  Set to 0 to get full rectangles.
     * @method xBorderRadius
     * @memberof dc.heatMap
     * @instance
     * @param  {Number} [xBorderRadius=6.75]
     * @returns {Number|dc.heatMap}
     */
    _chart.xBorderRadius = function (xBorderRadius) {
        if (!arguments.length) {
            return _xBorderRadius;
        }
        _xBorderRadius = xBorderRadius;
        return _chart;
    };

    /**
     * Gets or sets the Y border radius.  Set to 0 to get full rectangles.
     * @method yBorderRadius
     * @memberof dc.heatMap
     * @instance
     * @param  {Number} [yBorderRadius=6.75]
     * @returns {Number|dc.heatMap}
     */
    _chart.yBorderRadius = function (yBorderRadius) {
        if (!arguments.length) {
            return _yBorderRadius;
        }
        _yBorderRadius = yBorderRadius;
        return _chart;
    };

    _chart.isSelectedNode = function (d) {
        return _chart.hasFilter(d.key.slice().sort());
    };

    return _chart.anchor(parent, chartGroup);
}
