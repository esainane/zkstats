import LoadWait from "./components/LoadWait";

import { fac_prog_max, RegularRawRecord, Record } from "./Record";
import BarChart from "./components/BarChart";
import CrossfilterSystem, { DefaultGroupValue } from "./components/CrossfilterSystem";
import Counter from "./components/Counter";
import RecordList from "./components/RecordList";
// import DateSlider from "./components/DateSlider";
// import GraphSlider from "./components/GraphSlider";
// import Matchups from "./components/Matchups";

const parseData = (data: RegularRawRecord[]): Record[] => {
  const unskipped = data.filter(record => !record.hasOwnProperty('skip'));
  return unskipped.map(record => {
    const returnValue = {
      ...record,
      mirror_match: record.winner_fac === record.loser_fac,
      started: new Date(record.started),
      duration: record.duration / (gameSpeedHz * 60),
    };
    for (let player of ['loser', 'winner']) {
      for (let i = 0; i <= fac_prog_max; i++) {
        returnValue[`${player}_fac${i}`] = record[`${player}_fac_prog`][i] || 'Never'
      }
    }
    return returnValue as Record;
  });
};

const gameSpeedHz = 30;

/* Format a date as ISO 8601 */
const dateToISO = (date: Date): string => date.toISOString().split('T')[0];

const ZKStats = (props, context) => {
  // Immediately fire off a request for our JSON data
  const data: Promise<Record[]> = fetch('all.json')
  // When this request completes, parse the data
  .then(response => response.json())
  .then(parseData)
  // And to test the loading spinner, wait for a few seconds
  .then((data: Record[]) => new Promise(resolve => setTimeout(() => resolve(data), 300)));
  return (
    <div class="root">
      <LoadWait promise={data}><CrossfilterSystem<Record> data={data}>
        <div style="width: 200px; align-items: end; align-content: flex-end;">
          <Counter />
          <RecordList dim="gameid" limit={50} linkFormat={(k) => 'https://zero-k.info/Battles/Detail/' + k} />
        </div>
        <div>
          <BarChart title="Matches by week"
            dim="started" grouper="Week"
            titleFunc={(d: DefaultGroupValue<Date>) => `${dateToISO(d.key)}: ${d.value}`}
            keyFormatter={(v: any) => dateToISO(v)}
            emptyKey={new Date(0)}
            />
          <BarChart title="Duration (minutes)" dim="duration" grouper={5}/>
          {/*<Matchups attr="matchup" /> */}
        </div>
        <div>
          <BarChart title="Winner's ELO advantage"
            dim="winner_elo_lead" grouper={100} width={300} />
          <BarChart title="Winner's ELO rating"
            dim="winner_elo" grouper={100} width={300} />
          <BarChart title="Loser's ELO rating"
            dim="loser_elo" grouper={100} width={300} />
        </div>
      </CrossfilterSystem></LoadWait>
    </div>
  );
};

export default ZKStats;
