# TASK-2026-001 — Wave 3f: фото и документы к заявке (REQ-001)

Миграция: `supabase/foundation_wave_3f_attachments.sql` (после 3e; нужен Supabase Storage).

- Приватный бакет `request-files`: до 20 МБ, только JPG/PNG/WEBP/HEIC/PDF/XLSX/DOCX. Путь `<workspace>/<order>/<uuid>-<имя>`.
- Загрузка: клиент своей компании — пока заявка редактируема (draft…calculated); менеджер — до `converted`. Логист — только чтение. Чтение — всем, кто видит заявку. Изменять и удалять файлы нельзя (политик UPDATE/DELETE нет).
- `order_attachments` + `register_attachment(order, path, name)`: файл должен лежать в папке заявки и быть загружен самим вызывающим; тип и размер берутся из Storage, а не от клиента. Повторная регистрация не создаёт дубль.
- UI: блок «Фото и документы» в карточке заявки и в черновике (после первого сохранения); открытие по ссылке на 5 минут.
- Тест: `test/foundation-wave-3f-db.test.mjs` (Storage замокан: buckets, objects, foldername). Preview — BLOCKED (нет staging).
- Не сделано (по разделу документов ТЗ): антивирусная проверка и карантин, checksum, версии документа — нужен серверный обработчик; публикация документов клиенту отдельно от внутренних.
- Откат: `git revert`; в БД — `drop policy request_files_insert on storage.objects`. Бакет и файлы не удалять.
