-- Migration number: 0002 	 2026-04-30T17:58:24.015Z
-- 1. Create new table with correct schema
create table players_new (
    puuid text primary key,
    name text not null,
    tag text not null
);

-- 2. Copy data
insert into players_new (puuid, name, tag)
select puuid, name, tag
from players;

-- 3. Drop old table
drop table players;

-- 4. Rename new table
alter table players_new rename to players;
