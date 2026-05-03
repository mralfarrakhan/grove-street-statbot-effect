-- Migration number: 0001 	 2026-04-30T17:20:26.464Z
create table if not exists players (
    puuid text,
    name text not null,
    tag text not null
);
