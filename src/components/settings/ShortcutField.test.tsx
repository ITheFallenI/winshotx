import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ShortcutField } from "./ShortcutField";

function grabar() {
  const onChange = vi.fn();
  render(<ShortcutField value="CmdOrCtrl+Shift+Digit2" active onChange={onChange} />);
  const campo = screen.getByRole("button");
  fireEvent.click(campo);
  return { campo, onChange };
}

describe("grabar un atajo global", () => {
  it.each(Array.from({ length: 12 }, (_, i) => `F${i + 1}`))(
    "acepta %s sin modificadores y termina de grabar",
    (code) => {
      const { campo, onChange } = grabar();
      const evento = new KeyboardEvent("keydown", { key: code, code, cancelable: true });
      fireEvent(window, evento);
      expect(evento.defaultPrevented).toBe(true);
      expect(onChange).toHaveBeenCalledExactlyOnceWith(code);
      expect(campo).not.toHaveClass("animate-pulse");
      fireEvent.keyDown(window, { key: "F3", code: "F3" });
      expect(onChange).toHaveBeenCalledTimes(1);
    },
  );

  it.each(["KeyA", "Digit2", "Space", "Enter", "F13", "F24"])(
    "sigue rechazando %s sin modificadores",
    (code) => {
      const { campo, onChange } = grabar();
      fireEvent.keyDown(window, { key: code, code });
      expect(onChange).not.toHaveBeenCalled();
      expect(campo).toHaveClass("animate-pulse");
    },
  );

  it.each([
    [{ ctrlKey: true, shiftKey: true }, "Digit2", "CmdOrCtrl+Shift+Digit2"],
    [{ metaKey: true }, "KeyX", "Super+KeyX"],
    [{ altKey: true }, "F2", "Alt+F2"],
    [{ shiftKey: true }, "F2", "Shift+F2"],
  ])("conserva los modificadores %j", (modifiers, code, esperado) => {
    const { onChange } = grabar();
    fireEvent.keyDown(window, { key: code, code, ...modifiers });
    expect(onChange).toHaveBeenCalledExactlyOnceWith(esperado);
  });

  it("ignora modificadores solos y eventos sin codigo fisico", () => {
    const { campo, onChange } = grabar();
    fireEvent.keyDown(window, { key: "Control", code: "ControlLeft", ctrlKey: true });
    fireEvent.keyDown(window, { key: "Shift", code: "ShiftLeft", shiftKey: true });
    fireEvent.keyDown(window, { key: "Alt", code: "AltLeft", altKey: true });
    fireEvent.keyDown(window, { key: "Meta", code: "MetaLeft", metaKey: true });
    fireEvent.keyDown(window, { key: "F2" });
    fireEvent.keyDown(window, { key: "F2", ctrlKey: true });
    expect(onChange).not.toHaveBeenCalled();
    expect(campo).toHaveClass("animate-pulse");
  });

  it("Escape cancela sin cambiar el atajo", () => {
    const { campo, onChange } = grabar();
    fireEvent.keyDown(window, { key: "Escape", code: "Escape" });
    fireEvent.keyDown(window, { key: "F2", code: "F2" });
    expect(onChange).not.toHaveBeenCalled();
    expect(campo).not.toHaveClass("animate-pulse");
  });

  it("pulsar fuera cancela sin cambiar el atajo", () => {
    const { campo, onChange } = grabar();
    fireEvent.mouseDown(document.body);
    fireEvent.keyDown(window, { key: "F2", code: "F2" });
    expect(onChange).not.toHaveBeenCalled();
    expect(campo).not.toHaveClass("animate-pulse");
  });

  it("muestra una tecla suelta guardada y conserva el estado de conflicto", () => {
    const { rerender } = render(<ShortcutField value="F2" active onChange={vi.fn()} />);
    expect(screen.getByRole("button")).toHaveTextContent(/^F2$/);
    rerender(<ShortcutField value="F2" active={false} onChange={vi.fn()} />);
    expect(screen.getByRole("button")).toHaveClass("border-red-500/40");
    expect(screen.getByRole("button")).toHaveTextContent(/^F2$/);
  });
});
