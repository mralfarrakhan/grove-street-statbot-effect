-- Migration number: 0006 	 2026-05-14T02:33:38.243Z

-- 1. Create new table with corrected schema
create table players_new (
    puuid text primary key,
    name text not null,
    tag text not null,
    discord_user_id text default ""
);

-- 2. Copy existing data
insert into players_new (puuid, name, tag)
select puuid, name, tag
from players;

-- 3. Drop old table
drop table players;

-- 4. Rename replacement table
alter table players_new rename to players;