/*
 * Types for the records provided by the server.
 *
 * The server provides a JSON file, which is a list of records.
 *
 * Most records fit the format of `RegularRawRecord`, but some may be skipped.
 * Skipped records are a simple { skip: true } object.
 *
 * The `Record` type is the postprocessed version of `RegularRawRecord`, with
 * additional fields. Fields may be added to Record as needed, without needing
 * to modify the server.
 */

/**
 * Properties common to both regular raw and postprocessed records.
 */
interface RecordCommon {
  winner_elo_lead: number;
  winner_elo: number;
  loser_elo: number;

  loser_fac_prog: string[];
  winner_fac_prog: string[];

  map: string;
  map_type: string;

  zk_version: string;
  spring_version: string;

  duration: number;

  winner_fac: string;
  loser_fac: string;

  gameid: number;
};

/**
 * Standard raw record from JSON, from the server.
 *
 * This interface adds the records that are no longer present in the
 * client side postprocessed version, or are present with different types.
 */
interface RegularRawRecord extends RecordCommon {
  started: string;
};

/**
 * Raw record from JSON, from the server.
 *
 * The original record may be skipped, in which case the `skip` field is set
 * to `true`, and none of the regular fields are present.
 */
type RawRecord = { skip: true } | RegularRawRecord;

const fac_prog_max = 5;
/**
 * Record after client side postprocessing, with additional fields.
 *
 * Note that client side postprocessing is different from the server sided
 * postprocess.py which transforms an event log into a record.
 */
interface Record extends RecordCommon {
  loser_fac1: string;
  loser_fac2: string;
  loser_fac3: string;
  loser_fac4: string;
  loser_fac5: string;
  winner_fac1: string;
  winner_fac2: string;
  winner_fac3: string;
  winner_fac4: string;
  winner_fac5: string;

  mirror_match: boolean;

  started: Date;
};

export { RegularRawRecord, RawRecord, Record, fac_prog_max };
export default Record;
