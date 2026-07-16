import { describe, expect, it, vi } from "vitest";
import { openDatePicker } from "./LessonDueDateControl.js";

describe("openDatePicker", () => {
  it("opens the native picker when the browser supports it", () => {
    const showPicker = vi.fn();
    const click = vi.fn();
    const input = {
      click,
      focus: vi.fn(),
      showPicker
    } as unknown as HTMLInputElement;

    openDatePicker(input);

    expect(showPicker).toHaveBeenCalledOnce();
    expect(click).not.toHaveBeenCalled();
  });

  it("falls back to focusing and clicking the date input", () => {
    const click = vi.fn();
    const focus = vi.fn();
    const input = {
      click,
      focus
    } as unknown as HTMLInputElement;

    openDatePicker(input);

    expect(focus).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
  });
});
