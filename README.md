![OneTable](https://www.sensedeep.com/images/ring-short.png?renew)

*One Table to Rule Them All*

# DynamoDB OneTable Migration Library

[![npm](https://img.shields.io/npm/v/onetable-migrate.svg)](https://www.npmjs.com/package/onetable-migrate)
[![npm](https://img.shields.io/npm/l/onetable-migrate.svg)](https://www.npmjs.com/package/onetable-migrate)

This library provides migrations support for [DynamoDB OneTable](https://www.npmjs.com/package/dynamodb-onetable).

OneTable migrations can be executed locally for simple tasks, however it is best to host your migrations close to the DynamoDB table for maximum performance. When executing locally, the migration scripts reside on your local computer and DynamoDB operations are performed from your system. When executing remotely, the migration scripts reside in your AWS account region and DynamoDB operations are performed there, in close proximity to the DynamoDB table.

You should generally host this library and migrations to execute in the same AWS region and availability zone as your DynamoDB table. This will accelerate migrations by minimizing the I/O transfer time.

The easiest way to remotely host this library is by deploying the [OneTable Controller](https://github.com/sensedeep/onetable-controller/blob/main/README.md) which is an easy to deploy, complete solution for remote hosting.

Use the [OneTable CLI](https://github.com/sensedeep/onetable-cli) which relies on this library if you want command control of migrations.

Use the [SenseDeep DynamoDB Developer Studio](https://www.sensedeep.com) which provides a complete DynamoDB developer studio with a powerful data browser, single-table designer, provisioning planner, table metrics and control of database migrations.

## OneTable Migration Features

* Mutate database schema and contents via discrete, reversible migrations.
* Migrate upwards, downwards, to specific versions.
* Automated, ordered sequencing of migrations in both directions.
* Add and remove seed data in any migration.
* Quick reset of DynamoDB databases for development.
* Show database status and list applied migrations.
* Show outstanding migrations.
* Stored history of migrations.
* Persist migration history and the current OneTable schema in the table.
* Control by the SenseDeep DynamoDB Developer Studio GUI.
* No module dependencies other than OneTable.
* Supported by [SenseDeep](https://www.sensedeep.com/) for graphical migrations control.
* Works with AWS SDK v2 and v3

## Installation

```sh
npm i onetable-migrate
```

## Quick Tour

Import the library:

```javascript
import {Table} from 'dynamodb-onetable'
import {Migrate} from 'onetable-migrate'
```

or

```javascript
const {Table} = require('dynamodb-onetable')
const {Migrate} = require('onetable-migrate')
```

Initialize the Migrate instance with a OneTable Table instance using the AWS SDK v2 DocumentClient.

For initialization using the AWS SDK v3, see the [OneTable Documentation](https://www.npmjs.com/package/dynamodb-onetable).

```javascript
const OneTableParams = {
    client: new AWS.DynamoDB.DocumentClient({}),
    name: 'MyTable',
})
const migrate = new Migrate(OneTableParams, params)
await migrate.init()
```

See the [OneTable documentation](https://www.npmjs.com/package/dynamodb-onetable) for details of the Table constructor and other OneTable configuration parameters.

The Migrate `params` provides a list of migrations as either:

* A directory containing migration source files, or
* A list of in-memory migrations

For example:

```javascript
const migrate = new Migrate(OneTableParams, {
    migrations: [
        {
            version: '0.0.1',
            description: 'Initialize the database',
            schema: Schema,
            async up(db, migrate, params) {
                if (!params.dry) {
                    await db.create('Status', {})
                } else {
                    console.log('DRY: create "Status"')
                }
            },
            async down(db, migrate, params) {
                if (!params.dry) {
                    await db.remove('Status', {})
                } else {
                    console.log('DRY: create "Status"')
                }
            }
        }
    ]
})
await migrate.init()
```

or provide migrations via a directory:

```javascript
const migrate = new Migrate(OneTableParams, {dir: '.'})
await migrate.init()
```

where the migrations look like:

```javascript
export default {
    description: 'Test dummy migration only',
    version: '0.0.1',
    schema: Schema,

    async up(db, migrate, params) {
        if (!params.dry) {
            await db.create('Status', {})
        }
    },

    async down(db, migrate, params) {
        if (!params.dry) {
            await db.remove('Status', {})
        }
    }
}
```

Note: migrations must now have a version and schema properties. The schema is the OneTable schema that applies at this version.

If `params` is not provided, it defaults to looking for migrations in the current directory. i.e. params of `{dir: '.'}`.

### Migrate Examples

```javascript
import {Migrate} from 'onetable-migrate'

//  See above example for Migrate parameters
const migrate = new Migrate(OneTableParams, {dir: '.'})

//  Initialize the migration library. This reads the table primary keys.
await migrate.init()

//  Apply a specific migration where direction is -1 for downgrade, +1 for an upgrade and 0 for a reset
let migration = await migrate.apply(direction, '0.0.1', {dry: false})

//  Return a list of applied migrations
let migrations = await migrate.findPastMigrations()

//  Get the last applied migration
let version = await migrate.getCurrentVersion()

//  Get a list of outstanding migrations
let outstanding = await migrate.getOutstandingVersions()
```

Migrations will save a history of migrations and the current OneTable schema after each migration.

The Migration history will be saved as items using the `_Migration` model using the `_migrations:` primary hash key value. NOTE: the `:` delimiter is always used regardless of the OneTable delimiter setting.

The Schema will be saved as a single item using the `_Schema` model using the `_schema` primary hash key value.

### Migrate Constructor

The Migrate constructor takes the following parameters:

| Property | Type | Description |
| -------- | :--: | ----------- |
| config | `Table\|map` | A OneTable Table instance [OneTable](https://github.com/sensedeep/dynamodb-onetable) or a map of OneTable properties.|
| params | `map` | Hash containing `migrations` or `dir` properties |

The `params` property may contain either:

* `dir` path property describing a directory containing migration files.
* `migrations` array containing maps that describe each migration.

The migrations array contains an ordered set of migrations of the form:

```javascript
{
    version: 'x.y.z',
    description: 'Migration Description',
    schema: Schema,

    async up(db, migrate, params) {
        //  Code to upgrade the database
    },
    async down(db, migrate, params) {
        //  Code to downgrade the database
        if (!params.dry) {
            await db.remove('Status', {})
        }
    }
}
```

The `version` should be a [SemVer](https://semver.org/) compatible version. The `up` and `down` functions receive the OneTable Table instance via the `db` parameter. The `migrate` parameter is the Migrate instance. You can access the parameters provided to onetable-migrate via `migrate.params`.

Each migration must reference the `Schema` that applies to that version of the database. The Migrate library saves the current schema to the database so that tooling and always understand the stored data. The migration must specify a `version` property.

## Latest Migration

You can create a special `latest` migration that is used for the `migrate reset` command which is is a quick way to get a development database up to the current version. For the `latest` migration, the version field should be set to `latest`.

The latest migration should remove all data from the database and then initialize the database equivalent to applying all migrations.

When creating your `latest.js` migration, be very careful when removing all items from the database. We typically protect this with a test against the deployment profile to ensure you never do this on a production database.

Sample latest.js migration

```javascript
const migrate = new Migrate(OneTableParams, {
    migrations: [
        {
            version: 'latest',
            description: 'Database reset to latest version',
            schema: Schema,
            async up(db, migrate, params) {
                if (!params.dry) {
                    if (migrate.params.profile == 'dev') {
                        await removeAllItems(db)
                    }
                }
                //  Provision required database data
            },
            async down(db, migrate, params) {
                if (!params.dry) {
                    if (migrate.params.profile == 'dev') {
                        await removeAllItems(db)
                    }
                }
            }
        }
    ]
})
await migrate.init()

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

#### async apply(direction, version, params)

Apply or revert a migration. The `direction` parameter specifies the direction, where, -1 means downgrade, 0 means reset and then upgrade, and 1 means upgrade.

The `version` is the destination version. All intermediate migrations will be applied or reverted to reach the destination.

The `params` are provided to the up/down functions. The `params.dry` will be true to indicate it should be a dry-run and not perform any descructive updates to the table.

#### async findPastMigrations()

Returns a list of all migrations that have been applied (and not reverted). The result is a simple list of version numbers.

#### async getCurrentVersion()

Returns the current migration version. This is the last migration that was applied and has not been reverted.

#### async getOutstandingVersions()

Returns a list of versions that have not yet been applied.

#### async getOutstandingMigrations()

Returns a list of migrations that have not yet been applied.

### async init()

Initialize the migration library. This reads the table keys. This MUST be called after constructing the Migrate instance.

### Deployment

You use deploy this library two ways:

* Local Migrations via the [OneTable CLI](https://www.npmjs.com/package/onetable-cli).
* Remote Migrations hosted via Lambda and remotely controlled via the OneTable CLI.

### Local Migrations

With local migrations, you keep your migration scripts locally on a development system and manage using the [OneTable CLI](https://www.npmjs.com/package/onetable-cli). The OneTable CLI includes this migration library internally and can manage migrations using AWS credentials.

The migration scripts must be JavaScript. TypeScript is not yet supported for local scripts. When using remote migrations, you can use TypeScript.

In this mode, DynamoDB I/O is performed from within the OneTable CLI process. This means I/O travels to and from the system hosting the OneTable CLI process. This works well for local development databases and smaller remote databases.

### Remote Migrations

If you have large databases or complex migrations, you should host the OneTable Migrate library via AWS Lambda so that it executes in the same AWS region and availablity zone as your DynamoDB instance. This will accelerate migrations by minimizing the I/O transfer time.

The [OneTable Controller](https://github.com/sensedeep/onetable-controller) sample is an self-contained sample hosting of this library for executing migrations in the cloud. It uses the serverless framework to create a Lambda proxy that responds to CLI and SenseDeep migration commands.

The OneTable CLI can control your migration lambda when operating in proxy mode by setting the `arn` of your migration Lambda.

#### Lambda Hosting

When hosted remotely, a Lambda function receives proxied commands from the OneTable CLI and relays to the OneTable Migrate library API.

The OneTable CLI should be configured with the ARN of the Lambda function in the migrate.json `arn` property. Access should be controlled via suitable IAM access credentials that are passed to the OneTable CLI via the command line or via the migrate.json `aws` properties. See [OneTable CLI](https://www.npmjs.com/package/onetable-cli) for more details.

Here is a sample Lambda hosting of OneTable Migrate:

```javascript
import {Table} from 'dynamodb-onetable'
import {Migrate} from 'onetable-migrate'
import DynamoDB from 'aws-sdk/clients/dynamodb'

const Migrations = [
    {
        version: '0.0.1',
        description: 'Initialize the database',
        schema: Schema_001,
        async up(db, migrate, params) { /* code */ },
        async down(db, migrate, params) { /* code */ }
    },
    {
        version: 'latest',
        description: 'Initialize the database',
        schema: Schema_002,
        async up(db, migrate, params) { /* code */ },
        async down(db, migrate, params) { /* code */ }
    },

]

let client = new DynamoDB.DocumentClient()

exports.handler = async (event, context) => {
    let {action, args, config} = event

    config.client = client
    let migrate = new Migrate(config, {migrations: Migrations})
    await migrate.init()

    let data

    switch (action) {
    case 'apply':
        let {direction, version, params} = args
        data = await migrate.apply(direction, version, params)
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
    case 'getOutstandingMigrations':
        data = await migrate.getOutstandingMigrations()
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

You will need to install this controller with the following lambda permissions:

- "dynamodb:Query"
- "dynamodb:Scan"
- "dynamodb:GetItem"
- "dynamodb:PutItem"
- "dynamodb:UpdateItem"
- "dynamodb:DeleteItem"
- "dynamodb:DescribeTable"

The OneTable CLI will issue the following commands and set `event.action` to the method name and `event.args` to any parameters. The `event.config` contains the migrate.json settings from the CLI.

```
function apply(direction: Number, version: String, params: {dry: boolean}) : Migration {}
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

Please try our Serverless Developer Studio [SenseDeep](https://www.sensedeep.com/).
