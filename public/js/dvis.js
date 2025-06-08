var dv = (function(dv) {
  "use strict";
  const hash = window.location.hash;
  const local = hash.substring(hash.indexOf('#')+1).split('|');
  /* Cap factory progression depth */
  const fac_progression_max = 5;
  function assignWhr(match, fullWhrByMatch) {
    const whrdata = fullWhrByMatch[match.gameid];
    if (whrdata) {
      const [winner_whrdata, loser_whrdata] = [whrdata[match.winner_userid], whrdata[match.loser_userid]];
      if (winner_whrdata && loser_whrdata) {
        if (winner_whrdata.rating && loser_whrdata.rating) {
          match.has_fullwhr = "Available";
          match.winner_whr = winner_whrdata.rating;
          match.winner_whr_stdev = winner_whrdata.stdev;
          match.loser_whr = loser_whrdata.rating;
          match.loser_whr_stdev = loser_whrdata.stdev;
          match.winner_whr_lead = match.winner_whr - match.loser_whr;
          return;
        } else {
          match.has_fullwhr = "Server-sourced null";
          if (winner_whrdata.rating) {
            match.winner_whr = winner_whrdata.rating;
            match.winner_whr_stdev = winner_whrdata.stdev;
          } else if (loser_whrdata.rating) {
            match.loser_whr = loser_whrdata.rating;
            match.loser_whr_stdev = loser_whrdata.stdev;
          }
        }
      } else {
        match.has_fullwhr = "UserID mismatch";
      }
    } else {
      match.has_fullwhr = "No data";
    }
    /*
     * Try to fill entries with the best values we can provide.
     * For meaningful results, the user should always filter by "Available" in WHR Availability.
     * This means, for whr, we set the value to the rating calculated at the time of the match.
     * We have no "best approximation" for stdev.
     * Stdev will be completely nonsensical whenever matches without full whr information are not excluded.
     */
    if (!match.winner_whr) {
      match.winner_whr = match.winner_elo;
      match.winner_whr_stdev = 80;
    }
    if (!match.loser_whr) {
      match.loser_whr = match.loser_elo;
      match.loser_whr_stdev = 80;
    }
    match.winner_whr_lead = match.winner_whr - match.loser_whr;
  }
  /* Coerce our data file before use elsewhere */
  function dataCoerce(data, config, mapTypes, fullWhr) {
    const fac_progression_dch_fixup = a => {
      /* Strip duplicates */
      a = a.reduce((a,d) => a.includes(d) ? a : (a.push(d), a), []);
      /* Add terminal node if one is not already present */
      if (a.slice(-1) !== 'Never') {
        a.push('Never');
      }
      return a.slice(0,fac_progression_max);
    };
    const fullWhrByMatch = {};
    if (local.includes("fullwhr")) {
      for (let match of fullWhr) {
        const whrByPlayer = {};
        for (let player of match.players) {
          whrByPlayer[player.accountId] = player;
        }
        fullWhrByMatch[match.id] = whrByPlayer;
      }
    }
    const ret = [];
    for (let match of data) {
      if (match.skip) {
        continue;
      }
      if (local.includes("fullwhr")) {
        assignWhr(match, fullWhrByMatch);
      }

      /* Track mirror match states for use as its own dimension. */
      match.mirror_match = match.winner_fac === match.loser_fac;
      if (match.map in mapTypes) {
        match.map_type = mapTypes[match.map];
      } else {
        match.map_type = 'Unknown';
      }

      /* Coerce the data in our hierarchical progressions */
      for (let player of ["winner", "loser"]) {
        match[player + "_fac_prog"] = fac_progression_dch_fixup(match[player + "_fac_prog"]);
        for (let depth = 0; depth < fac_progression_max; ++depth) {
          match[player + "_fac" + (depth + 1)] = match[player + "_fac_prog"][depth] || "Never";
        }
      }
      ret.push(match);
    }
    return ret;
  }
  /* Coerce our configuration file before use elsewhere */
  function configCoerce(config) {
    for (let column of config.columns) {
      for (let chart of column.charts) {
        chart.parent = column;
      }
    }
    return config;
  }
  function framesToDuration(d) {
    d = d / 30;
    const components = [];
    if (d > 3600) {
      const hours = Math.floor(d / 3600);
      components.push(`${hours} hour${hours > 1 ? 's' : ''}`);
      d -= hours * 3600;
    }
    if (d > 60) {
      const minutes = Math.floor(d / 60);
      components.push(`${minutes} minute${minutes > 1 ? 's' : ''}`);
      d -= minutes * 60;
    }
    if (d > 0) {
      const seconds = Math.floor(d);
      components.push(`${seconds} second${seconds > 1 ? 's' : ''}`);
    }
    return components.join(", ");
  }
  /*
   * Factory for simple sorting functions.
   * mapSort(f) returns a function that compares two arguments, l and r after the function f has been applied
   */
  const mapSort = f => (l,r) => Math.sign(f(l) - f(r));
  /* dc's default date format is messy. Use the universal ISO format. */
  dc.dateFormat = d3.timeFormat("%Y-%m-%d %H:%M");
  /* The initialisation function we're exposing in our namespace. Invoke this with the path of the configuration file to use. */
  dv.init = async function(configloc) {
    /* Fetch our configuration and data, coercing them as we go */
    let globalConfig = await d3.json(configloc);
    let [data, mapTypes, fullWhr] = await Promise.all([d3.json(globalConfig.src), d3.json("data/map-types.json"), local.includes("fullwhr") ? d3.json("data/fullwhr.json") : Promise.resolve([])]);

    globalConfig = configCoerce(globalConfig);
    data = dataCoerce(data, globalConfig, mapTypes, fullWhr);

    window.data = data;
    const cfdata = crossfilter(data);
    window.cfdata = cfdata;
    const vis = d3.select("#vis");
    /* Track which dimensions we've created */
    const heap = window.heap = new Map();
    /* Returns which symbol we should use to track this dimension. */
    function dimId(conf) {
      return (conf.dim.id || conf.dim).toLowerCase();
    }
    /* Construct a dimension and grouping, given the name, configuration, and a coercion function to apply to each record for this grouping. */
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
    /* Track which charts we've created. */
    const charts = window.charts = new Map();
    /* Constants for chart construction. */
    const colTypeToWidth = { 'tiny':70, 'thin': 200, 'med': 400, 'wide': 600 };
    const circularChartSize = 0.8;
    /* Create dimension, group, and chart in pie format */
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
        .width(colTypeToWidth[conf.parent.type])
        .dimension(h.dim)
        .group(h.group)
        ;
      if (conf.sort_name) {
        // eg "Zero-K 1.8.4.2" doesn't prefix a v, while "Zero-K v1.9.1.0" does (aaaa)
        // Patch around this so things still come in the correct order
        const re = / v?|\./;
        const cmp = (l,r) => {
          if (l.key === r.key) {
            return 0;
          }
          if (l.key.split(re) > r.key.split(re)) {
            return 1;
          }
          return -1;
        };
        ret.sliceSorter(cmp);
      }
      return ret;
    }
    /* Create dimension, group, and chart in sunburst format */
    function sun(v, conf) {
      if (charts.has(v)) {
        return charts.get(v);
      }
      const dl = dimId(conf);
      const h = dim(v, conf, d=>d[v].length ? d[v] : ["Never"]);
      const radius = colTypeToWidth[conf.parent.type] * circularChartSize / 2;
      const hideRoot = -radius/4;
      const ret = dc.sunburstChart("#" + dl + "-dvchart")
        .radius(radius)
        .innerRadius(radius / 8)
        .height(colTypeToWidth[conf.parent.type] * circularChartSize + 5)
        .width(colTypeToWidth[conf.parent.type])
        .dimension(h.dim)
        .group(h.group)
        ;
      return ret;
    }
    /* Create dimension, group, and chart in bar format */
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
        let lower_bound;
        const upper_bound = coerce(h.dim.top(1)[0]) + (conf.group ? conf.group * 2 : 1);
        if (conf.logarithmic) {
          xScale = d3.scaleLog();
          lower_bound = Math.max(900, lowest_value);
          window.dbglog = xScale;
        } else {
          xScale = d3.scaleLinear();
          lower_bound = Math.min(0, lowest_value);
        }
        xScale.domain([lower_bound, upper_bound]);
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
      if (dl == "duration") {
        ret.filterPrinter(d => d.map(d => `[${d.map(framesToDuration).join(" -> ")}]`));
      }
      if ('elasticX' in conf) {
        ret.elasticX(conf.elasticX);
      }
      if ('xAxisLabel' in conf) {
        ret.xAxisLabel(conf.xAxisLabel);
      }
      return ret;
    }
    /* Create dimension, group, and chart in bar format, with some fixed parameters. */
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
    /* Create dimension, group, and chart in matchups format, with many hardcoded parameters. Refactor me! */
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
      const colorScale = d3.piecewise(d3.interpolateHslLong, ["#ff0000ff", "#ff0000ff", "#cccccc11", "#0000ffff", "#0000ffff"]);
      const ret = matchupChart("#" + dl + "-dvchart")
        .margins({left: 110, right: 18, top: 5, bottom: 110})
        .height(colTypeToWidth[conf.parent.type])
        .width(colTypeToWidth[conf.parent.type])
        .dimension(h.dim)
        .group(h.group)
        .keyAccessor(d => d.key[1])
        .valueAccessor(d => d.key[0])
        .colorAccessor(d => { const wr = d.value[0] / (d.value[0] + d.value[1]); return wr; })
        .colors(c => isNaN(c) ? '#ffffff00' : colorScale(c))
        .title(d => `${d.key[0]} vs ${d.key[1]}: ${d.value[0]}:${d.value[1]} (${parseInt(d.value[0] / (d.value[0] + d.value[1]) * 100)}%)`)
        ;
      if (conf.order) {
        const incrementingRange = values.map((d,i) => i);

        const directOrder = d3.scaleOrdinal().domain(values).range(incrementingRange);
        const reversedValues = values.slice().reverse();
        const reverseOrder = d3.scaleOrdinal().domain(reversedValues).range(incrementingRange);
        /* Hack out the 'Any' row. XXX: Refactor me! */
        const rows = reversedValues[0] === 'Any' ? reversedValues.slice(1) : reversedValues;
        ret
          .rowOrdering(mapSort(reverseOrder))
          .colOrdering(mapSort(directOrder))
          .rows(rows)
          .cols(values)
          ;
        if (conf.size_by_popularity) {
          const enable = conf.size_by_popularity;
          ret.sizeByPopularity(enable);
        }
        if (local.includes("popularity")) {
          ret.sizeByPopularity(true);
        }
      }
      if (conf.show_any) {
        ret.showAny(true);
      }
      if ('verticalXAxisTicks' in conf) {
        ret.verticalXAxisTicks(true);
      }
      return ret;
    }
    /* Create dimension, group, and chart showing record directly */
    function records(v, conf) {
      if (charts.has(v)) {
        return charts.get(v);
      }
      const dl = dimId(conf);
      let type, count, ref;
      const h = dim(v, conf, d=>d[v]);
      const ret = dc.dataTable("#" + dl + "-dvchart")
        .dimension(h.dim)
        ;
      if (conf.count) {
        ret.size(conf.count);
      }
      const cconf = [];
      for (let c of conf.columns) {
        const entry = { label: c.label };
        if (c.type === 'link') {
          const p = c.prop;
          const fmt = c.ref;
          const replaceBraces = new RegExp('{}', 'g');
          entry.format = d => fmt.replace(replaceBraces, d[p]);
        }
        cconf.push(entry);
      }
      ret.columns(cconf);
      if (conf.order === "descending") {
        ret.order(d3.descending);
      }
      return ret;
    }
    /* Simple "Chart" that displays how many records are selected. */
    function count(v, conf) {
      if (charts.has(v)) {
        return charts.get(v);
      }
      const dl = dimId(conf);
      const ret = dc.dataCount("#" + dl + "-dvchart")
        .crossfilter(cfdata)
        .groupAll(cfdata.groupAll())
        ;
      const container = d3.select("#" + dl + "-dvchart").append('span').attr('class','dv-record-container');
      container.append('span').attr('class', 'filter-count');
      container.append('span').text('/');
      container.append('span').attr('class', 'total-count');
      container.append('span').text('.');
      return ret;
    }
    /* Final processing that is common to all chart factories. */
    function chartPostprocessCommon(ret, v, conf) {
      if (conf.colors) {
        const mapping = globalConfig.colors[conf.colors];
        ret.colors(k => mapping[k]);
      }
      ret
        .transitionDuration(500)
        ;
      charts.set(dimId(conf), ret);
      return ret;
    }
    /* Take our configuration file, and start laying out our page according to its specifications. */
    /* We're interested in creating a column for each column specified, and charts within it according to configuration. */
    /* For now, we're just creating the columns and containers for the charts. */
    const chartsSel = vis
      .selectAll(".dvcol").data(globalConfig.columns)
        .enter().append("div")
        .attr("class", function(d) { return (d.type ? d.type + " side " : "") + "vcol"; })
        .attr("id", function(d) { return d.type ? null : "main"; })
        .selectAll(".dvchart").data(function(d) { return d.charts.reduce((a,c)=>{(!c.when||local.includes(c.when))&&a.push(c);return a;},[]); })
          .enter().append("div")
          .attr("id", function(d) { return dimId(d) + "-dvchart"; })
          ;
    /* Add some supporting information for the chart's we're about to add. A title for each chart. A link to clear a chart's filters, and a span that will show the currently active filter, all under an element that will hide when there's no filter. */
    chartsSel.append("h3").text(function(d) { return d.dim_pretty || d.dim; });
    const filterinfoSel = chartsSel.append("p").attr("class", "filterinfo").append("span").attr("class", "reset").attr("style", "display: none");
    filterinfoSel.append('a').attr('class', 'reset').attr('style', 'display: none').attr('href', '#').text('Clear filter:').on('click', d => {
      charts.get(d.dim).filterAll();
      dc.redrawAll();
    });
    filterinfoSel.append('span').attr('class', 'filter');
    chartsSel.selectAll('.info').data(d => d.info ? [d.info] : []).enter().append('p').attr('class', 'info').text(d => d);
    /* Finally, construct the charts themselves. */
    chartsSel.each(function(d) {
      const factories = {
        'pie': pie,
        'sun': sun,
        'bar-fixed': barFixed,
        'bar': bar,
        'matchups': matchups,
        'records': records,
        'count': count
      };
      chartPostprocessCommon(factories[d.vis](dimId(d), d), d.dim, d);
    });
    /* Because there's *currently* no other place for it, set classes for extra css processing here. Refactor me! */
    chartsSel.attr('class', function(conf) {
      let extraClasses = '';
      if ('verticalXAxisTicks' in conf) {
        extraClasses += ' vertical-x-axis-ticks';
      }
      return 'dc-chart dvchart' + extraClasses;
    });
    /* Everything has been created. Render them all, and everything else is user interaction. */
    dc.renderAll();
  };
  return dv;
}(dv || {}));
