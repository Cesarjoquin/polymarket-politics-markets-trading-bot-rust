import type { ServerContext } from "./bootstrap.js";

export function registerShutdownHandlers(context: ServerContext): void {
  const shutdown = async (signal: string): Promise<void> => {
    context.logger.info("Shutdown signal received", { signal });

    context.auth?.destroy();

    if (context.redis) {
      try {
        await context.redis.disconnect();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        context.logger.warn("Error during Redis shutdown", { error: message });
      }
    }

    context.logger.info("Shutdown complete");
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}
