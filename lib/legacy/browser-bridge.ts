"use client";

type Result = { data: unknown; error: null | { message: string } };
type Row = Record<string, unknown>;

let snapshotPromise: Promise<Record<string, Row[]>> | null = null;

async function snapshot() {
  if (!snapshotPromise) {
    snapshotPromise = fetch("/api/workflow/snapshot", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Не удалось загрузить данные рабочего процесса.");
        const body = await response.json();
        return body.data as Record<string, Row[]>;
      })
      .catch((error) => {
        snapshotPromise = null;
        throw error;
      });
  }
  return snapshotPromise;
}

class ReadQuery implements PromiseLike<Result> {
  private filters: Array<(row: Row) => boolean> = [];
  private orderBy: { key: string; ascending: boolean } | null = null;
  private maxRows: number | null = null;
  private one = false;

  constructor(private table: string) {}
  select() { return this; }
  eq(key: string, value: unknown) { this.filters.push((row) => row[key] === value); return this; }
  in(key: string, values: unknown[]) { this.filters.push((row) => values.includes(row[key])); return this; }
  order(key: string, options?: { ascending?: boolean }) { this.orderBy = { key, ascending: options?.ascending !== false }; return this; }
  limit(value: number) { this.maxRows = Math.max(0, Math.min(500, value)); return this; }
  single() { this.one = true; return this; }
  then<TResult1 = Result, TResult2 = never>(
    onfulfilled?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ) {
    const promise = snapshot().then((tables): Result => {
      let rows = [...(tables[this.table] || [])].filter((row) => this.filters.every((filter) => filter(row)));
      if (this.orderBy) {
        const { key, ascending } = this.orderBy;
        rows.sort((a, b) => String(a[key] ?? "").localeCompare(String(b[key] ?? "")) * (ascending ? 1 : -1));
      }
      if (this.maxRows !== null) rows = rows.slice(0, this.maxRows);
      return { data: this.one ? rows[0] ?? null : rows, error: null };
    });
    return promise.then(onfulfilled, onrejected);
  }
}

class UnsupportedQuery implements PromiseLike<Result> {
  select() { return this; }
  eq() { return this; }
  in() { return this; }
  order() { return this; }
  limit() { return this; }
  single() { return this; }
  then<TResult1 = Result, TResult2 = never>(
    onfulfilled?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ) {
    return Promise.resolve<Result>({
      data: null,
      error: { message: "Запись этого модуля ещё не подключена к новому серверу." },
    }).then(onfulfilled, onrejected);
  }
}

export function invalidateLegacySnapshot() {
  snapshotPromise = null;
}

export function createLegacyBrowserBridge() {
  const channel = {
    on() { return channel; },
    subscribe() { return channel; },
    unsubscribe() { return undefined; },
  };
  return {
    from(table: string) {
      return {
        select() { return new ReadQuery(table); },
        insert() { return new UnsupportedQuery(); },
        update() { return new UnsupportedQuery(); },
        upsert() { return new UnsupportedQuery(); },
      };
    },
    async rpc(name: string) {
      if (name === "unread_messages") return { data: 0, error: null };
      return { data: null, error: { message: "Операция ещё не перенесена на новый сервер." } };
    },
    channel() { return channel; },
    removeChannel() { return undefined; },
    storage: {
      from() {
        return {
          async upload() { return { data: null, error: { message: "Вложения чатов подключаются отдельно." } }; },
          async createSignedUrl() { return { data: null, error: { message: "Вложения чатов подключаются отдельно." } }; },
          async remove() { return { data: null, error: { message: "Вложения чатов подключаются отдельно." } }; },
        };
      },
    },
  };
}

