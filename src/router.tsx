import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
// Pinned at 1.167.1 — latest as of 2026-08-20 but no release since 2026-05-29 (~80 patches behind router).
// Keep pinned; see https://github.com/TanStack/router/issues/7529 (stream hang with router-core ≥1.171.7).
// Canonical per https://tanstack.com/router/latest/docs/integrations/query — no replacement exists.
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";

import { routeTree } from "./routeTree.gen";

export function getRouter() {
  const queryClient = new QueryClient();
  const router = createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    scrollRestoration: true,
    scrollRestorationBehavior: "smooth",
  });

  setupRouterSsrQueryIntegration({ router, queryClient });
  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
