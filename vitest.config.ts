import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "node",
		// Include both tests and simulator
		include: ["src/__tests__/**/*.test.ts"],
	},
});
