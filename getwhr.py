#!/usr/bin/env python3

'''
Get up to date WHR values for all processed matches.

Inputs:
    public/data/live.json
    API calls to https://zero-k.info/api/whr/battles

Outputs:
    demos/fullwhr.json
    demos/fullwhr-skipped.json
    demos/fullwhr-missing.json
'''

from __future__ import annotations

from argparse import ArgumentParser
import asyncio
from collections import deque
from datetime import datetime, timedelta
from email.utils import parsedate_to_datetime
from functools import singledispatchmethod
from itertools import batched, count
import json
import httpx
import logging
from pydantic import BaseModel, Field, ConfigDict
from time import monotonic

'''
API:

https://zero-k.info/api/whr/battles

Json request body:
{
    "battleids": [953063, 953059, ...]
}

Json response body:
[
    {
        "players: [
            { "rating":1566.9895,"stdev":110.391861,"accountId":512423 },
            { "rating":1409.92493,"stdev":137.7767,"accountId":517038 }
        ],
        "id": 953059
    },
    {
        "players": [
            { "rating":941.5305,"stdev":251.637436,"accountId":442373 },
            { "rating":1409.92493,"stdev":137.7767,"accountId":517038 }
        ],
        "id": 953063
    }, ...
]
'''

API_URL = "https://zero-k.info/api/whr/battles"


class WHRBattlesRequest(BaseModel):
    battleids: list[int]


class WHRPlayerRatings(BaseModel):
    # ZKI will sometimes silently give us null values
    rating: float | None
    stdev: float | None
    account_id: int = Field(alias="accountId")

    # Allow using either field names or aliases on dump/load
    model_config = ConfigDict(populate_by_name=True, extra="ignore")


class WHRBattle(BaseModel):
    id: int
    players: list[WHRPlayerRatings]

    model_config = ConfigDict(populate_by_name=True, extra="ignore")


class RateLimiter:
    """
    Rolling-window limiter: allow up to max_calls within period seconds.
    """
    def __init__(self, max_calls: int, period: float) -> None:
        self._max_calls = max_calls
        self._period = period
        self._timestamps: deque[float] = deque()
        self._lock = asyncio.Lock()

    async def acquire(self) -> None:
        while True:
            async with self._lock:
                now = monotonic()
                while self._timestamps and (now - self._timestamps[0]) >= self._period:
                    self._timestamps.popleft()
                if len(self._timestamps) < self._max_calls:
                    self._timestamps.append(now)
                    return
                sleep_for = self._period - (now - self._timestamps[0])
            await asyncio.sleep(sleep_for)


class MaxRetryError(Exception):
    pass


class RateLimitTransport(httpx.AsyncBaseTransport):
    """
    httpx transport wrapper that rate-limits outgoing requests.
    Compose with other transports by wrapping them.
    """
    def __init__(
        self,
        *,
        max_calls: int,
        period: float,
        retries: int = 0,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        # Disable internal retrying, we must be aware of the rate we're actually sending requests
        self._transport = transport or httpx.AsyncHTTPTransport(retries=0)
        self._limiter = RateLimiter(max_calls, period)
        self._retries = retries

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        backoff_base = 0.5
        for attempt in count(1):
            await self._limiter.acquire()
            delay = 0
            try:
                response = await self._transport.handle_async_request(request)
                match response.status_code:
                    case 429:
                        if 'Retry-After' in response.headers:
                            delay = self._parse_retry_after(response, raise_=True)
                        logging.info(f'HTTP Request: {request.url} "429 Too Many Requests" attempt {attempt}/{self._retries}')
                    case _:
                        return response
            except (httpx.ConnectTimeout, httpx.ReadTimeout) as e:
                logging.info(f"{type(e).__name__} {request.url} attempt {attempt}/{self._retries}")
            if attempt >= self._retries:
                raise MaxRetryError(f"Maximum retry attempts reached for {request.url}")
            if not delay:
                delay = timedelta(seconds=backoff_base * (2 ** (attempt - 1)))
            await self._sleep(delay)

        raise Exception("Unreachable")

    @singledispatchmethod
    async def _sleep(self, until: datetime) -> None:
        """
        Ensure that the next request is delayed until the specified datetime.
        Args:
            until: When the next request should be delayed until.
                   Can be an absolute datetime or a timedelta relative to now.
        """
        delay = (until - datetime.now()).total_seconds()
        await asyncio.sleep(delay)

    @_sleep.register
    async def _(self, delay: timedelta) -> None:
        await asyncio.sleep(delay.total_seconds())

    @staticmethod
    def _parse_retry_after(
        response: httpx.Response, raise_: bool = False
    ) -> datetime | timedelta | None:
        """
        Parse the 'Retry-After' header from the response.

        Args:
            response: The HTTP response object.
            raise_: If True, raise ValueError if the header is present but cannot be parsed.

        Returns:
            datetime: If the header is a date/time.
            timedelta: If the header is a delay in seconds.
            None: If the header is not present, or cannot be parsed when raise_ is False.

        Raises:
            ValueError: If the header is present but cannot be parsed and raise_ is True.
        """
        retry_after = response.headers.get("Retry-After")
        if retry_after is None:
            return None
        assert isinstance(retry_after, str)
        try:
            return timedelta(seconds=int(retry_after))
        except ValueError:
            try:
                return parsedate_to_datetime(retry_after)
            except (ValueError, TypeError):
                if raise_:
                    raise ValueError(f"Unparseable 'Retry-After' header: {retry_after}")
                return None

    async def aclose(self) -> None:
        await self._transport.aclose()

MAX_BATCH_SIZE = 250

async def get_latest_ratings(battle_ids: list[int], client: httpx.AsyncClient | None = None) -> tuple[list[WHRBattle], list[int], list[int]]:
    '''
    Request WHR values for the given list of player IDs.

    Returns:
        - A mapping of player ID to WHR value
        - Battle IDs we skipped due to causing failures on the server
        - Battle IDs missing, silently omitted from server responses
    '''
    if len(battle_ids) == 0:
        return [], [], []
    if client is None:
        # Rate limit to 3 requests per 1 second
        # Update based on ZKI DosProtect.cs and empirical testing
        async with httpx.AsyncClient(transport=RateLimitTransport(max_calls=5, period=1, retries=10)) as client:
            return await get_latest_ratings(battle_ids, client)
    if len(battle_ids) > MAX_BATCH_SIZE:
        # Ensure we don't make extremely large requests which time out
        all_data = []
        all_skipped = []
        all_missing = []
        batch_data = await asyncio.gather(*[
            get_latest_ratings(list(batch), client)
            for batch in batched(battle_ids, MAX_BATCH_SIZE)
        ])
        for data, skipped, missing in batch_data:
            all_data.extend(data)
            all_skipped.extend(skipped)
            all_missing.extend(missing)
        return all_data, all_skipped, all_missing

    request_body = WHRBattlesRequest(battleids=battle_ids)
    try:
        response = await client.post(
            API_URL,
            headers={"Content-Type": "application/json"},
            json=request_body.model_dump(by_alias=True)
        )
    except MaxRetryError:
        logging.warning(f"Retries exceeded during HTTP request for battle IDs: {len(battle_ids)=}")
        return await split_request(battle_ids, client)
    try:
        response.raise_for_status()
    except httpx.HTTPStatusError as e:
        # Request-killing battle ID recovery logic

        # ZKI will sometimes not process all replays. When we request data from a match without date, ZKI
        # will attempt to look it up in its dictionary, fail, and return a 500 error with the stack trace.
        # If it looks like this is what happened, try to binary search to find any bad battle IDs.
        # Performs O(n log n) requests if every single Battle ID is bad.

        # It won't tell us which battle ID failed, but it'll somewhat consistently return the C# KeyNotFound error.
        # If it doesn't look like this situation, just forward the error.
        if e.response.status_code != 500:
            raise
        if not (error_json := e.response.json()):
            raise
        if error_json.get("ExceptionType") != "System.Collections.Generic.KeyNotFoundException":
            raise

        # Looks like this was the situation.
        # If we're down to a single failing ID, identify this as the problem and skip it.
        if len(battle_ids) == 1:
            return [], battle_ids, []
        # Otherwise, split the request in half and try again.
        return await split_request(battle_ids, client)

    battles_data = response.json()
    battles = [WHRBattle.model_validate(battle) for battle in battles_data]
    missing = []
    if len(battles) != len(battle_ids):
        missing_ids = set(battle_ids) - {battle.id for battle in battles}
        logging.warning(f"Request did not return data for all requested battles, {len(battles)=} != {len(battle_ids)=}. {missing_ids=}")
        missing = list(missing_ids)
    return battles, [], missing

async def split_request(battle_ids: list[int], client: httpx.AsyncClient) -> tuple[list[WHRBattle], list[int], list[int]]:
    mid = len(battle_ids) // 2
    left_ids = battle_ids[:mid]
    right_ids = battle_ids[mid:]
    left, right = await asyncio.gather(
        get_latest_ratings(left_ids, client),
        get_latest_ratings(right_ids, client)
    )
    left_data, left_skipped, left_missing = left
    right_data, right_skipped, right_missing = right
    if sum(len(l) for l in [left_data, right_data, left_skipped, right_skipped, left_missing, right_missing]) != len(battle_ids):
        logging.warning(f"Mismatch in split request results length, {len(left_data)=} + {len(right_data)=} + {len(left_skipped)=} + {len(right_skipped)=} + {len(left_missing)=} + {len(right_missing)=} != {len(battle_ids)=}")
    return left_data + right_data, left_skipped + right_skipped, left_missing + right_missing

async def amain():
    parser = ArgumentParser(description="Fetch WHR data for all known battles")
    parser.add_argument('--verbose', '-v', action='store_true', help='Enable verbose logging')
    parser.add_argument('--input', '-i', default='public/data/live.json', help='Input JSON file with battle summaries (default: public/data/live.json)')
    parser.add_argument('--output', '-o', default='demos/fullwhr.json', help='Output JSON file for WHR data (default: demos/fullwhr.json)')
    parser.add_argument('--skipped-output', '-s', default='demos/fullwhr-skipped.json', help='Output JSON file for skipped battle IDs (default: demos/fullwhr-skipped.json)')
    parser.add_argument('--missing-output', '-m', default='demos/fullwhr-missing.json', help='Output JSON file for missing battle IDs (default: demos/fullwhr-missing.json)')
    parser.add_argument('--limit', '-l', type=int, default=None, help='Limit to this many battles from the input file (default: all)')
    args = parser.parse_args()
    logging.basicConfig(
        format="%(levelname)s [%(asctime)s] %(name)s - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        level=logging.DEBUG if args.verbose else logging.INFO
    )
    with open(args.input, 'r') as f:
        all_summaries = json.load(f)

    battle_ids = [summary['gameid'] for summary in all_summaries if not summary.get('skip', False)]
    if args.limit is not None:
        battle_ids = battle_ids[:args.limit]
    print(f"Fetching WHR data for {len(battle_ids)} battles")

    try:
        whr_data, skipped, missing = await get_latest_ratings(battle_ids)
    except httpx.HTTPStatusError as e:
        try:
            # Attempt to format the response text as json first
            error_json = e.response.json()
            error_text = json.dumps(error_json, indent=2)
        except:
            error_text = e.response.text
        print(f"HTTP error while fetching WHR data: {e.response.status_code} - {error_text}")
        raise
    except Exception as e:
        print(f"Error fetching WHR data: {e}")
        raise

    with open(args.skipped_output, 'w') as f:
        json.dump(skipped, f)
    with open(args.missing_output, 'w') as f:
        json.dump(missing, f)

    # Verify ZKI didn't silently give us null values again
    null_data_battles = []
    for battle in whr_data:
        for player in battle.players:
            if player.rating is None:
                null_data_battles.append(battle.id)
                break

    with open(args.output, 'w') as f:
        json.dump([battle.model_dump(by_alias=True) for battle in whr_data], f)

    print(f"Fetched WHR data for {len(whr_data)} battles, skipped {len(skipped)}/{len(battle_ids)}")
    if skipped:
        logging.warning(f"Skipped error inducing battles for {len(skipped)} battles: {skipped[:10]=}")
    if null_data_battles:
        # Note: Frontend will categorize these as "Server sourced null" for WHR availability
        logging.warning(f"Received null WHR ratings for {len(null_data_battles)} battles: {null_data_battles[:10]=}")

def main():
    asyncio.run(amain())

if __name__ == '__main__':
    main()
