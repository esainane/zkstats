var d3 = (function(d3) {
  /* clone necessary d3 locals */
  const durationSecond = 1000;
  const durationMinute = durationSecond * 60;
  const durationHour = durationMinute * 60;
  const durationDay = durationHour * 24;
  const durationWeek = durationDay * 7;
  const durationMonth = durationDay * 30;
  const durationYear = durationDay * 365;
  function newInterval(floori, offseti, count, field) {
    function interval(date) {
      return floori(date = new Date(+date)), date;
    }
    interval.floor = interval;
    interval.ceil = function(date) {
      return floori(date = new Date(date - 1)), offseti(date, 1), floori(date), date;
    };

    interval.round = function(date) {
      const d0 = interval(date),
            d1 = interval.ceil(date);
      return date - d0 < d1 - date ? d0 : d1;
    };

    interval.offset = function(date, step) {
      return offseti(date = new Date(+date), step == null ? 1 : Math.floor(step)), date;
    };

    interval.range = function(start, stop, step) {
      let range = [], previous;
      start = interval.ceil(start);
      step = step == null ? 1 : Math.floor(step);
      if (!(start < stop) || !(step > 0)) return range; // also handles Invalid Date
      do range.push(previous = new Date(+start)), offseti(start, step), floori(start);
      while (previous < start && start < step);
      return range;
    };

    interval.filter = function(test) {
      return newInterval(function(date) {
        if (date >= date) while (floori(date), !test(date)) date.setTime(date - 1);
      }, function(date, step) {
        if (date >= date) {
          if (step < 0) while (++step <= 0) {
            while (offseti(date, -1), !test(date)) {} // eslint-disable-line no-empty
          } else while (--step >= 0) {
            while (offseti(date, +1), !test(date)) {} // eslint-disable-line no-empty
          }
        }
      });
    };

    if (count) {
      interval.count = function(start, end) {
        t0$1.setTime(+start), t1$1.setTime(+end);
        floori(t0$1), floori(t1$1);
        return Math.floor(count(t0$1, t1$1));
      };

      interval.every = function(step) {
        step = Math.floor(step);
        return !isFinite(step) || !(step > 0) ? null
            : !(step > 1) ? interval
            : interval.filter(field
                ? function(d) { return field(d) % step === 0; }
                : function(d) { return interval.count(0, d) % step === 0; });
      };
    }

    return interval;
  }
  /* Add in our own ranges from here */
  const durationHour6 = durationHour * 6;
  d3.timeHour6 = newInterval(function(date) {
    let offset = date.getTimezoneOffset() * durationMinute % durationHour6;
    if (offset < 0) offset += durationHour6;
    date.setTime(Math.floor((+date - offset) / durationHour6) * durationHour6 + offset);
    return date;
  }, function(date, step) {
    date.setTime(+date + step * durationHour6);
  }, function(start, end) {
    return (end - start) / durationHour6;
  });
  return d3;
})(d3 || {});
