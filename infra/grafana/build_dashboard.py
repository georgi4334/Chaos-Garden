"""Generates dashboards/chaos-garden.json. Edit this file, then run: python3 infra/grafana/build_dashboard.py"""
import json
import pathlib

DS = {"type": "prometheus", "uid": "prometheus"}
RI = "$__rate_interval"
# Same validated outcome palette as the web dashboard (chaos-garden-web/src/app/globals.css).
OUTCOME_COLORS = {
    "ok": "#2e7d4f",
    "slow": "#c27c00",
    "error": "#b83a3a",
    "corrupt": "#0083a3",
    "drop": "#6a4fb3",
    "other": "#c75b98",
}
OUTCOME_ORDER = ["ok", "slow", "error", "corrupt", "drop", "other"]

panels = []
next_id = 1


def add(panel, x, y, w, h):
    global next_id
    panel.update({"id": next_id, "gridPos": {"x": x, "y": y, "w": w, "h": h}, "datasource": DS})
    next_id += 1
    panels.append(panel)


def row(title, y):
    global next_id
    panels.append({"id": next_id, "type": "row", "title": title, "collapsed": False, "gridPos": {"x": 0, "y": y, "w": 24, "h": 1}, "panels": []})
    next_id += 1


def timeseries(title, description, targets, unit, stacked=False, overrides=None):
    return {
        "type": "timeseries",
        "title": title,
        "description": description,
        "targets": [{"refId": chr(65 + i), "datasource": DS, "expr": expr, "legendFormat": legend} for i, (expr, legend) in enumerate(targets)],
        "fieldConfig": {
            "defaults": {
                "unit": unit,
                "min": 0,
                "custom": {
                    "drawStyle": "line",
                    "lineWidth": 2,
                    "fillOpacity": 60 if stacked else 10,
                    "stacking": {"mode": "normal" if stacked else "none", "group": "A"},
                    "showPoints": "never",
                    "spanNulls": True,
                },
            },
            "overrides": overrides or [],
        },
        "options": {"legend": {"displayMode": "list", "placement": "bottom", "showLegend": True}, "tooltip": {"mode": "multi", "sort": "none"}},
    }


def stat(title, description, expr, unit, thresholds):
    return {
        "type": "stat",
        "title": title,
        "description": description,
        "targets": [{"refId": "A", "datasource": DS, "expr": expr, "instant": True}],
        "fieldConfig": {"defaults": {"unit": unit, "thresholds": {"mode": "absolute", "steps": thresholds}}, "overrides": []},
        "options": {"reduceOptions": {"calcs": ["lastNotNull"], "fields": "", "values": False}, "colorMode": "value", "graphMode": "none", "textMode": "value"},
    }


def color_override(name, color):
    return {"matcher": {"id": "byName", "options": name}, "properties": [{"id": "color", "value": {"mode": "fixed", "fixedColor": color}}]}


http_count = "http_server_requests_seconds_count"

row("Overview: every service (RED: rate, errors, duration)", 0)
add(timeseries("Requests per second", "HTTP requests handled, by service. Scrapes and health checks are not counted.",
               [(f"sum by (service) (rate({http_count}[{RI}]))", "{{service}}")], "reqps"), 0, 1, 8, 8)
add(timeseries("Server errors (5xx share)", "Share of responses with a 5xx status. The proxy's share includes injected error faults, which are intended.",
               [(f'sum by (service) (rate({http_count}{{status_code=~"5.."}}[{RI}])) / sum by (service) (rate({http_count}[{RI}]))', "{{service}}")], "percentunit"), 8, 1, 8, 8)
add(timeseries("Latency, 95th percentile", "95% of requests finished faster than this. The proxy's includes injected delays.",
               [(f"histogram_quantile(0.95, sum by (le, service) (rate(http_server_requests_seconds_bucket[{RI}])))", "{{service}}")], "s"), 16, 1, 8, 8)

row("Proxy", 9)
fold = f'label_replace(rate(chaos_proxy_requests_total[{RI}]), "outcome", "other", "outcome", "target_error|no_response|rate_limited")'
add(timeseries("Proxied requests by outcome", "Stacked. \"other\" is an error from the target, no response, or refused by a garden's rate limit (the same grouping as the web dashboard).",
               [(f"sum by (outcome) ({fold})", "{{outcome}}")], "reqps", stacked=True,
               overrides=[color_override(o, OUTCOME_COLORS[o]) for o in OUTCOME_ORDER]), 0, 10, 12, 8)
add(timeseries("Rate limit decisions", "allowed, limited (429), or skipped (Redis unavailable or limiting off: the proxy fails open).",
               [(f"sum by (decision) (rate(chaos_proxy_rate_limit_decisions_total[{RI}]))", "{{decision}}")], "reqps"), 12, 10, 6, 8)
add(timeseries("Target response time, 95th percentile", "Time until the target's response headers, without injected delays.",
               [(f'histogram_quantile(0.95, sum by (le) (rate(chaos_proxy_upstream_seconds_bucket{{result="response"}}[{RI}])))', "p95"),
                (f'sum(rate(chaos_proxy_upstream_seconds_count{{result!="response"}}[{RI}])) or vector(0)', "failed or timed out, per second")], "s"), 18, 10, 6, 8)
add(stat("Request events dropped", "Events the proxy could not hand to Redis in the selected time range. Above 0 means request logs are missing entries.",
         'sum(increase(chaos_proxy_events_total{result="dropped"}[$__range])) or vector(0)', "short",
         [{"color": "green", "value": None}, {"color": "red", "value": 1}]), 0, 18, 6, 5)
add(stat("Config cache hit rate", "Share of requests whose garden config came from the proxy's short cache instead of the control API.",
         f'sum(rate(chaos_proxy_config_lookups_total{{result="hit"}}[$__range])) / sum(rate(chaos_proxy_config_lookups_total[$__range]))', "percentunit",
         [{"color": "text", "value": None}]), 6, 18, 6, 5)

row("Ingest service", 23)
add(timeseries("Events processed", "stored (new), duplicate (already stored: a redelivery), dead_lettered (malformed, or failed too many times).",
               [(f"sum by (result) (rate(chaos_ingest_events_total[{RI}]))", "{{result}}")], "ops"), 0, 24, 8, 8)
add(timeseries("Consumer lag", "lag: events in the stream not read yet. pending: read but not acknowledged. Both should return to 0.",
               [("max(chaos_ingest_consumer_lag)", "lag"), ("max(chaos_ingest_consumer_pending)", "pending")], "short"), 8, 24, 8, 8)
add(timeseries("Batch time, 95th percentile, and failures", "Time to store and acknowledge one batch; failed batches are retried.",
               [(f"histogram_quantile(0.95, sum by (le) (rate(chaos_ingest_batch_seconds_bucket[{RI}])))", "p95 batch time"),
                (f"sum(rate(chaos_ingest_batch_failures_total[{RI}]))", "failed batches per second")], "s"), 16, 24, 8, 8)

row("Runtime", 32)
add(timeseries("Event loop lag, 99th percentile", "How long callbacks waited to run. Rising lag means the process is overloaded.",
               [("max by (service) (nodejs_eventloop_lag_p99_seconds)", "{{service}}")], "s"), 0, 33, 12, 7)
add(timeseries("Memory (resident)", "Memory used by each service's process.",
               [("sum by (service) (process_resident_memory_bytes)", "{{service}}")], "bytes"), 12, 33, 12, 7)

dashboard = {
    "uid": "chaos-garden",
    "title": "Chaos Garden",
    "description": "Rate, errors and duration for every service, plus proxy outcomes and ingest health.",
    "tags": ["chaos-garden"],
    "timezone": "browser",
    "schemaVersion": 39,
    "version": 1,
    "refresh": "15s",
    "time": {"from": "now-1h", "to": "now"},
    "editable": True,
    "panels": panels,
    "templating": {"list": []},
    "annotations": {"list": []},
}

out = pathlib.Path(__file__).parent / "dashboards" / "chaos-garden.json"
out.write_text(json.dumps(dashboard, indent=2) + "\n")
print(f"wrote {out} with {sum(1 for p in panels if p['type'] != 'row')} panels")
