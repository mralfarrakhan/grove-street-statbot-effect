-- Migration number: 0003 	 2026-05-05T06:53:53.027Z
-- 1. Create new table with correct schema
create table players_new (
    puuid text primary key,
    name text not null,
    tag text not null,
    discord_tag text not null
);

-- 2. Copy data
insert into players_new (puuid, name, tag)
select puuid, name, tag
from players;

-- 3. Drop old table
drop table players;

-- 4. Rename new table
alter table players_new rename to players;