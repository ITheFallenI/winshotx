import { useEffect, useRef, useState } from "react";
import { partesDeAtajo } from "../../lib/teclas";
import { useT } from "../../lib/i18n";

/** Teclas que solo acompañan: por sí solas no forman un atajo. */
const MODIFIERS = new Set([
  "Control",
  "Shift",
  "Alt",
  "Meta",
  "ControlLeft",
  "ControlRight",
  "ShiftLeft",
  "ShiftRight",
  "AltLeft",
  "AltRight",
  "MetaLeft",
  "MetaRight",
]);

interface Props {
  value: string;
  onChange: (value: string) => void;
  /** false cuando el sistema no ha dejado registrarlo. */
  active: boolean;
}

export function ShortcutField({ value, onChange, active }: Props) {
  const t = useT();
  const [recording, setRecording] = useState(false);
  const boxRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!recording) return;

    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === "Escape") {
        setRecording(false);
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") &&
          !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
        setRecording(false);
        onChange("");
        return;
      }
      if (MODIFIERS.has(e.code) || MODIFIERS.has(e.key)) return;

      const parts: string[] = [];
      // La tecla Windows es Super, no Ctrl. Estaban juntas en la misma línea, así que
      // pulsar Win+X guardaba un atajo de Ctrl+X: otra tecla y otro atajo.
      if (e.ctrlKey) parts.push("CmdOrCtrl");
      if (e.metaKey) parts.push("Super");
      if (e.shiftKey) parts.push("Shift");
      if (e.altKey) parts.push("Alt");
      // Las teclas de función pueden ir solas; las de escribir siguen necesitando
      // modificadores para no secuestrarlas en todo el sistema.
      if (parts.length === 0 && !/^F([1-9]|1[0-2])$/.test(e.code)) return;
      // Sin código físico, el atajo saldría como "CmdOrCtrl+Shift+" y Windows no puede
      // registrar eso: pasa con el teclado en pantalla y con las teclas automatizadas.
      if (!e.code) return;

      parts.push(e.code);
      // Cerrar ANTES de guardar. Si el guardado se va por el desagüe, el campo se
      // quedaba pidiendo teclas para siempre y parecía que no se había enterado.
      setRecording(false);
      onChange(parts.join("+"));
    };

    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [recording, onChange]);

  useEffect(() => {
    if (!recording) return;
    const onClickOutside = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setRecording(false);
    };
    window.addEventListener("mousedown", onClickOutside);
    return () => window.removeEventListener("mousedown", onClickOutside);
  }, [recording]);

  const parts = partesDeAtajo(value);
  const assigned = value.trim().length > 0;

  return (
    <div className="flex max-w-[220px] flex-col items-end gap-1">
    <div className="flex items-center gap-1">
    <button
      ref={boxRef}
      type="button"
      onClick={() => setRecording((r) => !r)}
      title={
        recording
          ? t("Pulsa la combinación · las que Windows se reserva no llegan hasta aquí")
          : t("Clic para cambiar el atajo")
      }
      className={`flex h-8 min-w-[132px] items-center justify-end gap-1 rounded-lg border px-2 transition-colors ${
        recording
          ? "animate-pulse border-blue-500 bg-blue-500/10"
          : !assigned
            ? "border-amber-500/40 bg-amber-500/10"
          : active
            ? "border-linea-fuerte bg-hueco hover:border-linea-viva"
            : "border-red-500/40 bg-red-500/10 hover:border-red-400"
      }`}
    >
      {recording ? (
        <span className="w-full text-center text-[11px] text-blue-300">{t("Pulsa las teclas…")}</span>
      ) : !assigned ? (
        <span className="text-[11px] text-amber-500">{t("Sin asignar")}</span>
      ) : (
        parts.map((part, index) => (
          <kbd
            key={`${part}-${index}`}
            className="rounded-[5px] border border-linea-fuerte bg-realce px-1.5 py-0.5 text-[11px] leading-none font-medium text-texto"
          >
            {part}
          </kbd>
        ))
      )}
    </button>
    {assigned && (
      <button
        type="button"
        aria-label={t("Quitar atajo")}
        title={t("Quitar atajo")}
        onClick={() => { setRecording(false); onChange(""); }}
        className="flex size-7 items-center justify-center rounded-md text-tenue hover:bg-realce hover:text-texto"
      >
        <span aria-hidden="true">×</span>
      </button>
    )}
    </div>
    {!assigned && (
      <p role="status" className="text-right text-[10px] text-amber-500">
        {t("Sin atajo de teclado. Usa el menú de la bandeja o la barra de captura.")}
      </p>
    )}
    </div>
  );
}
