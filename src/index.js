/*
    Migrate.js - OneTable Migrations
 */

import Fs from 'fs'
import Path from 'path'
import Semver from 'semver'
import { Model, Table } from 'dynamodb-onetable'

// DEV
// import { Model, Table } from '../../onetable/dist/mjs/index.js'

//  Cache of key and delimiter information per table
const TableCache = {}

export class Migrate {
    /*
        Construct the Migrate instance.
        The `config` parameter is either instance of Table() or params for Table.
        The `params.migrations` set to the in-memory migrations or `params.dir` to a migrations directory.
     */
    constructor(config = {}, params = {}) {
        this.params = params
        this.migrations = params.migrations
        this.dir = Path.resolve(params.dir || '.')
        this.db = (typeof config.setClient != 'function') ? new Table(config) : config
    }

    async getTableInfo() {
        let db = this.db
        let info = TableCache[db.name]
        if (info && info.updated > (Date.now() - 60 * 1000)) {
            return info
        }
        let data = await db.describeTable()
        info = {}
        for (let key of data.Table.KeySchema) {
            let type = key.KeyType.toLowerCase() == 'hash' ? 'hash' : 'sort'
            info[type] = key.AttributeName
        }
        if (!info.sort) {
            throw new Error('Cannot use Migrate library on a table without a sort/range key')
        }
        info.updated = Date.now()
        TableCache[db.name] = info
        return info
    }

    async getModel() {
        let db = this.db
        let info = await this.getTableInfo()
        //  Read the schema to update the Table() params
        let schema = await db.readSchema()
        if (schema) {
            db.setSchema(schema)
        }
        return this.db.getModel('_Migration')
    }

    /*
        Invoke a migration. Method is up or down.
        This will set the schema if the migration defines one and will persist the schema to the table after the migration.
    */
    async invoke(migration, method) {
        let db = this.db
        if (migration.schema) {
            db.setSchema(migration.schema)
        }
        await migration[method](db, this)

        if (method == 'down') {
            let current = await this.loadMigration(await this.getCurrentVersion())
            if (current.schema || migration.schema) {
                await db.saveSchema(current.schema || migration.schema)
            }
        } else if (migration.schema) {
            db.saveSchema(migration.schema)
        }
    }

    /* public */
    async apply(direction, version) {
        let db = this.db
        let Migration = await this.getModel()
        let migration
        if (direction == 0) {
            //  Reset to zero
            await Migration.remove({}, {many: true})

            //  Create prior migration items
            let versions = await this.getVersions()
            version = versions.pop()

            for (let v of versions) {
                migration = await this.loadMigration(v)
                await Migration.create({
                    version: v,
                    date: new Date(),
                    path: migration.path,
                    description: migration.description,
                })
            }
        }

        migration = await this.loadMigration(version)
        if (direction < 0) {
            await this.invoke(migration, 'down')
            await Migration.remove({version: migration.version})

        } else {
            //  Up, repeat or reset
            await this.invoke(migration, 'up')
            let params = {
                version,
                date: new Date(),
                path: migration.path,
                description: migration.description,
            }
            if (direction <= 1) {
                await Migration.create(params)
            } else {
                await Migration.update(params)
            }
        }
        return migration
    }

    /* public */
    async findPastMigrations() {
        let Migration = await this.getModel()
        let pastMigrations = await Migration.find({})
        this.sortMigrations(pastMigrations)
        return pastMigrations
    }

    /* public */
    async getCurrentVersion() {
        let pastMigrations = await this.findPastMigrations()
        if (pastMigrations.length == 0) {
            return '0.0.0'
        }
        return pastMigrations[pastMigrations.length - 1].version
    }

    /*
        Return outstanding versions in semver sorted order up to the specified limit
     */
    /* public */
    async getOutstandingVersions(limit = Number.MAX_SAFE_INTEGER) {
        let current = await this.getCurrentVersion()
        let pastMigrations = await this.findPastMigrations()

        let versions = await this.getVersions()
        versions = versions.filter(version => {
            return Semver.compare(version, current) > 0
        }).sort(Semver.compare)

        versions = versions.filter(v => pastMigrations.find(m => m.version == v) == null)
        return versions.slice(0, limit)
    }

    /*
        Return outstanding migrations in semver sorted order up to the specified limit
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

    /* private */
    async getVersions() {
        let versions
        if (this.migrations) {
            versions = this.migrations.map(m => m.version)
        } else {
            versions = Fs.readdirSync(this.dir).map(file => file.replace(/\.[^/.]+$/, ''))
        }
        return versions.filter(version => { return Semver.valid(version) }).sort(Semver.compare)
    }

    /* private */
    async loadMigration(version) {
        let path, task
        if (this.migrations) {
            task = this.migrations.find(m => m.version == version)
        } else {
            path = `${this.dir}/${version}.js`
            task = (await import(path)).default
        }
        if (!task) {
            throw new Error(`Cannot find migration for version ${version}`)
        }
        if (!task.schema) {
            throw new Error(`Migration ${version} is missing a schema`)
        }
        if (!task.version) {
            throw new Error(`Migration ${version} is missing a version property`)
        }
        return {
            version,
            description: task.description,
            path: path || 'memory',
            schema: task.schema,
            up: task.up,
            down: task.down,
        }
    }

    /* private */
    sortMigrations(array) {
        array.sort((a, b) => {
            let cmp = Semver.compare(a.version, b.version)
            if (cmp < 0) {
                return cmp
            } else if (cmp > 0) {
                return cmp
            } else if (a.order < b.order) {
                return -1
            } else if (a.order > b.order) {
                return 1
            } else {
                return 0
            }
        })
    }
}
