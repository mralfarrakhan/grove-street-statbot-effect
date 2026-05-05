-- Migration number: 0004 	 2026-05-05T07:33:25.031Z
create table players_new (
    puuid text primary key,
    name text not null,
    tag text not null,
    discord_tag text not null default ""
);

-- 2. Copy data
insert into players_new (puuid, name, tag)
select puuid, name, tag
from players;

-- 3. Drop old table
drop table players;

-- 4. Rename new table
alter table players_new rename to players;