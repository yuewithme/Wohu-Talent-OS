#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
gateway=wohu-talent-os
network=wohu-resume-sync_default
docker inspect "$gateway" >/dev/null
docker network inspect "$network" >/dev/null
mkdir -p server/data/gateway-backups
backup="server/data/gateway-backups/nginx-$(date -u +%Y%m%dT%H%M%SZ).conf"
docker cp "$gateway:/etc/nginx/conf.d/default.conf" "$backup"
if ! docker inspect --format '{{json .NetworkSettings.Networks}}' "$gateway" | grep -Fq "\"$network\""; then
    docker network connect "$network" "$gateway"
fi
docker cp server/gateway-18083.conf "$gateway:/etc/nginx/conf.d/default.conf"
if ! docker exec "$gateway" nginx -t; then
    docker cp "$backup" "$gateway:/etc/nginx/conf.d/default.conf"
    exit 1
fi
docker exec "$gateway" nginx -s reload
printf '18083 gateway connected; backup: %s\n' "$backup"
