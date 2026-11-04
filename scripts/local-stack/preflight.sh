# Fail-closed target check for the local-stack runners. Sourced BEFORE any psql/DDL.
# - The caller must confirm explicitly: EXIM_DISPOSABLE_CONFIRM=yes-disposable-local-instance
#   (no runner sets this variable itself).
# - Only a local instance is accepted: Unix socket (absolute host=/path or no host) or localhost/127.0.0.1/[::1].
#   One extra host may be allowed with EXIM_ALLOWED_DB_HOST (exact match) for a dedicated throwaway VM.
#   Hosted Supabase hosts (*.supabase.co, *.supabase.com, *pooler*) are always refused.
# - Admin URL must point at the maintenance database "postgres"; work databases must be named exim_*.
# The URL is never printed (it may contain a password).

exim_refuse() { echo "Refusing (local-stack preflight): $1" >&2; exit 2; }

exim_url_parts() {
  # sets EXIM_U_HOST EXIM_U_DB EXIM_U_QHOST from a postgres URL; refuses anything else
  local url="$1" rest auth hostport dbq
  case "$url" in postgres://*|postgresql://*) ;; *) exim_refuse "database URL must be postgres:// or postgresql://";; esac
  rest="${url#*://}"
  case "$rest" in */*) ;; *) exim_refuse "database URL has no database name";; esac
  auth="${rest%%/*}"; dbq="${rest#*/}"
  hostport="${auth##*@}"; [ "$hostport" = "$auth" ] && hostport="$auth"
  case "$auth" in *@*) ;; *) hostport="$auth";; esac
  EXIM_U_HOST="${hostport%:*}"; [ "$hostport" = "${hostport%:*}" ] && EXIM_U_HOST="$hostport"
  case "$hostport" in \[*\]*) EXIM_U_HOST="${hostport%%]*}]";; esac
  EXIM_U_DB="${dbq%%\?*}"
  EXIM_U_QHOST=""
  case "$dbq" in *\?*) EXIM_U_QHOST="$(printf '%s' "${dbq#*\?}" | tr '&' '\n' | sed -n 's/^host=//p' | head -1)";; esac
}

exim_host_ok() {
  local h="$1"
  case "$h" in *supabase.co*|*supabase.com*|*pooler*) return 1;; esac
  case "$h" in ""|localhost|127.0.0.1|"[::1]"|::1) return 0;; /*) return 0;; esac
  [ -n "${EXIM_ALLOWED_DB_HOST:-}" ] && [ "$h" = "$EXIM_ALLOWED_DB_HOST" ] && return 0
  return 1
}

exim_preflight() {
  # usage: exim_preflight admin|work "<url>"
  local kind="$1" url="$2"
  [ "${EXIM_DISPOSABLE_CONFIRM:-}" = "yes-disposable-local-instance" ] || \
    exim_refuse "set EXIM_DISPOSABLE_CONFIRM=yes-disposable-local-instance only for a throwaway local instance"
  [ -n "$url" ] || exim_refuse "database URL is empty"
  exim_url_parts "$url"
  exim_host_ok "$EXIM_U_HOST" || exim_refuse "host is not an allowed local/throwaway host"
  [ -z "$EXIM_U_QHOST" ] || exim_host_ok "$EXIM_U_QHOST" || exim_refuse "host= parameter is not an allowed local/throwaway host"
  if [ "$kind" = admin ]; then
    [ "$EXIM_U_DB" = "postgres" ] || exim_refuse "admin URL must point at the maintenance database 'postgres'"
  else
    printf '%s' "$EXIM_U_DB" | grep -Eq '^exim_[a-z0-9_]{1,50}$' || exim_refuse "work database must be named exim_<suffix>"
  fi
}
