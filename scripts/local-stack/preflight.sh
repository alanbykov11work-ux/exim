# Fail-closed target check for the local-stack runners. Sourced BEFORE any psql/pg_dump/pg_restore.
#
# Accepted URL form (strict allowlist, no general URI parsing):
#   postgres[ql]://[user[:password]@][host][:port]/dbname[?host=<socket dir>|<local name>][&port=<digits>]
#   user   [A-Za-z0-9_.-]+          host  localhost | 127.0.0.1 | [::1] | exactly $EXIM_ALLOWED_DB_HOST | empty
#   port   digits                   dbname [A-Za-z0-9_]+ ("postgres" for admin, exim_* for work)
#   query  only host= and port=, each at most once; host= only an absolute socket path or a local name;
#          authority host and host= are not combined. Anything else (hostaddr, dbname, service, options,
#          sslmode, ..., duplicates, percent-encoding, fragments) is refused.
# Inherited libpq connection variables that can change the destination are refused:
#   PGHOST PGHOSTADDR PGDATABASE PGSERVICE PGSERVICEFILE PGSYSCONFDIR PGPASSFILE PGPORT.
# The caller must confirm explicitly: EXIM_DISPOSABLE_CONFIRM=yes-disposable-local-instance (no runner sets it).
# Hosted Supabase hosts are always refused. The URL and password are never printed.

exim_refuse() { echo "Refusing (local-stack preflight): $1" >&2; exit 2; }

exim_local_name() {
  case "$1" in localhost|127.0.0.1|"[::1]") return 0;; esac
  case "$1" in *supabase.co*|*supabase.com*|*pooler*) return 1;; esac
  [ -n "${EXIM_ALLOWED_DB_HOST:-}" ] && [ "$1" = "$EXIM_ALLOWED_DB_HOST" ] && return 0
  return 1
}

exim_preflight() {
  # usage: exim_preflight admin|work "<url>"
  local kind="$1" url="$2" v
  [ "${EXIM_DISPOSABLE_CONFIRM:-}" = "yes-disposable-local-instance" ] || \
    exim_refuse "set EXIM_DISPOSABLE_CONFIRM=yes-disposable-local-instance only for a throwaway local instance"
  for v in PGHOST PGHOSTADDR PGDATABASE PGSERVICE PGSERVICEFILE PGSYSCONFDIR PGPASSFILE PGPORT; do
    [ -z "${!v:-}" ] || exim_refuse "inherited libpq variable $v can change the target; unset it"
  done
  [ -n "$url" ] || exim_refuse "database URL is empty"
  case "$url" in *%*|*#*|*\ *|*$'\n'*) exim_refuse "percent-encoding, fragments and whitespace are not accepted";; esac

  local re='^postgres(ql)?://(([A-Za-z0-9_.-]+)(:[^@/?]*)?@)?(\[::1\]|[A-Za-z0-9.-]*)(:([0-9]{1,5}))?/([A-Za-z0-9_]+)(\?(.*))?$'
  [[ "$url" =~ $re ]] || exim_refuse "database URL is not in the accepted form"
  local host="${BASH_REMATCH[5]}" db="${BASH_REMATCH[8]}" query="${BASH_REMATCH[10]}"
  [ -z "$host" ] || exim_local_name "$host" || exim_refuse "host is not an allowed local/throwaway host"

  local qhost="" qport="" seen="" pair key val
  if [ -n "$query" ]; then
    local IFS='&'
    for pair in $query; do
      [[ "$pair" == *=* ]] || exim_refuse "query parameter without a value"
      key="${pair%%=*}"; val="${pair#*=}"
      case " $seen " in *" $key "*) exim_refuse "duplicate query parameter";; esac
      seen="$seen $key"
      case "$key" in
        host) qhost="$val";;
        port) [[ "$val" =~ ^[0-9]{1,5}$ ]] || exim_refuse "port= must be digits"; qport="$val";;
        *) exim_refuse "query parameter '$key' is not allowed";;
      esac
    done
    unset IFS
  fi
  if [ -n "$qhost" ]; then
    [ -z "$host" ] || exim_refuse "authority host and host= cannot be combined"
    if [[ "$qhost" == /* ]]; then
      [[ "$qhost" =~ ^/[A-Za-z0-9._/-]+$ ]] || exim_refuse "host= socket path has unsupported characters"
    else
      exim_local_name "$qhost" || exim_refuse "host= is not an allowed local/throwaway host"
    fi
  fi

  if [ "$kind" = admin ]; then
    [ "$db" = "postgres" ] || exim_refuse "admin URL must point at the maintenance database 'postgres'"
  else
    [[ "$db" =~ ^exim_[a-z0-9_]{1,50}$ ]] || exim_refuse "work database must be named exim_<suffix>"
  fi
}
