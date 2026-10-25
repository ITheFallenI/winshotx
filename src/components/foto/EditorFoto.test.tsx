/**
 * El editor de capturas entero: que dibujar, elegir, deshacer y cambiar un texto hacen lo
 * que dicen, con el ratón y con el teclado.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EditorApp } from "../editor/EditorApp";
import { aplicarIdioma } from "../../lib/i18n";
import { llamadas, responde } from "../../test/preparar";

const destruir = vi.fn();
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    label: "editor-1",
    destroy: destruir,
    setTitle: () => Promise.resolve(),
    onCloseRequested: () => Promise.resolve(() => {}),
  }),
}));

async function abrir() {
  responde("session_info", {
    id: "s1",
    region: { x: 0, y: 0, width: 800, height: 500 },
    fps: 30,
    frameCount: 1,
    durationMs: 0,
    hasAudio: false,
    format: "still",
    mp4Path: null,
  });
  responde("session_frames", [{ index: 0, timestampMs: 0, durationMs: 0, thumbPath: "C:\\t\\0.png" }]);
  responde("frame_image", "C:\\t\\full.png");
  responde("get_settings", { saveDirectory: "C:\\capturas", theme: "oscuro", language: "es" });
  responde("ffmpeg_available", false);
  const vista = render(<EditorApp sessionId="s1" />);
  await waitFor(() => expect(screen.getByRole("navigation", { name: "Herramientas" })).toBeInTheDocument());
  // Abre con «Mover vista»; casi todas las pruebas dibujan, así que cogen la flecha.
  expect(screen.getByRole("button", { name: "Mover vista (H)" })).toHaveAttribute("aria-pressed", "true");
  fireEvent.keyDown(window, { key: "a" });
  return vista;
}

const lienzo = (c: HTMLElement) => c.querySelector("[data-lienzo]") as HTMLElement;

function arrastrar(el: HTMLElement, desde: [number, number], hasta: [number, number]) {
  fireEvent.pointerDown(el, { button: 0, clientX: desde[0], clientY: desde[1], pointerId: 1 });
  fireEvent.pointerMove(el, { clientX: (desde[0] + hasta[0]) / 2, clientY: (desde[1] + hasta[1]) / 2, pointerId: 1 });
  fireEvent.pointerMove(el, { clientX: hasta[0], clientY: hasta[1], pointerId: 1 });
  fireEvent.pointerUp(el, { clientX: hasta[0], clientY: hasta[1], pointerId: 1 });
}

const capas = () => screen.getByRole("region", { name: "Capas" });

beforeEach(() => {
  aplicarIdioma("es");
  destruir.mockClear();
  localStorage.clear();
});

describe("el editor de capturas", () => {
  it("una captura abre el editor de imágenes, con las herramientas nombradas", async () => {
    await abrir();
    for (const nombre of ["Seleccionar", "Recortar", "Flecha", "Texto", "Pixelar"]) {
      expect(screen.getByRole("button", { name: new RegExp(nombre) })).toBeInTheDocument();
    }
    // Una captura solo se guarda como foto.
    expect(screen.queryByRole("button", { name: /^MP4$/ })).toBeNull();
  });

  it("arrastrar con la flecha deja una capa, y Ctrl+Z la quita", async () => {
    const { container } = await abrir();
    arrastrar(lienzo(container), [100, 100], [300, 200]);
    await waitFor(() => expect(capas()).toHaveTextContent("Flecha"));
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    await waitFor(() => expect(capas()).not.toHaveTextContent("Flecha"));
  });

  it("un clic sin arrastrar no deja una flecha invisible", async () => {
    const { container } = await abrir();
    arrastrar(lienzo(container), [100, 100], [101, 101]);
    expect(capas()).not.toHaveTextContent("Flecha");
  });

  it("Ctrl+A elige todas las marcas y Supr las borra", async () => {
    const { container } = await abrir();
    arrastrar(lienzo(container), [100, 100], [300, 200]);
    fireEvent.keyDown(window, { key: "u" });
    arrastrar(lienzo(container), [400, 100], [500, 200]);
    fireEvent.keyDown(window, { key: "a", ctrlKey: true });
    await waitFor(() => expect(screen.getByText("2 marcas elegidas")).toBeInTheDocument());
    fireEvent.keyDown(window, { key: "Delete" });
    await waitFor(() => expect(capas()).not.toHaveTextContent("Forma"));
    expect(capas()).not.toHaveTextContent("Flecha");
  });

  it("el texto se escribe en su sitio y se puede cambiar después", async () => {
    const { container } = await abrir();
    fireEvent.keyDown(window, { key: "t" });
    fireEvent.pointerDown(lienzo(container), { button: 0, clientX: 200, clientY: 200, pointerId: 1 });
    const caja = await screen.findByPlaceholderText("Escribe aquí");
    fireEvent.change(caja, { target: { value: "hola" } });
    fireEvent.keyDown(caja, { key: "Enter" });
    await waitFor(() => expect(capas()).toHaveTextContent("Texto «hola»"));

    // Con el texto puesto, pinchar en él lo vuelve a abrir con lo que decía.
    fireEvent.pointerDown(lienzo(container), { button: 0, clientX: 222, clientY: 198, pointerId: 1 });
    const otra = await screen.findByPlaceholderText("Escribe aquí");
    expect(otra).toHaveValue("hola");
    fireEvent.change(otra, { target: { value: "adiós" } });
    fireEvent.keyDown(otra, { key: "Enter" });
    await waitFor(() => expect(capas()).toHaveTextContent("Texto «adiós»"));
    expect(capas()).not.toHaveTextContent("hola");
  });

  it("Escape suelta la herramienta antes de cerrar, y con cambios pregunta", async () => {
    const { container } = await abrir();
    arrastrar(lienzo(container), [100, 100], [300, 200]);
    fireEvent.keyDown(window, { key: "Escape" }); // suelta lo elegido
    fireEvent.keyDown(window, { key: "Escape" }); // vuelve a «Seleccionar»
    expect(destruir).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.getByRole("alertdialog")).toBeInTheDocument());
    expect(destruir).not.toHaveBeenCalled();
  });

  it("el recorte se aplica con su botón y la medida sale abajo", async () => {
    await abrir();
    fireEvent.keyDown(window, { key: "c" });
    fireEvent.click(screen.getByRole("button", { name: "1:1" }));
    fireEvent.click(screen.getByRole("button", { name: "Aplicar recorte" }));
    await waitFor(() => expect(screen.getByText("500 × 500 px")).toBeInTheDocument());
  });

  it("Ctrl+G mete lo elegido en una carpeta, y la carpeta se elige y se esconde entera", async () => {
    const { container } = await abrir();
    arrastrar(lienzo(container), [100, 100], [300, 200]);
    fireEvent.keyDown(window, { key: "u" });
    arrastrar(lienzo(container), [400, 100], [500, 200]);
    fireEvent.keyDown(window, { key: "a", ctrlKey: true });
    fireEvent.keyDown(window, { key: "g", ctrlKey: true });
    const carpeta = await screen.findByRole("button", { name: "Carpeta 1" });

    // Pinchar en una sola marca de la carpeta elige la carpeta entera.
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.pointerDown(lienzo(container), { button: 0, clientX: 200, clientY: 150, pointerId: 1 });
    fireEvent.pointerUp(lienzo(container), { clientX: 200, clientY: 150, pointerId: 1 });
    await waitFor(() => expect(screen.getByText("2 marcas elegidas")).toBeInTheDocument());

    fireEvent.click(within(carpeta).getByRole("button", { name: "Esconder" }));
    expect(within(capas()).getByRole("button", { name: "Carpeta 1" })).toHaveClass("opacity-50");

    // Ctrl+Mayús+G las saca, y la carpeta vacía desaparece sola.
    fireEvent.keyDown(window, { key: "g", ctrlKey: true, shiftKey: true });
    await waitFor(() => expect(screen.queryByRole("button", { name: "Carpeta 1" })).toBeNull());
  });

  it("el texto sale negro de fábrica y se puede cambiar de letra", async () => {
    await abrir();
    fireEvent.keyDown(window, { key: "t" });
    expect(screen.getByRole("button", { name: "#000000" })).toHaveAttribute("aria-pressed", "true");
    const letra = screen.getByRole("combobox", { name: "Tipo de letra" });
    fireEvent.change(letra, { target: { value: "Georgia" } });
    expect(letra).toHaveValue("Georgia");
    fireEvent.click(screen.getByRole("button", { name: "Cursiva" }));
    expect(screen.getByRole("button", { name: "Cursiva" })).toHaveAttribute("aria-pressed", "true");
  });

  it("la barra de menús de arriba está siempre, con los atajos al lado", async () => {
    const { container } = await abrir();
    arrastrar(lienzo(container), [100, 100], [300, 200]);
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.click(screen.getByRole("menuitem", { name: "Editar" }));
    const elegirTodo = screen.getByRole("menuitem", { name: /Elegir todo/ });
    expect(elegirTodo).toHaveTextContent("Ctrl+A");
    fireEvent.click(elegirTodo);
    await waitFor(() => expect(screen.getByText("1 marca elegida")).toBeInTheDocument());
    // Escape con un menú abierto lo cierra y no cierra el editor.
    fireEvent.click(screen.getByRole("menuitem", { name: "Ver" }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    fireEvent.keyDown(window, { key: "F1" });
    expect(screen.getByRole("dialog", { name: "Atajos de teclado" })).toBeInTheDocument();
  });

  it("Ctrl+Z deshace aunque el foco se quedara en el deslizador del grosor", async () => {
    const { container } = await abrir();
    const grosor = screen.getByRole("slider", { name: "Grosor" });
    grosor.focus();
    arrastrar(lienzo(container), [100, 100], [300, 200]);
    await waitFor(() => expect(capas()).toHaveTextContent("Flecha"));
    // Pinchar en la imagen le quita el foco al deslizador...
    expect(document.activeElement).not.toBe(grosor);
    // ...y aunque lo tuviera, Ctrl+Z en un deslizador sigue siendo del editor.
    fireEvent.keyDown(grosor, { key: "z", ctrlKey: true });
    await waitFor(() => expect(capas()).not.toHaveTextContent("Flecha"));
  });

  it("debajo de las capas hay una carpeta nueva, y el clic derecho mete capas en ella", async () => {
    const { container } = await abrir();
    arrastrar(lienzo(container), [100, 100], [300, 200]);
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.click(within(capas()).getByRole("button", { name: /Carpeta nueva/ }));
    expect(await within(capas()).findByText(/vacía/)).toBeInTheDocument();

    fireEvent.contextMenu(within(capas()).getByRole("button", { name: /Flecha/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Meter en «Carpeta 1»" }));
    await waitFor(() => expect(within(capas()).queryByText(/vacía/)).toBeNull());
    expect(within(capas()).getByRole("button", { name: "Carpeta 1" })).toHaveTextContent("1");
  });

  it("una capa bloqueada no se elige con Ctrl+A ni se borra, hasta desbloquearla", async () => {
    const { container } = await abrir();
    arrastrar(lienzo(container), [100, 100], [300, 200]);
    fireEvent.keyDown(window, { key: "Escape" });
    const flecha = within(capas()).getByRole("button", { name: /Flecha/ });
    fireEvent.click(within(flecha).getByRole("button", { name: "Bloquear" }));
    expect(within(flecha).getByRole("button", { name: "Desbloquear" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.keyDown(window, { key: "a", ctrlKey: true });
    expect(screen.queryByText("1 marca elegida")).toBeNull();
    // Elegida desde el panel, Supr tampoco la borra.
    fireEvent.click(flecha);
    fireEvent.keyDown(window, { key: "Delete" });
    expect(capas()).toHaveTextContent("Flecha");

    // Ctrl+L la desbloquea, y ya se borra.
    fireEvent.click(flecha);
    fireEvent.keyDown(window, { key: "l", ctrlKey: true });
    await waitFor(() => expect(within(capas()).getByRole("button", { name: /Flecha/ })).not.toHaveTextContent("Desbloquear"));
    fireEvent.click(within(capas()).getByRole("button", { name: /Flecha/ }));
    fireEvent.keyDown(window, { key: "Delete" });
    await waitFor(() => expect(capas()).not.toHaveTextContent("Flecha"));
  });

  it("una capa se arrastra con el ratón dentro de una carpeta", async () => {
    const { container } = await abrir();
    arrastrar(lienzo(container), [100, 100], [300, 200]);
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.click(within(capas()).getByRole("button", { name: /Carpeta nueva/ }));
    const carpeta = await within(capas()).findByRole("button", { name: "Carpeta 1" });
    const flecha = within(capas()).getByRole("button", { name: /Flecha/ });

    // jsdom no sabe qué hay debajo del ratón: se le dice que es la carpeta.
    const antes = document.elementFromPoint;
    document.elementFromPoint = () => carpeta;
    try {
      fireEvent.pointerDown(flecha, { button: 0, clientX: 10, clientY: 10 });
      fireEvent.pointerMove(window, { clientX: 10, clientY: 40 });
      expect(await screen.findByText(/→ Carpeta 1/)).toBeInTheDocument();
      fireEvent.pointerUp(window, { clientX: 10, clientY: 40 });
    } finally {
      document.elementFromPoint = antes;
    }
    await waitFor(() => expect(within(capas()).getByRole("button", { name: "Carpeta 1" })).toHaveTextContent("1"));
    expect(within(capas()).queryByText(/vacía/)).toBeNull();
  });

  it("sin la imagen cargada todavía, Ctrl+C lo dice en vez de copiar nada", async () => {
    await abrir();
    fireEvent.keyDown(window, { key: "c", ctrlKey: true });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("todavía se está cargando"));
    expect(llamadas.some((l) => l.comando === "copiar_imagen")).toBe(false);
  });
});
