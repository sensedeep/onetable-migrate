/*
    Migrate.js - OneTable Migrations
 */

import Fs from 'fs'
import Path from 'path'
import Semver from 'semver'
import { Model, Table } from 'dynamodb-onetable'

const SemVerExp = /^([0-9]+)\.([0-9]+)\.([0-9]+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+)?$/

const MigrationFields = {
    pk:             { value: '_migrations:${version}' },
    sk:             { value: '_migrations:' },
    description:    { type: String, required: true },
    date:           { type: Date, required: true },
    path:           { type: String, required: true },
    version:        { type: String, required: true },
}

export default class Migrate {

    constructor(db, params = {}) {
        this.params = params
        this.db = db
        this.migrations = params.migrations
        this.dir = Path.resolve(params.dir || '.')
        this.Migration = new Model(db, '_Migration', { fields: MigrationFields }, {timestamps: false})
    }

    async init() {
        await this.update()
    }

    async update() {
        this.pastMigrations = await this.Migration.scan()
        this.sortMigrations(this.pastMigrations)
    }

    async findPastMigrations() {
        return this.pastMigrations
    }

    async apply(direction, version) {
        let migration = await this.loadMigration(version)
        if (direction == 0) {
            let outstanding = this.getOutstandingVersions()
            if (outstanding.length) {
                version = outstanding[outstanding.length - 1]
            } else {
                version = this.getCurrentVersion()
            }
            migration.version = version
        }
        if (direction < 0) {
            await migration.task.down(this.db, this)
            await this.Migration.remove({version: migration.version})
        } else {
            await migration.task.up(this.db, this)
            await this.Migration.create({
                version,
                date: new Date(),
                path: migration.path,
                description: migration.description,
            }, {exists: null})
        }
        return migration
    }

    async loadMigration(version) {
        let path, task
        if (this.migrations) {
            task = this.migrations.find(m => m.version == version)
            path = 'memory'
        } else {
            path = `${this.dir}/${version}.js`
            task = (await import(path)).default
        }
        return {
            version,
            description: task.description,
            path,
            task,
        }
    }

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

    getCurrentVersion() {
        if (this.pastMigrations.length == 0) {
            return '0.0.0'
        }
        return this.pastMigrations[this.pastMigrations.length - 1].version
    }

    /*
        Return outstanding versions in semver sorted order up to the specified limit
     */
    getOutstandingVersions(limit = Number.MAX_SAFE_INTEGER) {
        let current = this.getCurrentVersion()
        let versions

        if (this.migrations) {
            versions = this.migrations.map(m => m.version)
        } else {
            versions = Fs.readdirSync(this.dir).map(file => file.replace(/\.[^/.]+$/, '')).filter(version => {
                return Semver.valid(version) && Semver.compare(version, current) > 0 && this.pastMigrations.find(m => m.version == version) == null
            }).sort(Semver.compare)
        }
        return versions.slice(0, limit)
    }
}
