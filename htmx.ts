import { createHash } from "crypto";
import { renderToStaticMarkup } from "react-dom/server";
import fastify, {
  type FastifyInstance,
  type FastifyServerOptions,
  type FastifyHttpOptions,
  type RawServerDefault,
  type FastifyRequest,
  type FastifyReply,
} from "fastify";
import formbody from "@fastify/formbody";

type HandlerArgs<T> = {
  data: T;
  req: FastifyRequest;
  res: FastifyReply;
};

type OnHandlers = Partial<{
  // Standard DOM events
  onClick: (event: Event) => void;
  onChange: (event: Event) => void;
  onSubmit: (event: Event) => void;
  onMouseEnter: (event: Event) => void;
  onMouseLeave: (event: Event) => void;
  onInput: (event: Event) => void;
  onFocus: (event: Event) => void;
  onBlur: (event: Event) => void;
  onKeyDown: (event: Event) => void;
  onKeyUp: (event: Event) => void;
  onMouseDown: (event: Event) => void;
  onMouseUp: (event: Event) => void;

  // HTMX events
  onBeforeRequest: (event: Event) => void;
  onAfterRequest: (event: Event) => void;
}>;

function convertToHXAttribute(key: keyof OnHandlers): string {
  switch (key) {
    case "onBeforeRequest":
      return "hx-on::before-request";
    case "onAfterRequest":
      return "hx-on::after-request";
    default:
      return `hx-on:${key.toLowerCase().slice(2)}`;
  }
}

export type RouteProps<T> = HandlerArgs<T>;

type RouteHandler<T> = (
  args: HandlerArgs<T>
) => React.ReactElement | Promise<React.ReactElement>;

export interface HTMXRouterConfig {
  /** mount point for all HTMX routes (default "/api") */
  prefix?: string;
  /** if you already have a Fastify instance, pass it here */
  app?: FastifyInstance;
  /** options to create a new Fastify instance if `app` is omitted */
  fastifyOptions?: FastifyServerOptions;
  /** whether to register @fastify/formbody for form parsing (default true) */
  useFormbody?: boolean;
  /** the entry point for the route */
  entryPoint?: React.ReactElement;
  /** the root path for the entry point */
  rootPath?: string;
  /** port to listen on (default 3000) */
  port?: number;
  /** host to listen on (default "localhost") */
  host?: string;
}

export type HTMXRouteOptions<T> = {
  /** your server‐only JSX handler */
  handler: RouteHandler<T>;
  /** HTTP method to use (defaults to "POST") */
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  /** target selector for hx‐target (default "body") */
  target?: string;
  /** swap strategy for hx‐swap (default "innerHTML") */
  swap?:
  | "innerHTML"
  | "outerHTML"
  | "beforebegin"
  | "afterbegin"
  | "beforeend"
  | "afterend"
  | "delete";
  /** values to pass to the handler */
  vals?: Partial<T>;
  /** any additional Fastify routeOptions (e.g. schema, preHandler) */
  routeOptions?: FastifyHttpOptions<RawServerDefault>;
} & OnHandlers;

export function createHTMXRouter(config: HTMXRouterConfig = {}) {
  const prefix = config.prefix ?? "/api";
  const app = config.app ?? fastify(config.fastifyOptions);
  if (config.useFormbody ?? true) {
    app.register(formbody);
  }

  const routeRegistry = new Map<string, RouteHandler<any>>();

  function hashFn(fn: (...args: any[]) => any) {
    return createHash("sha1")
      .update(fn.toString())
      .digest("hex")
      .slice(0, 10);
  }

  if (config.entryPoint) {
    const mount = config.rootPath ?? "/";
    app.get(mount, async (req, res) => {
      const content = renderToStaticMarkup(config.entryPoint!);
      const html = `<!DOCTYPE html>
<html lang="en">
    <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Document</title>
    </head>
    <body>
        <div id="main">${content}</div>
        <script src="https://unpkg.com/htmx.org@2.0.4"></script>
    </body>
</html>`;
      res.header("Content-Type", "text/html").send(html);
    });
  }

  const router = function htmx<T = any>(
    opts: HTMXRouteOptions<T>
  ): Record<string, string> {
    const method = opts.method?.toUpperCase() ?? "POST";
    const id = hashFn(opts.handler);
    const path = `${prefix}/${id}`;

    if (!routeRegistry.has(path)) {
      routeRegistry.set(path, opts.handler);

      app.route({
        method,
        url: path,
        ...(opts.routeOptions ?? {}),
        handler: async (req, res) => {
          try {
            const data = {
              ...(opts.vals ?? {}),
              ...(req.body ?? {}),
            } as T;

            const jsx = await opts.handler({ data, req, res });
            const html = renderToStaticMarkup(jsx);
            res.header("Content-Type", "text/html").send(html);
          } catch (e) {
            console.error("HTMX handler error:", e);
            res.status(500).send("Server error");
          }
        },
      });
    }

    let hxAttr = "hx-post";
    switch (method) {
      case "GET":
        hxAttr = "hx-get";
        break;
      case "POST":
        hxAttr = "hx-post";
        break;
      case "PUT":
        hxAttr = "hx-put";
        break;
      case "DELETE":
        hxAttr = "hx-delete";
        break;
      case "PATCH":
        hxAttr = "hx-patch";
        break;
    }

    const onHandlers = Object.keys(opts).filter((key) =>
      key.startsWith("on")
    );
    const hxOnHandlers = Object.fromEntries(
      onHandlers.map((key) => {
        const handler = opts[key as keyof OnHandlers];
        if (!handler) return [];

        const handlerString = handler.toString()
          .replace(/^function\s*\([^)]*\)\s*{/, '')
          .replace(/^\(?[^)]*\)?\s*=>\s*{/, '')
          .replace(/}$/, '')
          .trim();

        return [convertToHXAttribute(key as keyof OnHandlers), handlerString];
      }).filter((entry): entry is [string, string] => entry.length > 0)
    );


    const attrbs = {
      [hxAttr]: path,
      "hx-target": opts.target ?? "body",
      "hx-swap": opts.swap ?? "innerHTML",
      "hx-vals": JSON.stringify(opts.vals),
      ...hxOnHandlers,

    };
    console.log(attrbs);
    return attrbs;
  };

  router.start = async () => {
    try {
      const port = config.port ?? 3000;
      const host = config.host ?? "localhost";
      await app.listen({ port, host });
      console.log(`Server listening on http://${host}:${port}`);
    } catch (err) {
      console.error("Error starting server:", err);
      process.exit(1);
    }
  };

  return router;
}
