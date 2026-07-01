import { jest, describe, it, expect } from "@jest/globals";
import { createLogger } from "../../src/lib/logger.js";

describe("createLogger", () => {
  it("writes structured JSON logs at or above configured level", () => {
    const stderrSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);

    const logger = createLogger("warn");
    logger.info("hidden");
    logger.warn("visible", { code: "TEST" });

    expect(stderrSpy).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(stderrSpy.mock.calls[0][0]));
    expect(payload.level).toBe("warn");
    expect(payload.message).toBe("visible");
    expect(payload.code).toBe("TEST");

    stderrSpy.mockRestore();
  });
});
