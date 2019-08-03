var dv = (function(dv) {
  "use strict";
  function dataCoerce(data, config) {
    const fac_progression_dch_fixup = a => {
      a = a.reduce((a,d) => a.includes(d) ? a : (a.push(d), a), []);
      if (a.slice(-1) !== 'Never') {
        a.push('Never');
      }
      return a.slice(0,3);
    };
    for (let match of data) {
      match.mirror_match = match.winner_fac === match.loser_fac;

      match.winner_fac_prog = fac_progression_dch_fixup(match.winner_fac_prog);
      match.loser_fac_prog = fac_progression_dch_fixup(match.loser_fac_prog);
    }
    return data;
  }
  function configCoerce(config) {
    for (let column of config.columns) {
      for (let chart of column.charts) {
        chart.parent = column;
      }
    }
    return config;
  }
  const mapSort = f => (l,r) => Math.sign(f(l) - f(r));
  dc.dateFormat = d3.timeFormat("%Y-%m-%d %H:%M");
  dv.init = async function(configloc) {
    let globalConfig = await d3.json(configloc);
    let data = await d3.json(globalConfig.src);
    globalConfig = configCoerce(globalConfig);
    data = dataCoerce(data);
    window.data = data;
    const cfdata = crossfilter(data);
    const vis = d3.select("#vis");
    const heap = window.heap = new Map();
    function dimId(conf) {
      return conf.dim.id || conf.dim.toLowerCase();
    }
    function dim(v, conf, coerce = i => "" + i[v]) {
      const dl = dimId(conf);
      if (heap.has(dl)) {
        return heap.get(dl);
      }
      const d = cfdata.dimension(coerce);
      let grouper;
      if (conf.group) {
        if (conf.dates) {
          const f = d3['time' + conf.group].round;
          grouper = t => f(new Date(t));
        } else {
          const groupsize = conf.group;
          grouper = t => Math.floor(t / groupsize) * groupsize;
        }
      }
      let g = grouper ? d.group(grouper) : d.group();
      if (conf.dim.type === "triangle") {
        /* Group format: [wins, losses] */
        const cols = d => d[conf.dim.cols];
        const rows = d => d[conf.dim.rows];
        /* Triangle group reduction. All non-diagonals are implicitly duplicated in reverse; diagonals are added to twice (hence the equal-to comparison) */
        /*
         * Lifecycle:
         *  - Data comes in, records of the form { winner: type, loser: type }
         *  - Create a un-triangle reduced dimension key of the form [winner, loser]
         *  - Reduce this to a dimension key of the form [lower, higher]
         *  - When it comes to reconstructing who won (relative to this triangle key), we work out whether we swapped the order or not
         *  - If the form is still [winner, loser], add [1,0]
         *  - If the form is now [loser, winner], add [0,1]
         *  - If this was a mirror match, so we're not going to be duplicating and inverting this key later, add [1,1]
         * This constructs a non-redundant mapping of [ordinally lower, ordinally higher] to a value of [ordinally lower wins, ordinally lower losses]
         */
        const unswapped_or_equal = rv => rows(rv) <= cols(rv);
        const swapped_or_equal   = rv => cols(rv) <= rows(rv);
        g = g.reduce(
          ([w, l], rv, nf) => [w + (unswapped_or_equal(rv) ? 1 : 0), l + (swapped_or_equal(rv) ? 1 : 0)],
          ([w, l], rv, nf) => [w - (unswapped_or_equal(rv) ? 1 : 0), l - (swapped_or_equal(rv) ? 1 : 0)],
          // ([w, l], rv, nf) => [w + 1, l + (rows(rv) == cols(rv) ? 1 : 0)],
          // ([w, l], rv, nf) => [w - 1, l - (rows(rv) == cols(rv) ? 1 : 0)],
          (p, rv, nf) => [0, 0]
        );
      } else if (conf.ignore_values) {
        const ign = new Set(conf.ignore_values instanceof Array ? conf.ignore_values : [conf.ignore_values]);
        g = g.reduce(
          (p, rv, nf) => ign.has(coerce(rv)) ? p : p + 1,
          (p, rv, nf) => ign.has(coerce(rv)) ? p : p - 1,
          (p, rv, nf) => 0
        );
      }
      const ret = {
        dim: d,
        group: g
      };
      heap.set(dl, ret);
      return ret;
    }
    const charts = window.charts = new Map();
    const colTypeToWidth = { 'thin': 200, 'med': 400, 'wide': 600 };
    const circularChartSize = 0.8;
    function pie(v, conf) {
      if (charts.has(v)) {
        return charts.get(v);
      }
      const dl = dimId(conf);
      const h = dim(v, conf);
      const radius = colTypeToWidth[conf.parent.type] * circularChartSize / 2;
      const ret = dc.pieChart("#" + dl + "-dvchart")
        .radius(radius)
        .innerRadius(radius / 2)
        .height(colTypeToWidth[conf.parent.type] * circularChartSize + 5)
        .dimension(h.dim)
        .group(h.group)
        ;
      return ret;
    }
    function sun(v, conf) {
      if (charts.has(v)) {
        return charts.get(v);
      }
      const dl = dimId(conf);
      const h = dim(v, conf, d=>d[v].length ? d[v] : ["Never"]);
      const radius = colTypeToWidth[conf.parent.type] * circularChartSize / 2;
      console.log('sun', radius);
      const hideRoot = -radius/4;
      const ret = dc.sunburstChart("#" + dl + "-dvchart")
        .radius(radius)
        .innerRadius(hideRoot + radius / 8)
        .height(colTypeToWidth[conf.parent.type] * circularChartSize + 5)
        .width(colTypeToWidth[conf.parent.type] * circularChartSize + 5)
        .dimension(h.dim)
        .group(h.group)
        ;
      return ret;
    }
    function bar(v, conf) {
      if (charts.has(v)) {
        return charts.get(v);
      }
      let coerce, xScale;
      if (conf.dates) {
        coerce = i => new Date(i[v]);
      } else {
        coerce = i => parseInt(i[v]) || 0;
      }
      const dl = dimId(conf);
      const h = dim(v, conf, coerce);
      if (conf.dates) {
        const domain = [coerce(h.dim.bottom(1)[0]), coerce(h.dim.top(1)[0])];
        xScale = d3.scaleTime().domain([coerce(h.dim.bottom(1)[0]), coerce(h.dim.top(1)[0])]);
        if (conf.group) {
          xScale = xScale.nice(d3['time' + conf.group]);
        }
      } else {
        const lowest_value = coerce(h.dim.bottom(1)[0]);
        xScale = d3.scaleLinear().domain([lowest_value < 0 ? lowest_value : 0, coerce(h.dim.top(1)[0]) + (conf.group || 1)]);
      }
      const ret = dc.barChart("#" + dl + "-dvchart")
        .margins({left: 60, right: 18, top: 5, bottom: 60})
        .height(130)
        .width(colTypeToWidth[conf.parent.type])
        .elasticY(true)
        .gap(1)
        .renderHorizontalGridLines(true)
        .title(function(d) { return d.key + ": " + d.value; })
        .dimension(h.dim)
        .group(h.group)
        .x(xScale)
        .barWidthMultiplier((conf.dates ? '1' : conf.group) || 1);
      if ('elasticX' in conf) {
        ret.elasticX(conf.elasticX);
      }
      return ret;
    }
    function barFixed(v, conf) {
      const c = bar(v, conf).width(200).round(Math.round).centerBar(true);
      let range = [1,2,3,4,5];
      if (conf.range) {
        if (conf.range instanceof Array) {
          range = conf.range;
        } else {
          range = [];
          for (let i = 1; i <= conf.range; ++i) {
            range.push(i);
          }
        }
      }
      c.xAxis().tickValues(range).tickFormat(d3.format(",.0f"));
    }
    function matchups(v, conf) {
      if (charts.has(v)) {
        return charts.get(v);
      }
      const dl = dimId(conf);
      let order;
      let coerce, values;
      if (conf.order) {
        values = globalConfig.orders[conf.order];
        const valueOrder = values.map((d,i) => i);
        order = d3.scaleOrdinal().domain(values).range(valueOrder);
        window.order = order;
        const sorter = mapSort(order);
        window.sorter = sorter;
        coerce = d => { const ret = [d[conf.dim.rows], d[conf.dim.cols]].sort(); return ret; };
      } else {
        coerce = d => [d[conf.dim.rows], d[conf.dim.cols]].sort();
      }
      const h = dim(v, conf, coerce);
      const colorScale = d3.piecewise(d3.interpolateHclLong, ["#ff0000", "#cccccc", "#0000ff"]);
      const ret = matchupChart("#" + dl + "-dvchart")
        .margins({left: 110, right: 18, top: 5, bottom: 110})
        .height(colTypeToWidth[conf.parent.type])
        .width(colTypeToWidth[conf.parent.type])
        .title(function(d) { return d.key + ": " + d.value; })
        .dimension(h.dim)
        .group(h.group)
        .keyAccessor(d => d.key[1])
        .valueAccessor(d => d.key[0])
        .colorAccessor(d => { const wr = d.value[0] / (d.value[0] + d.value[1]); return wr; })
        .colors(c => isNaN(c) ? '#ffffff' : colorScale(c))
        ;
      if (conf.order) {
        const incrementingRange = values.map((d,i) => i);

        const directOrder = d3.scaleOrdinal().domain(values).range(incrementingRange);
        const reversedValues = values.slice().reverse();
        const reverseOrder = d3.scaleOrdinal().domain(reversedValues).range(incrementingRange);
        ret
          .rowOrdering(mapSort(reverseOrder))
          .colOrdering(mapSort(directOrder))
          .rows(reversedValues)
          .cols(values)
          ;
      }
      if ('verticalXAxisTicks' in conf) {
        ret.verticalXAxisTicks(true);
      }
      return ret;
    }
    function chartPostprocessCommon(ret, v, conf) {
      if (conf.colors) {
        const mapping = globalConfig.colors[conf.colors];
        ret.colors(k => mapping[k]);
      }
      ret
        .transitionDuration(500)
        ;
      charts.set(v, ret);
      return ret;
    }
    const chartsSel = vis
      .selectAll(".dvcol").data(globalConfig.columns)
        .enter().append("div")
        .attr("class", function(d) { return (d.type ? d.type + " side " : "") + "vcol"; })
        .attr("id", function(d) { return d.type ? null : "main"; })
        .selectAll(".dvchart").data(function(d) { return d.charts; })
          .enter().append("div")
          .attr("id", function(d) { return dimId(d) + "-dvchart"; })
          ;
    chartsSel.append("h3").text(function(d) { return d.dim_pretty || d.dim; });
    const filterinfoSel = chartsSel.append("p").attr("class", "filterinfo").append("span").attr("class", "reset").attr("style", "display: none");
    filterinfoSel.append('a').attr('class', 'reset').attr('style', 'display: none').attr('href', '#').text('Clear filter:').on('click', d => {
      charts.get(d.dim).filterAll();
      dc.redrawAll();
    });
    filterinfoSel.append('span').attr('class', 'filter');
    chartsSel.selectAll('.info').data(d => d.info ? [d.info] : []).enter().append('p').attr('class', 'info').text(d => d);
    chartsSel.each(function(d) {
      const factories = {
        'pie': pie,
        'sun': sun,
        'bar-fixed': barFixed,
        'bar': bar,
        'matchups': matchups
      };
      chartPostprocessCommon(factories[d.vis](d.dim, d), d.dim, d);
    });
    chartsSel.attr('class', function(conf) {
      let extraClasses = '';
      if ('verticalXAxisTicks' in conf) {
        extraClasses += ' vertical-x-axis-ticks';
      }
      return 'dc-chart dvchart' + extraClasses;
    });
    dc.renderAll();
  };
  return dv;
}(dv || {}));
