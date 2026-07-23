"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type EximUser = {
  id: string;
  email: string;
  role: string;
  fullName: string;
  company: string;
  phone: string;
  bin: string;
  verified: boolean;
};

declare global {
  interface Window {
    __EXIM?: EximUser & { role: string };
    __EXIM_LOGOUT?: () => void;
    __EXIM_BOOTED?: boolean;
    __EXIM_DOCS?: {
      list: (
        folder: string
      ) => Promise<{ name: string; created_at?: string | null }[]>;
      upload: (file: File, folder: string) => Promise<void>;
      signedUrl: (path: string) => Promise<string>;
      remove: (path: string) => Promise<void>;
    };
  }
}

/** Ключи состояния приложения, синхронизируемые с облаком */
const SYNC_PREFIX = "exim-";

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("failed to load " + src));
    document.body.appendChild(s);
  });
}

function loadCss(href: string): Promise<void> {
  return new Promise((resolve) => {
    if (document.querySelector(`link[href="${href}"]`)) return resolve();
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = href;
    l.onload = () => resolve();
    l.onerror = () => resolve();
    document.head.appendChild(l);
  });
}

export default function EximApp({ user }: { user: EximUser }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    // Скрипты SPA объявляют глобальные const — повторная инициализация
    // возможна только через полную перезагрузку страницы.
    if (window.__EXIM_BOOTED) {
      window.location.reload();
      return;
    }
    window.__EXIM_BOOTED = true;

    const supabase = createClient();
    let cancelled = false;

    // --- глобальный мост для SPA ---
    window.__EXIM = { ...user };
    (window as unknown as { __SUPA: unknown }).__SUPA = supabase;
    window.__EXIM_LOGOUT = async () => {
      try {
        await supabase.auth.signOut();
      } finally {
        window.location.href = "/login";
      }
    };

    // --- документы (Supabase Storage, приватный бакет documents) ---
    // Ключи Storage не принимают кириллицу — транслитерируем имя файла
    const TR: Record<string, string> = {
      а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh",
      з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o",
      п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts",
      ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu",
      я: "ya", қ: "k", ғ: "g", ң: "n", ү: "u", ұ: "u", һ: "h", ө: "o",
      ә: "a", і: "i",
    };
    const sanitize = (n: string) =>
      n
        .toLowerCase()
        .split("")
        .map((ch) => (TR[ch] !== undefined ? TR[ch] : ch))
        .join("")
        .replace(/[^a-z0-9.\-_]+/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_+|_+$/g, "") || "file";
    window.__EXIM_DOCS = {
      async list(folder: string) {
        const { data, error } = await supabase.storage
          .from("documents")
          .list(`${user.id}/${folder}`, {
            sortBy: { column: "created_at", order: "desc" },
          });
        if (error) throw error;
        return (data ?? []).filter((f) => f.name !== ".emptyFolderPlaceholder");
      },
      async upload(file: File, folder: string) {
        const path = `${user.id}/${folder}/${Date.now()}_${sanitize(file.name)}`;
        const { error } = await supabase.storage
          .from("documents")
          .upload(path, file, { upsert: false });
        if (error) throw error;
      },
      async signedUrl(path: string) {
        const { data, error } = await supabase.storage
          .from("documents")
          .createSignedUrl(`${user.id}/${path}`, 300);
        if (error || !data?.signedUrl) throw error ?? new Error("no url");
        return data.signedUrl;
      },
      async remove(path: string) {
        const { error } = await supabase.storage
          .from("documents")
          .remove([`${user.id}/${path}`]);
        if (error) throw error;
      },
    };

    // --- очередь синхронизации localStorage → Supabase ---
    const timers: Record<string, ReturnType<typeof setTimeout>> = {};
    function queueSync(key: string, raw: string) {
      clearTimeout(timers[key]);
      timers[key] = setTimeout(async () => {
        try {
          await supabase.from("user_state").upsert({
            user_id: user.id,
            key,
            value: { v: raw },
          });
          if (key === SYNC_PREFIX + "profile") {
            // зеркалим основные поля профиля в таблицу profiles
            try {
              const p = JSON.parse(raw);
              await supabase
                .from("profiles")
                .update({
                  full_name: p.name ?? undefined,
                  company: p.company ?? undefined,
                  phone: p.phone ?? undefined,
                  bin: p.bin ?? undefined,
                })
                .eq("id", user.id);
            } catch {}
          }
        } catch (e) {
          console.warn("[exim-sync] upsert failed", key, e);
        }
      }, 700);
    }

    async function boot() {
      try {
        // версия сборки: кэш живёт между заходами, сбрасывается при деплое
        const V = "?v=" + (process.env.NEXT_PUBLIC_BUILD_TS || "1");

        // стили, состояние и разметка грузятся ПАРАЛЛЕЛЬНО
        const [, stateRes, htmlText] = await Promise.all([
          loadCss("/exim/app.css" + V),
          supabase.from("user_state").select("key, value"),
          fetch("/exim/body.html" + V).then((r) => r.text()),
        ]);
        const { data: rows, error: qErr } = stateRes;
        if (qErr) throw new Error("Не удалось загрузить данные: " + qErr.message);

        // очищаем чужие/старые локальные данные
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const k = localStorage.key(i);
          if (k && k.startsWith(SYNC_PREFIX)) localStorage.removeItem(k);
        }
        for (const row of rows ?? []) {
          const v = (row.value as { v?: string })?.v;
          if (typeof v === "string") localStorage.setItem(row.key, v);
        }

        // 3) профиль: если в облаке ещё нет — заполняем из таблицы profiles
        if (!localStorage.getItem(SYNC_PREFIX + "profile")) {
          localStorage.setItem(
            SYNC_PREFIX + "profile",
            JSON.stringify({
              name: user.fullName,
              company: user.company,
              phone: user.phone,
              email: user.email,
              bin: user.bin,
              role:
                user.role === "client"
                  ? "Клиент"
                  : user.role === "manager"
                    ? "Менеджер"
                    : user.role === "logist"
                      ? "Логист"
                      : "Администратор",
            })
          );
        }

        // 4) перехват записей: всё, что SPA пишет в localStorage, уходит в облако
        const origSet = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key: string, value: string) {
          origSet.call(this, key, value);
          if (this === window.localStorage && key.startsWith(SYNC_PREFIX)) {
            queueSync(key, value);
          }
        };

        if (cancelled) return;

        // 5) разметка приложения (уже загружена параллельно)
        if (hostRef.current) hostRef.current.innerHTML = htmlText;

        // 6) скрипты: Leaflet → логика приложения, затем модули параллельно
        await loadScript("/exim/leaflet.js" + V);
        await loadScript("/exim/app.js" + V);
        await Promise.all([
          loadScript("/exim/workflow.js" + V),
          loadScript("/exim/modules.js" + V),
          loadScript("/exim/crm.js" + V),
        ]);

        if (!cancelled) setBooting(false);
      } catch (e) {
        console.error(e);
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Ошибка запуска приложения");
      }
    }

    boot();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {booting && !error && (
        <div className="app-boot app-boot-dark">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-white.png" alt="EXIM" style={{ height: 40 }} />
          <div className="boot-bar">
            <div className="boot-bar-fill" />
          </div>
          <div className="t">Загружаем рабочее пространство</div>
        </div>
      )}
      {error && (
        <div className="app-boot">
          <div className="auth-msg error" style={{ maxWidth: 420 }}>
            {error}
          </div>
          <button
            className="btn btn-primary"
            style={{ padding: "10px 18px" }}
            onClick={() => window.location.reload()}
          >
            Повторить
          </button>
        </div>
      )}
      <div ref={hostRef} />
    </>
  );
}
