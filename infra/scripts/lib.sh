#!/bin/bash
# infra/scripts 共通の関数。直接実行せず source する。
#
# USE_DOCKER=1 のとき、pg_dump / pg_restore / psql / aws を docker 経由で実行する。
# (手元の pg_dump のバージョンがサーバーより古いときなどに使う)
# その場合 localhost / 127.0.0.1 は host.docker.internal に読み替える。

PG_IMAGE="${PG_IMAGE:-postgres:17}"
AWS_IMAGE="${AWS_IMAGE:-amazon/aws-cli:2.17.0}"

log() { echo "[$(basename "$0")] $*" >&2; }
die() { log "エラー: $*"; exit 1; }

# docker 内から見える URL に読み替える
docker_host_url() {
  echo "$1" | sed -E 's#(@|//)(localhost|127\.0\.0\.1)([:/])#\1host.docker.internal\3#'
}

# URL を接続先として使える形にする(USE_DOCKER=1 のときだけ読み替える)
conn_url() {
  if [ "${USE_DOCKER:-0}" = "1" ]; then docker_host_url "$1"; else echo "$1"; fi
}

# URL のデータベース名だけを差し替える(クエリ文字列は無い前提)
url_with_db() {
  local url="$1" db="$2"
  echo "${url%/*}/$db"
}

# MOUNT_DIR をコンテナの /work にマウントして実行する
# 使い方: MOUNT_DIR=/path pg pg_dump ...
pg() {
  if [ "${USE_DOCKER:-0}" = "1" ]; then
    docker run --rm -i --user "$(id -u):$(id -g)" \
      --add-host=host.docker.internal:host-gateway \
      -v "${MOUNT_DIR:-$PWD}:/work" -w /work \
      "$PG_IMAGE" "$@"
  else
    "$@"
  fi
}

# ホストのパスをコンテナ内のパスに読み替える(MOUNT_DIR 直下のファイル)
work_path() {
  if [ "${USE_DOCKER:-0}" = "1" ]; then echo "/work/$(basename "$1")"; else echo "$1"; fi
}

# R2(S3 互換)のエンドポイント
r2_endpoint() {
  if [ -n "${R2_ENDPOINT:-}" ]; then
    echo "$R2_ENDPOINT"
  elif [ -n "${R2_ACCOUNT_ID:-}" ]; then
    echo "https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
  else
    die "R2_ENDPOINT または R2_ACCOUNT_ID を設定してください"
  fi
}

require_r2_env() {
  : "${R2_BUCKET:?R2_BUCKET を設定してください}"
  : "${R2_ACCESS_KEY_ID:?R2_ACCESS_KEY_ID を設定してください}"
  : "${R2_SECRET_ACCESS_KEY:?R2_SECRET_ACCESS_KEY を設定してください}"
  r2_endpoint >/dev/null
}

# aws cli を R2 向けに実行する。MOUNT_DIR をコンテナの /work にマウントする。
aws_r2() {
  local endpoint
  endpoint="$(r2_endpoint)"
  if command -v aws >/dev/null 2>&1 && [ "${USE_DOCKER:-0}" != "1" ]; then
    AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
      AWS_DEFAULT_REGION=auto AWS_REQUEST_CHECKSUM_CALCULATION=when_required \
      AWS_RESPONSE_CHECKSUM_VALIDATION=when_required \
      aws --endpoint-url "$endpoint" "$@"
  else
    docker run --rm -i --user "$(id -u):$(id -g)" \
      --add-host=host.docker.internal:host-gateway \
      -e AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" -e AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
      -e AWS_DEFAULT_REGION=auto -e AWS_REQUEST_CHECKSUM_CALCULATION=when_required \
      -e AWS_RESPONSE_CHECKSUM_VALIDATION=when_required \
      -v "${MOUNT_DIR:-$PWD}:/work" -w /work \
      "$AWS_IMAGE" --endpoint-url "$(docker_host_url "$endpoint")" "$@"
  fi
}
