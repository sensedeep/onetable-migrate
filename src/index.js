/*
    Migrate.js - OneTable Migrations
 */

import Fs from 'fs'
import Path from 'path'
import Semver from 'semver'
import { Model, Table } from 'dynamodb-onetable'

// DEV
// import { Model, Table } from '../../onetable/dist/mjs/index.js'

const MigrationKey = '_Migration'

export class Migrate {
    /*
        Construct the Migrate instance.
        The `config` parameter is either instance of Table() or params for Table.
        The `params.migrations` set to the in-memory migrations or `params.dir` to a migrations directory.
     */
    constructor(config = {}, params = {}) {
        this.config = config
        this.params = params
        this.migrations = params.migrations
        this.pastMigrations = null
        this.dir = Path.resolve(params.dir || '.')
        this.db = (typeof config.setClient != 'function') ? new Table(config) : config
    }

    /*
        Initialize and define standard models: Schema, Migration
    */
    async init() {
        await this.db.setSchema()
    }

    /* public */
    async apply(direction, version, params = {}) {
        let db = this.db
        let migration, model

        console.log(`Apply migration ${version} direction ${direction}`, params)

        if (direction == 0) {
            migration = await this.loadMigration('latest')
            model = db.getModel(MigrationKey)

            //  Remove all existing migrations
            if (!params.dry) {
                await model.remove({}, {many: true})
            }

            //  Create prior migration items (not last)
            let versions = await this.getVersions()
            version = versions.pop()

            if (!params.dry) {
                for (let v of versions) {
                    let migration = await this.loadMigration(v)
                    model = db.getModel(MigrationKey)
                    await model.create({
                        date: new Date(),
                        description: migration.description,
                        path: migration.path,
                        version: migration.version,
                    })
                }
            }
        }
        if (!migration) {
            migration = await this.loadMigration(version)
            model = db.getModel(MigrationKey)
        }

        if (direction < 0) {
            await migration.down(db, this, params)

            if (!params.dry) {
                await model.remove({version: migration.version})
                let current = await this.loadMigration(await this.getCurrentVersion())
                await db.saveSchema(current.schema)
            }

        } else {
            //  Up, repeat or reset
            await migration.up(db, this, params)

            if (!params.dry) {
                db.saveSchema(migration.schema)
                let properties = {
                    version,
                    date: new Date(),
                    path: migration.path,
                    description: migration.description,
                }
                if (direction <= 1) {
                    await model.create(properties)
                } else {
                    await model.update(properties)
                }
            }
        }
        return migration
    }

    /* public */
    async findPastMigrations() {
        if (this.pastMigrations) {
            return this.pastMigrations
        }
        let model = await this.db.getModel(MigrationKey)
        let pastMigrations = await model.find({})
        this.sortMigrations(pastMigrations)
        this.pastMigrations = pastMigrations
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
    /*
        Load a migration and set its schema. Return the migration (modified)
    */
    async loadMigration(version) {
        let path, migration
        if (this.migrations) {
            migration = this.migrations.find(m => m.version == version)
        } else {
            path = `${this.dir}/${version}.js`
            migration = (await import(path)).default
        }
        if (!migration) {
            throw new Error(`Cannot find migration for version ${version}`)
        }
        if (!migration.schema) {
            throw new Error(`Migration ${version} is missing a schema`)
        }
        if (!migration.version) {
            throw new Error(`Migration ${version} is missing a version property`)
        }
        await this.db.setSchema(migration.schema)

        return {
            description: migration.description,
            down: migration.down,
            path: path || 'memory',
            schema: migration.schema,
            up: migration.up,
            version,
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
