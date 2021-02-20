# DynamoDB OneTable Migration Library
One table to rule them all.

[![npm](https://img.shields.io/npm/v/onetable-migrate.svg)](https://www.npmjs.com/package/onetable-migrate)
[![npm](https://img.shields.io/npm/l/onetable-migrate.svg)](https://www.npmjs.com/package/onetable-migrate)

![OneTable](https://www.sensedeep.com/images/ring.png)

This library provides migrations support for [DynamoDB OneTable](https://www.npmjs.com/package/dynamodb-onetable).

The library may be used by services to apply and control migrations to OneTable DynamodDB tables either locally or remotely.

The OneTable migration library was used in production by the [SenseDeep Serverless Troubleshooter](https://www.sensedeep.com/) for all DynamoDB access for a year before it was published as an NPM module.

Use the [OneTable CLI](https://github.com/sensedeep/onetable-cli) which relies on this library if you want command control of migrations. The CLI can operate locally or remotely if this library is hosted via Lambda.

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
* Works with AWS SDK v3

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

or

```javascript
const {Table} = require('dynamodb-onetable')
const Migrate = require('onetable-migrate')
```

Initialize the Migrate instance with a OneTable Table instance using the AWS SDK v2 DocumentClient.

For initialization using the AWS SDK v3, see the [OneTable Documentation](https://www.npmjs.com/package/dynamodb-onetable).

```javascript
const table = new Table({
    client: new AWS.DynamoDB.DocumentClient(params),
    name: 'MyTable',
    schema: MySchema,
})
const migrate = new Migrate(onetable, params)
await migrate.init()
```

See the [OneTable documentation](https://www.npmjs.com/package/dynamodb-onetable) for details of the Table constructor and other OneTable configuration parameters.

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

The migrations array contains an ordered set of migrations of the form:

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

The `version` should be a [SemVer](https://semver.org/) compatible version. The `up` and `down` functions receive the OneTable Table instance via the `db` parameter. The `migrate` parameter is the Migrate instance. You can access the parameters provided to onetable-migrate via `migrate.params`.

## Latest Migration

You can create a special `latest` migration that is used for the `migrate reset` command which is is a quick way to get a development database up to the current version. For the `latest` migration, the version field should be set to `latest`.

The latest migration should remove all data from the database and then initialize the database equivalent to applying all migrations.

When creating your `latest.js` migration, be very careful when removing all items from the database. We typically protect this with a test against the deployment profile to ensure you never do this on a production database.

Sample latest.js migration
```javascript
const migrate = new Migrate(onetable, {
    migrations: [
        {
            version: 'latest',
            description: 'Database reset to latest version',
            async up(db, migrate) {
                if (migrate.params.profile != 'prod') {
                    await removeAllItems(db)
                }
                //  Provision required database data
            },
            async down(db, migrate) {
                if (migrate.params.profile != 'prod') {
                    await removeAllItems(db)
                }
            },
        }
    ]
})

async function removeAllItems(db) {
    do {
        items = await db.scanItems({}, {limit: 100})
        for (let item of items) {
            await db.deleteItem(item)
        }
    } while (items.length)
}
```

### Migrate Methods

#### async apply(direction, version)

Apply or revert a migration. The `direction` parameter specifies the direction, where, -1 means downgrade, 0 means reset and then upgrade, and 1 means upgrade.

The `version` is the destination version. All intermediate migrations will be applied or reverted to reach the destination.

#### async findPastMigrations()

Returns a list of all migrations that have been applied (and not reverted). The result is a simple list of version numbers.

#### async getCurrentVersion()

Returns the current migration version. This is the last migration that was not reverted.

#### async getOutstandingVersions()

Returns a list of migrations that have not yet been applied.

### Deployment

You use deploy this library two ways:

* Local Migrations via the [OneTable CLI](https://www.npmjs.com/package/onetable-cli).
* Remote Migrations hosted via Lambda and remotely controlled via the OneTable CLI.

### Local Migrations

With local migrations, you keep your migration scripts locally on a development system and manage using the [OneTable CLI](https://www.npmjs.com/package/onetable-cli). The OneTable CLI includes this migration library internally and can manage migrations using AWS credentials.

In this mode, DynamoDB I/O is performed from within the OneTable CLI process. This means I/O travels to and from the system hosting the OneTable CLI process. This works well for local development databases and smaller remote databases.

### Remote Migrations

If you have large databases or complex migrations, you should host the OneTable Migrate library via AWS Lambda so that it executes in the same AWS region and availablity zone as your DynamoDB instance. This will accelerate migrations by minimizing the I/O transfer time.

The OneTable CLI can control your migration lambda when operating in proxy mode by setting the `arn` of your migration Lambda.

#### Lambda Hosting

When hosted remotely, a Lambda function receives proxied commands from the OneTable CLI and relays to the OneTable Migrate library API.

The OneTable CLI should be configured with the ARN of the Lambda function in the migrate.json `arn` property. Access should be controlled via suitable IAM access credentials that are passed to the OneTable CLI via the command line or via the migrate.json `aws` properties. See [OneTable CLI](https://www.npmjs.com/package/onetable-cli) for more details.

Here is a sample Lambda hosting of OneTable Migrate:

```javascript
import {Table} from 'dynamodb-onetable'
import Migrate from 'onetable-migrate'
import DynamoDB from 'aws-sdk/clients/dynamodb'

const Migrations = [
    {
        version: '0.0.1',
        description: 'Initialize the database',
        async up(db, migrate) { /* code */ },
        async down(db, migrate) { /* code */ }
    },
    {
        version: 'latest',
        description: 'Initialize the database',
        async up(db, migrate) { /* code */ },
        async down(db, migrate) { /* code */ }
    },

]

exports.handler = async (event, context) => {
    let {action, args, config} = event
    let cot = config.onetable
    cot.client = new DynamoDB.DocumentClient()
    let onetable = new Table(cot)

    cot.migrations = Migrations
    let migrate = new Migrate(onetable, cot)
    let data

    switch (action) {
    case 'apply':
        let {direction, version} = args
        data = await migrate.apply(direction, version)
        break
    case 'getCurrentVersion':
        data = await migrate.getCurrentVersion()
        break
    case 'findPastMigrations':
        data = await migrate.findPastMigrations()
        break
    case 'getOutstandingVersions':
        data = await migrate.getOutstandingVersions()
        break
    default:
        throw new Error(`Unknown migration action ${action}`)
    }
    return {
        body: data,
        statusCode: 200,
    }
}
```

The OneTable CLI will issue the following commands and set `event.action` to the method name and `event.args` to any parameters. The `event.config` contains the migrate.json settings from the CLI.

```
function apply(direction: Number, version: String) : Migration {}
function getCurrentVersion() : String {}
function findPastMigrations() {}
function getOutstandingVersions(): String {}
```

Where a `Migration` is {version, description, path}.

### References

- [OneTable](https://www.npmjs.com/package/dynamodb-onetable).
- [OneTable CLI](https://www.npmjs.com/package/onetable-cli).
- [DocumentClient SDK Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/DynamoDB/DocumentClient.html).

### Participate

All feedback, contributions and bug reports are very welcome.

* [OneTable Migrate Issues](https://github.com/sensedeep/onetable-migrate/issues)

### Contact

You can contact me (Michael O'Brien) on Twitter at: [@SenseDeepCloud](https://twitter.com/SenseDeepCloud), or [email](mob-pub-18@sensedeep.com) and ready my [Blog](https://www.sensedeep.com/blog).

### SenseDeep

Please try our Serverless trouble shooter [SenseDeep](https://www.sensedeep.com/).
