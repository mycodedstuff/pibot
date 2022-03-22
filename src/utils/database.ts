import * as sqlite from "sqlite3"

// Single instance
export const instance = new (sqlite.verbose()).Database('./db.sqlite')

// Construct schemas
export const serialize = () => {
  instance.serialize(function () {
    instance.run("create table if not exists downloads (id text)")
  });
}
