/*
    Migrate.js - OneTable Migrations
 */

import Fs from 'fs'
import Path from 'path'
import Semver from 'semver'

import { Model, Table } from "dynamodb-onetable";
// import {Table} from '../../onetable/dist/mjs/index.js'

const MigrationKey = '_Migration'
var Migration

export class Migrate {
    /*
        Construct the Migrate instance.
        The `config` parameter is either instance of Table() or params for Table.
        The `params.migrations` set to the in-memory migrations or `params.dir` to a migrations directory.
     */
    constructor(config = {}, params = {}) {
        this.config = config
        this.params = params
        this.helpers = params.helpers
        if (params.dir) {
            this.dir = Path.resolve(params.dir || '.')
        } else {
            this.migrations = params.migrations || []
        }
        /*
            If config is a OneTable instance, use it. Determine this by a 'setClient' method
         */
        this.log = params.log || {
            info: (...args) => console.log(args),
            error: (...args) => console.error(args),
        }
        this.db = typeof config.setClient != 'function' ? new Table(config) : config
    }

    /*
        Initialize and define standard models: Schema, Migration
    */
    async init() {
        await this.db.setSchema()
        Migration = await this.db.getModel(MigrationKey)
    }

    /*
        action can be: down, reset, up, repeat, or any other name
     */
    async apply(action, version, options = {}) {
        let db = this.db
        let versions = await this.getSemVersions()
        let currentVersion = await this.getCurrentVersion()

        this.log.info(`Run migration "${action}"`, {action, versions, version})
        let migration

        if (action == 'reset' || action === 0) {
            await this.invokeMigration('up', 'reset', options)
            if (!options.dry) {
                //  Recreate all migration entries
                await Migration.remove({}, {many: true, hidden: true})

                for (let v of versions) {
                    migration = await this.loadMigration(v)
                    await Migration.create({
                        date: new Date(),
                        description: migration.description,
                        path: migration.path,
                        version: migration.version,
                        status: 'success',
                    })
                }
            }

        } else if (action == 'up' || action === 1 || action == 'repeat' || action === 2) {
            let found
            for (let v of versions) {
                if (Semver.compare(v, currentVersion) <= 0) {
                    continue
                }
                if (Semver.compare(v, version) > 0) {
                    break
                }
                found = Semver.compare(v, version) == 0
                migration = await this.invokeMigration('up', v, options)
            }
            if (!found) {
                throw new Error(`Cannot find target migration ${version}`)
            }

        } else if (action == 'down' || action === -1) {
            let pastMigrations = await this.getPastMigrations()

            let found
            for (let v of versions.reverse()) {
                if (Semver.compare(v, currentVersion) > 0) {
                    continue
                }
                if (Semver.compare(v, version) < 0) {
                    break
                }
                found = Semver.compare(v, version) == 0
                migration = await this.invokeMigration('down', v, options)

                if (!options.dry) {
                    migration = pastMigrations.reverse().find((m) => m.version == v)
                    if (migration) {
                        await Migration.remove(migration)
                    }
                }
                migration = await this.getCurrentVersion()
                migration = await this.loadMigration(currentVersion)
                if (!options.dry && migration.schema) {
                    await db.saveSchema(migration.schema)
                }
            }
            if (!found) {
                throw new Error(`Cannot find target migration ${version}`)
            }
        } else {
            //  Named migration
            migration = await this.invokeMigration('up', action, options)
        }
        return migration
    }

    async invokeMigration(action, v, options) {
        let db = this.db
        let migration
        try {
            if (v === 0) {
                //  RESET DEPRECATE
                migration = await this.loadMigration('latest')
            } else {
                migration = await this.loadMigration(v)
            }
            await this.db.setSchema(migration.schema)
            await migration[action](db, this, options)

            if (!options.dry) {
                await this.updateTable(migration, action, v, 'success')
            }
            return migration
        } catch (err) {
            if (migration && !options.dry) {
                await this.updateTable(migration, action, v, err.message)
            }
            throw err
        }
    }

    async updateTable(migration, action, v, status = null) {
        let properties = {
            version: v,
            date: new Date(),
            path: migration.path,
            description: migration.description,
            status,
        }
        if (action == 'up' || action === 1 || action == 'reset' || action === 0) {
            await Migration.create(properties, {exists: null})
        } else if (action == 'repeat' || action === 2) {
            await Migration.update(properties, {exists: null})
        }
        if (migration.schema) {
            await this.db.saveSchema(migration.schema)
        }
    }

    /* public */
    //  Return all past migrations including named migrations
    async getPastMigrations() {
        return (await Migration.find({})).sort((a, b) => a.date - b.date)
    }

    async getPastVersions() {
        return (await Migration.find({})).map(m => m.version).filter(v => Semver.valid(v)).sort(Semver.compare)
    }

    //  DEPRECATE
    async findPastMigrations() {
        return await this.getPastMigrations()
    }

    /* public */
    async getCurrentVersion() {
        let versions = await this.getPastVersions()
        if (versions.length == 0) {
            return '0.0.0'
        }
        return versions.at(-1)
    }

    /*
        Return outstanding versions in semver sorted order up to the specified limit
        Does not include named migration versions
     */
    /* public */
    async getOutstandingVersions(limit = Number.MAX_SAFE_INTEGER) {
        let pastVersions = await this.getPastVersions()
        let versions = await this.getSemVersions()
        versions = versions.filter((v) => pastVersions.find((p) => p == v) == null)
        return versions.slice(0, limit)
    }

    /*
        Return outstanding migrations in semver sorted order up to the specified limit
        Does not include named migrations
     */
    /* public */
    async getOutstandingMigrations(limit = Number.MAX_SAFE_INTEGER) {
        let versions = await this.getOutstandingVersions(limit)
        let migrations = []
        for (let v of versions) {
            migrations.push(await this.loadMigration(v))
        }
        return migrations
    }

    /*
        Return the list of available named migrations (non-semver)
     */
    /* public */
    async getNamedVersions(limit = Number.MAX_SAFE_INTEGER) {
        return (await this.getVersions()).filter((version) => !Semver.valid(version)).slice(0, limit)
    }

    /* 
        Get the full list of available (migration) versions. This will return the names of 
        versioned and named migrations.
    */
    /* private */
    async getVersions() {
        let versions
        if (this.migrations) {
            versions = this.migrations.map((m) => m.version)
        } else {
            versions = Fs.readdirSync(this.dir).map((file) => file.replace(/\.[^/.]+$/, ''))
        }
        return versions
    }

    /* private */
    //  Get the list of semantic versions available.
    async getSemVersions() {
        return (await this.getVersions()).filter((version) => Semver.valid(version)).sort(Semver.compare)
    }

    /* private */
    /*
        Load a migration and set its schema. Return the migration (modified)
    */
    async loadMigration(name) {
        let path, migration
        if (this.migrations) {
            migration = this.migrations.find((m) => m.version == name)
        } else {
            path = `${this.dir}/${name}.js`
            migration = (await import(path)).default
        }
        if (!migration) {
            throw new Error(`Cannot find migration "${name}"`)
        }
        if (!migration.schema) {
            throw new Error(`Migration "${name}" is missing a schema`)
        }
        if (!migration.version) {
            throw new Error(`Migration "${version}" is missing a version property`)
        }
        return {
            description: migration.description,
            down: migration.down,
            path: path || 'memory',
            schema: migration.schema,
            up: migration.up,
            version: name,
        }
    }
}
