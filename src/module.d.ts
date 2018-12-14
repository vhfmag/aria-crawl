declare type Arguments<Fn extends Function> = Fn extends (
    ...args: infer Args
) => any
    ? Args
    : never;

declare module "make-fetch-happen" {
    import { URL } from "url";
    import { TimeoutsOptions } from "retry";
    import { Server } from "https";
    import fetch, { Request, Response, RequestInit } from "node-fetch";

    type HttpsOptions = Partial<Arguments<Server["addContext"]>[1]> & {
        strictSSL?: boolean;
    };

    export type CachedRequestInit = RequestInit &
        HttpsOptions & {
            cacheManager?: string;
            cache?:
                | "default"
                | "no-store"
                | "reload"
                | "no-cache"
                | "force-cache"
                | "only-if-cached";
            proxy?: string | URL;
            noProxy?: string | string[];
            localAddress?: string;
            maxSockets?: number;
            retry?: number | boolean | TimeoutsOptions;
            onRetry?(): void;
            integrity?: string;
        };

    function cachedFetch(
        url: string | Request,
        init?: CachedRequestInit,
    ): Response;

    export const defaults: (options: CachedRequestInit) => typeof fetch;
    export default cachedFetch;
}
