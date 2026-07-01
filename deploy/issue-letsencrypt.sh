#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${DOMAIN:-}"
PUBLIC_IP="${PUBLIC_IP:-}"
ACME_EMAIL="${ACME_EMAIL:-admin@example.com}"
OPENRESTY_CONTAINER="${OPENRESTY_CONTAINER:-openresty}"
OPENRESTY_ROOT="${OPENRESTY_ROOT:-/opt/1panel/apps/openresty/openresty/root}"
OPENRESTY_SSL_DIR="${OPENRESTY_SSL_DIR:-/opt/1panel/apps/openresty/openresty/conf/ssl/${DOMAIN}}"
ACME_HOME="${ACME_HOME:-$HOME/.acme.sh}"

if [[ -z "${DOMAIN}" || -z "${PUBLIC_IP}" ]]; then
  echo "用法：DOMAIN=starlens.example.com PUBLIC_IP=<SERVER_PUBLIC_IP> bash deploy/issue-letsencrypt.sh" >&2
  echo "请显式传入 DOMAIN 和 PUBLIC_IP，避免示例值误用于真实环境。" >&2
  exit 1
fi

resolved_ip="$(dig +short "${DOMAIN}" A @1.1.1.1 | tail -n 1 || true)"
if [[ "${resolved_ip}" != "${PUBLIC_IP}" ]]; then
  echo "DNS 未生效：${DOMAIN} 当前解析为 '${resolved_ip:-空}'，期望 '${PUBLIC_IP}'。" >&2
  echo "请先在 Cloudflare 添加 A 记录后再重试。" >&2
  exit 1
fi

if [[ ! -x "${ACME_HOME}/acme.sh" ]]; then
  echo "未找到 acme.sh，正在安装。" >&2
  curl -fsSL https://get.acme.sh | sh -s "email=${ACME_EMAIL}"
fi

mkdir -p "${OPENRESTY_ROOT}/.well-known/acme-challenge" "${OPENRESTY_SSL_DIR}"
"${ACME_HOME}/acme.sh" --set-default-ca --server letsencrypt
"${ACME_HOME}/acme.sh" --issue -d "${DOMAIN}" --webroot "${OPENRESTY_ROOT}"
"${ACME_HOME}/acme.sh" --install-cert -d "${DOMAIN}" \
  --key-file "${OPENRESTY_SSL_DIR}/privkey.pem" \
  --fullchain-file "${OPENRESTY_SSL_DIR}/fullchain.pem" \
  --reloadcmd "docker exec ${OPENRESTY_CONTAINER} nginx -s reload"

echo "证书已安装到 ${OPENRESTY_SSL_DIR}，acme.sh cron 会自动续期。"
