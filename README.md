# DynamoDB OneTable Migration Library

[![npm](https://img.shields.io/npm/v/onetable-migrate.svg)](https://www.npmjs.com/package/onetable-migrate)
[![npm](https://img.shields.io/npm/l/onetable-migrate.svg)](https://www.npmjs.com/package/onetable-migrate)

![OneTable](https://www.sensedeep.com/images/ring.png)

This library provides migrations support for [DynamoDB OneTable](https://www.npmjs.com/package/dynamodb-onetable).

The library may be used by services to apply and control migrations to OneTable DynamodDB tables either locally or remotely.

Use the [OneTable CLI](https://github.com/sensedeep/onetable-cli) which utilizes this library if you want command control of migrations.

## OneTable Migration Features

* Mutate database schema and contents via discrete, reversible migrations.
* Migrate upwards, downwards, to specific versions.
* Automated, ordered sequencing of migrations in both directions.
* Add and remove seed data in any migration.
* Quick reset of DynamoDB databases for development.
* Show database status and list applied migrations.
* Show outstanding migrations.
* Stored history of migrations.
* No module dependencies other than OneTable.

## Installation

```sh
npm i onetable-migrate
```

## Quick Tour

Import the library:

```javascript
import {Table} from 'dynamodb-onetable'
import Migrate from 'onetable-migrate'
```

Initialize the Migrate instance with a OneTable Table instance.

```javascript
const table = new Table({
    client: new AWS.DynamoDB.DocumentClient(params),
    name: 'MyTable',
    schema: MySchema,
})
const migrate = new Migrate(onetable, params)
await migrate.init()
```

See the [OneTable documentation](https://github.com/sensedeep/dynamodb-onetable/README.md) for details of the Table constructor and other OneTable configuration parameters.

The Migrate `params` provides a list of migrations as either:

* A directory containing migration source files, or
* A list of in-memory migrations

For example:

```javascript
const migrate = new Migrate(onetable, {
    migrations: [
        {
            version: '0.0.1',
            description: 'Initialize the database',
            async up(db, migrate) {
                await db.create('Status', {})
            },
            async down(db, migrate) {
                await db.remove('Status', {})
            }
        }
    ]
})
```

or provide migrations via a directory:

```javascript
const migrate = new Migrate(onetable, {dir: '.'})
```

where the migrations look like:

```javascript
export default {
    description: 'Test dummy migration only',

    async up(db, migrate) {
        await db.create('Status', {})
    },

    async down(db, migrate) {
        await db.remove('Status', {})
    }
}
```

### Migrate Examples

```javascript
import Migrate from 'onetable-migrate'

//  See above example for Migrate parameters
const migrate = new Migrate()
await migrate.init()

//  Apply a specific migration where direction is -1 for downgrade, +1 for an upgrade and 0 for a reset
let migration = await migrate.apply(direction, '0.0.1')

//  Return a list of applied migrations
let migrations = await migrate.findPastMigrations()

//  Get the last applied migration
let version = await migrate.getCurrentVersion()

//  Get a list of outstanding migrations
let outstanding = await migrate.getOutstandingVersions()
```

### Migrate Constructor

The Table constructor takes a parameter of type `object` with the following properties:

| Property | Type | Description |
| -------- | :--: | ----------- |
| db | `Table` | A OneTable Table instance [OneTable](https://github.com/sensedeep/dynamodb-onetable) |
| params | `map` | Hash containing `migrations` or `dir` properties |

The `params` property may contain either:

* `dir` path property describing a directory containing migration files.
* `migrations` array containing maps that describe each migration.

The migrations array contains entries of the form:

```javascript
{
    version: 'x.y.z',
    description: 'Migration Description',
    async up(db, migrate) {
        //  Code to upgrade the database
    },
    async down(db, migrate) {
        //  Code to downgrade the database
        await db.remove('Status', {})
    }
}
```

The `version` should be a [SemVer](https://semver.org/) compatible version. The `up` and `down` functions receive the OneTable Table instance via the `db` parameter. The `migrate` parameter is the Migrate instance.


### References

- [OneTable](https://github.com/sensedeep/dynamodb-onetable).
- [OneTable CLI](https://github.com/sensedeep/onetable-cli).
- [DocumentClient SDK Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/DynamoDB/DocumentClient.html).

### Participate

All feedback, contributions and bug reports are very welcome.

* [OneTable Migrate Issues](https://github.com/sensedeep/onetable-migrate/issues)

### Contact

You can contact me (Michael O'Brien) on Twitter at: [@SenseDeepCloud](https://twitter.com/SenseDeepCloud), or [email](mob-pub-18@sensedeep.com) and ready my [Blog](https://www.sensedeep.com/blog).

### SenseDeep

Please try our Serverless trouble shooter [SenseDeep](https://www.sensedeep.com/).
