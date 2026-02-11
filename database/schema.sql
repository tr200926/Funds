create trigger on_status_update_main
after update on "Facebook Data Pull —Main accounts"
for each row
execute function notify_webhook_on_status_update();

create trigger on_status_update_pasant
after update on "Facebook Data Pull —Pasant"
for each row
execute function notify_webhook_on_status_update();

create trigger on_status_update_xlerate
after update on "Facebook Data Pull —Xlerate"
for each row
execute function notify_webhook_on_status_update();

create trigger on_status_update_aligo
after update on "Facebook Data Pull —aligomarketing"
for each row
execute function notify_webhook_on_status_update();




create or replace function notify_webhook_on_status_update()
returns trigger
language plpgsql
as $$
declare
  payload jsonb;
begin
  -- اشتغل بس لو Status اتغير
  if new."Status" is distinct from old."Status" then

    payload := jsonb_build_object(
      'table', TG_TABLE_NAME,
      'Account name', coalesce(new."Account name", null),
      'Account ID', new."Account ID",
      'Status', new."Status",
      'old_status', old."Status",

      -- ✅ آمن على كل الجداول
      'massage_status', to_jsonb(new)->>'massage status',

      'Available funds', coalesce(new."Available funds", null),
      'daily_spending', coalesce(new."Daily spending", null),
      'Client Name', coalesce(new."Client Name", null),
      'Client number', coalesce(new."Client number", null),
      'updated_at', now()
    );

    perform http_post(
      '__REDACTED_N8N_WEBHOOK_URL__',
      payload::text,
      'application/json'
    );

  end if;

  return new;
end;
$$;




-- 1️⃣ إنشاء extension http لو مش موجودة
create extension if not exists http;

-- 2️⃣ إنشاء function تبعت البيانات للـ webhook
create or replace function notify_webhook_on_update()
returns trigger
language plpgsql
as $$
declare
  payload jsonb;
  account_id text;
begin

  -- ✅ التريجر يشتغل لو Available funds أو Status اتغيروا
  if
    new."Available funds" is distinct from old."Available funds"
    or new."Status" is distinct from old."Status"
  then

    -- 🔹 لو الجدول TikTok → استخدم Advertiser_id بدل Account ID
    if TG_TABLE_NAME = 'Tiktok accounts' then
      account_id := new."Advertiser_id";
    else
      account_id := new."Account ID";
    end if;

    -- 🧱 بناء JSON الأساسي (زي الكود القديم)
    payload := jsonb_build_object(
      'table', TG_TABLE_NAME,
      'Account name', coalesce(new."Account name", null),
      'Account ID', account_id,
      'Available funds', new."Available funds",
      'Status', coalesce(new."Status", null),
      'daily_spending', coalesce(new."Daily spending", null),
      'if', coalesce(new."if", null),
      'Client Name', coalesce(new."Client Name", null),
      'Client number', coalesce(new."Client number", null),
      'send IF', coalesce(new."send IF", null),
      'send helf', coalesce(new."send helf", null),
      'send zero', coalesce(new."send zero", null),
      'updated_at', now()
    );

    -- ✅ Message status (زي ما كانت قبل كده – optional)
    if exists (
      select 1
      from information_schema.columns
      where table_name = TG_TABLE_NAME
        and column_name = 'Massage status'
    ) then
      payload := payload || jsonb_build_object(
        'Massage status', new."Massage status"
      );
    end if;

    -- 🧩 لو الجدول TikTok أضف الأعمدة الإضافية (زي القديم)
    if TG_TABLE_NAME = 'Tiktok accounts' then

      if exists (
        select 1
        from information_schema.columns
        where table_name = 'Tiktok accounts'
          and column_name = 'BC-ID'
      ) then
        payload := payload || jsonb_build_object(
          'BC-ID', new."BC-ID"
        );
      end if;

      if exists (
        select 1
        from information_schema.columns
        where table_name = 'Tiktok accounts'
          and column_name = 'Advertiser name'
      ) then
        payload := payload || jsonb_build_object(
          'Advertiser name', new."Advertiser name"
        );
      end if;

    end if;

    -- 🚀 إرسال POST إلى Webhook
    perform http_post(
      '__REDACTED_N8N_WEBHOOK_URL__',
      payload::json::text,
      'application/json'
    );

  end if;

  return new;
end;
$$;

-- 3️⃣ حذف التريجرات القديمة
drop trigger if exists on_available_funds_update_pasant on "Facebook Data Pull —Pasant";
drop trigger if exists on_available_funds_update_aligo on "Facebook Data Pull —aligomarketing";
drop trigger if exists on_available_funds_update_main on "Facebook Data Pull —Main accounts";
drop trigger if exists on_available_funds_update_xlerate on "Facebook Data Pull —Xlerate";
drop trigger if exists on_available_funds_update_tiktok on "Tiktok accounts";

-- 4️⃣ إنشاء التريجرات (Available funds + Status)
create trigger on_available_funds_update_pasant
after update of "Available funds", "Status"
on "Facebook Data Pull —Pasant"
for each row execute function notify_webhook_on_update();

create trigger on_available_funds_update_aligo
after update of "Available funds", "Status"
on "Facebook Data Pull —aligomarketing"
for each row execute function notify_webhook_on_update();

create trigger on_available_funds_update_main
after update of "Available funds", "Status"
on "Facebook Data Pull —Main accounts"
for each row execute function notify_webhook_on_update();

create trigger on_available_funds_update_xlerate
after update of "Available funds", "Status"
on "Facebook Data Pull —Xlerate"
for each row execute function notify_webhook_on_update();

create trigger on_available_funds_update_tiktok
after update of "Available funds", "Status"
on "Tiktok accounts"
for each row execute function notify_webhook_on_update();
