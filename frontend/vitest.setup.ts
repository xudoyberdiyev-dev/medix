import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Vitest `globals` yoqilmagan — Testing Library avtomatik tozalamaydi.
afterEach(() => {
  cleanup();
});
