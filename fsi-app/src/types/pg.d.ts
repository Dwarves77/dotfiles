// Minimal ambient declaration for the `pg` runtime dependency (no @types/pg installed).
// Covers only the surface Unit 2a uses (Client.connect/query/end). If @types/pg is ever added as a
// devDependency, delete this file — the real types supersede it.
declare module "pg" {
  export interface QueryResult {
    rows: Array<Record<string, unknown>>;
    rowCount: number | null;
  }
  export class Client {
    constructor(config?: { connectionString?: string });
    connect(): Promise<void>;
    query(text: string, values?: unknown[]): Promise<QueryResult>;
    end(): Promise<void>;
  }
  const _default: { Client: typeof Client };
  export default _default;
}
