
type Migration = {
    version: any;
    description: any;
    path: string;
    schema: any;
    up: any;
    down: any;
}

export class Migrate {
    constructor(config?: {}, params?: {});
    apply(direction: any, version: any): Promise<Migration>;
    findPastMigrations(): Promise<Migration[]>;
    getCurrentVersion(): Promise<string>;
    getOutstandingMigrations(limit?: number): Promise<Migration[]>;
    getOutstandingVersions(limit?: number): Promise<string[]>;
}
