#!/bin/sh
set -e
# Single-replica v1: migrations run at container start. Move to a one-off
# migration job before scaling replicas > 1.
alembic upgrade head
# --proxy-headers --forwarded-allow-ips="*" (GIN-22 I3): trust the Azure
# ingress proxy's X-Forwarded-For so Starlette rewrites request.client to the
# real caller IP -- otherwise every request looks like it came from the proxy
# and per-IP rate limiting (core/rate_limit.py) collapses to one global
# bucket. "*" trusts whatever proxy sits in front of this process; if a
# tighter trusted CIDR (the platform's known ingress range) becomes available,
# narrow --forwarded-allow-ips to it instead of "*".
exec uvicorn gigsnano_api.app:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips="*"
