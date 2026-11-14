/**
 * Minimal type declarations for better-sqlite3 (the package does not ship
 * TypeScript types). Only the surface used by this project is declared.
 */
declare module "better-sqlite3" {
  namespace Database {
    interface RunResult {
      changes: number;
      lastInsertRowid: number | bigint;
    }
    interface Statement {
      run(...params: unknown[]): RunResult;
      get(...params: unknown[]): unknown;
      all(...params: unknown[]): unknown[];
      iterate(...params: unknown[]): IterableIterator<unknown>;
    }
    interface Transaction<F extends (...args: never[]) => unknown> {
      (...args: Parameters<F>): ReturnType<F>;
      deferred(...args: Parameters<F>): ReturnType<F>;
      immediate(...args: Parameters<F>): ReturnType<F>;
      exclusive(...args: Parameters<F>): ReturnType<F>;
    }
    interface Database {
      prepare(sql: string): Statement;
      exec(sql: string): void;
      pragma(source: string, options?: { simple?: boolean }): unknown;
      transaction<F extends (...args: never[]) => unknown>(
        fn: F,
      ): Transaction<F>;
      close(): void;
      readonly open: boolean;
    }
  }

  interface DatabaseConstructor {
    new (
      filename: string,
      options?: { readonly?: boolean; fileMustExist?: boolean; timeout?: number },
    ): Database.Database;
  }

  const Database: DatabaseConstructor;
  export = Database;
}
