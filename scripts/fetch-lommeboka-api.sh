#!/bin/bash
# Henter kun fra lommeboka.com/api/* — hardkodet host, tar imot path som eneste argument.
# Finnes for å kunne gi et cron-script curl-tilgang uten å åpne for vilkårlige URL-er.
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "Usage: $0 <api-path>  (e.g. 'finn-search?page=1' or 'finn?finnkode=123')" >&2
  exit 1
fi

path="$1"
case "$path" in
  finn-search*|finn\?finnkode=*)
    ;;
  *)
    echo "Rejected: only finn-search or finn?finnkode= paths are allowed" >&2
    exit 1
    ;;
esac

curl -sS -m 20 "https://lommeboka.com/api/${path}"
