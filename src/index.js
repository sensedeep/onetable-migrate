/*
    Migrate.js - OneTable Migrations
 */

import Fs from 'fs'
import Path from 'path'
import Semver from 'semver'
import { Model, Table } from 'dynamodb-onetable'

const MigrationFields = {
    pk:             { value: '_migrations:' },
    sk:             { value: '_migrations:${version}' },
    description:    { type: String, required: true },
    date:           { type: Date, required: true },
    path:           { type: String, required: true },
    version:        { type: String, required: true },
}

export default class Migrate {

    /*
        params: {
            migrations: [in-memory-migrations]
            dir: 'migrations-directory'
        }
     */
    constructor(db, params = {}) {
        this.params = params
        this.db = db
        this.migrations = params.migrations
        this.dir = Path.resolve(params.dir || '.')
        this.Migration = new Model(db, '_Migration', { fields: MigrationFields }, {timestamps: false})
    }

    /* public */
    async findPastMigrations() {
        let pastMigrations = await this.Migration.find()
        this.sortMigrations(pastMigrations)
        return pastMigrations
    }

    /* public */
    async apply(direction, version) {
        let migration = await this.loadMigration(version)
        if (direction == 0) {
            let outstanding = await this.getOutstandingVersions()
            if (outstanding.length) {
                version = outstanding[outstanding.length - 1]
            } else {
                version = await this.getCurrentVersion()
            }
            migration.version = version
        }
        if (direction < 0) {
            await migration.down(this.db, this)
            await this.Migration.remove({version: migration.version})
        } else {
            await migration.up(this.db, this)
            let params = {
                version,
                date: new Date(),
                path: migration.path,
                description: migration.description,
            }
            await this.Migration.create(params)
        }
        return migration
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
        let versions
        if (this.migrations) {
            versions = this.migrations.map(m => m.version)
        } else {
            versions = Fs.readdirSync(this.dir).map(file => file.replace(/\.[^/.]+$/, '')).filter(version => {
                return Semver.valid(version) && Semver.compare(version, current) > 0
            }).sort(Semver.compare)
        }
        versions = versions.filter(v => pastMigrations.find(m => m.version == v) == null)
        return versions.slice(0, limit)
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
        return {
            version,
            description: task.description,
            path: path || 'memory',
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
