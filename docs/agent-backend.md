# Command-line and API reference

Run the CLI from the repository root after completing the [local setup](../README.md#local-setup). The default input is the bundled bank statement, with a cut-off date of 31 May 2025, an opening balance of EUR 2,500, a zero reserve and a 45-day forecast.

## Forecast and agent commands

```sh
python -m cfo.cli forecast
python -m cfo.cli run liquidity
python -m cfo.cli run investment
```

`forecast` calculates a forecast locally. Both `run` commands require PostgreSQL and a reachable Qwen endpoint. Pass `--statement`, `--plan` or `--invoices` to use your own input files. Set `--as-of`, `--opening`, `--reserve` and `--days` to change the assumptions. The horizon can range from 1 to 366 days.

An agent run prints a request UUID and returns a saved decision. To retry the same assessment, pass its UUID with `--request-id`. Use a new UUID when the inputs or the agent change.

## Inspect or review a decision

Replace `1` with the saved decision ID. The preview compares the original forecast with a scenario using the specified settlement date and total interest in EUR.

```sh
python -m cfo.cli show 1
python -m cfo.cli preview 1 --settles-on 2025-07-15 --interest-eur 100.00
python -m cfo.cli approve 1 --actor owner
```

Use `reject` in place of `approve` to decline a proposal. The actor is recorded in the audit history. Approval creates a simulated request for the proposed financial action.

## Web API

FastAPI publishes the [interactive API reference](http://127.0.0.1:8080/docs) and the OpenAPI schema at `/openapi.json`. Workspace requests use the signed-in account. The web interface reads the saved decision when the page reloads.

[Forecast inputs](data-notes.md) · [Agent architecture](architecture.md)
