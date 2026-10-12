declare namespace ComponentFramework {
    type Context<T = any> = any;
    type ReactControl<T = any, U = any> = any;

    interface WebApi {
        retrieveMultipleRecords(entityName: string, options?: string): Promise<{ entities: WebApi.Entity[] }>;
    }

    namespace WebApi {
        interface Entity extends Record<string, unknown> {}
    }
}
