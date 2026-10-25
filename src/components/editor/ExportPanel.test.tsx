/**
 * El panel de exportar.
 *
 * Es la ultima pantalla antes de que salga el archivo, y casi todo lo que decide vive en
 * lo que se le manda a Rust, no en lo que se ve. Una casilla que se queda pegada del
 * formato anterior no se nota mirando: se nota cuando alguien abre el archivo.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExportPanel } from "./ExportPanel";
import { aplicarIdioma } from "../../lib/i18n";
import { llamadas, responde } from "../../test/preparar";
import type { SessionInfo } from "../../lib/types";
import { conProporcion, medida, type Recorte } from "../../lib/recorte";

const GRABACION: SessionInfo = {
  videoCodec: "h264",
  id: "s1",
  region: { x: 0, y: 0, width: 800, height: 600 },
  fps: 30,
  frameCount: 90,
  durationMs: 3000,
  hasAudio: true,
  hasClicks: true,
  cursorBaked: false,
  format: "video",
  mp4Path: null,
};

function pintar(session: Partial<SessionInfo> = {}, recorte: Recorte | null = null) {
  return render(
    <ExportPanel
      anotaciones={[]}
      recorte={recorte}
      session={{ ...GRABACION, ...session }}
      inIndex={10}
      outIndex={80}
      currentIndex={42}
      fpsMax={60}
      hasFfmpeg={false}
      saveDirectory="C:\\capturas"
      onRecorte={alRecorte}
    />,
  );
}

/** Lo que el panel le pide al editor sobre el marco de recorte. */
const alRecorte = vi.fn();

/** Lo que se le mando a Rust en la ultima exportacion. */
function loExportado() {
  const llamada = [...llamadas].reverse().find((l) => l.comando === "export_media");
  return (llamada?.args as { request: Record<string, unknown> })?.request;
}

beforeEach(() => {
  aplicarIdioma("es");
  alRecorte.mockClear();
});

describe("elegir el formato", () => {
  it("respeta H.265 elegido antes de grabar sin tener que volver a elegirlo", async () => {
    pintar({ videoCodec: "h265" });
    expect(screen.getByRole("button", { name: "H.265 (HEVC)" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.keyDown(window, { key: "s", ctrlKey: true });
    await waitFor(() => expect(loExportado()).toMatchObject({ videoCodec: "h265" }));
  });

  it("H.264 es el valor inicial y H.265 llega al exportador como eleccion explicita", async () => {
    pintar();
    expect(screen.getByRole("button", { name: "H.264" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "H.265 (HEVC)" }));
    expect(screen.getByRole("button", { name: "H.265 (HEVC)" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.keyDown(window, { key: "s", ctrlKey: true });
    await waitFor(() => expect(loExportado()).toMatchObject({ format: "mp4", videoCodec: "h265" }));
  });

  it("el codec de video no se aplica al cambiar a una imagen", async () => {
    pintar();
    fireEvent.click(screen.getByRole("button", { name: "H.265 (HEVC)" }));
    fireEvent.click(screen.getByText("PNG"));
    expect(screen.queryByRole("button", { name: "H.265 (HEVC)" })).toBeNull();
    fireEvent.keyDown(window, { key: "s", ctrlKey: true });
    await waitFor(() => expect(loExportado()).toMatchObject({ format: "png", videoCodec: "h264" }));
  });

  it("en ingles llama al motor integrado por un nombre ingles", () => {
    aplicarIdioma("en");
    pintar();
    expect(screen.getByText("Built-in encoder")).toBeInTheDocument();
    expect(screen.getByText("Video codec")).toBeInTheDocument();
    expect(screen.queryByText(/Nativ[oa]/)).toBeNull();
  });

  it("una grabacion empieza en MP4 y una captura suelta en PNG", () => {
    const { unmount } = pintar();
    expect(screen.getByText("MP4").className).toContain("bg-activo");
    unmount();
    pintar({ format: "still", frameCount: 1 });
    expect(screen.getByText("PNG").className).toContain("bg-activo");
  });

  it("un titulo de seccion sin nada debajo no sale", () => {
    // Con PNG no hay audio, ni bucle, ni motor que elegir: «El archivo» se quedaba de
    // rotulo suelto encima de un hueco.
    const { unmount } = pintar();
    expect(screen.getByText("El archivo")).toBeInTheDocument();
    unmount();
    pintar({ format: "still", frameCount: 1 });
    expect(screen.queryByText("El archivo")).toBeNull();
  });

  it("estan los cuatro, GIF, MP4, PNG y JPG", () => {
    pintar();
    for (const f of ["GIF", "MP4", "PNG", "JPG"]) {
      expect(screen.getByText(f)).toBeInTheDocument();
    }
  });
});

describe("guardar donde uno quiera", () => {
  it("«Guardar en…» pregunta con el diálogo y exporta al archivo elegido", async () => {
    // Munir, el 19 de septiembre de 2026: «que puedas guardar las capturas donde quieras».
    // La carpeta de ajustes sigue siendo la de siempre; esto es para la captura que va a
    // un proyecto concreto, y tiene que llegar a Rust con el archivo exacto.
    responde("pick_save_file", "C:\\proyectos\\demo\\portada.mp4");
    pintar();
    fireEvent.click(screen.getByLabelText("Elegir dónde guardar"));
    await waitFor(() => expect(loExportado()).toBeTruthy());
    const pregunta = llamadas.find((l) => l.comando === "pick_save_file")?.args as {
      extension: string;
      directory: string;
    };
    expect(pregunta.extension).toBe("mp4");
    expect(pregunta.directory).toContain("capturas");
    expect(loExportado().file).toBe("C:\\proyectos\\demo\\portada.mp4");
  });

  it("si se cancela el diálogo no se exporta nada", async () => {
    responde("pick_save_file", null);
    pintar();
    fireEvent.keyDown(window, { key: "s", ctrlKey: true, shiftKey: true });
    await waitFor(() => expect(llamadas.some((l) => l.comando === "pick_save_file")).toBe(true));
    expect(llamadas.some((l) => l.comando === "export_media")).toBe(false);
  });

  it("Ctrl+S a secas sigue yendo a la carpeta, sin preguntar", async () => {
    pintar();
    fireEvent.keyDown(window, { key: "s", ctrlKey: true });
    await waitFor(() => expect(loExportado()).toBeTruthy());
    expect(llamadas.some((l) => l.comando === "pick_save_file")).toBe(false);
    expect(loExportado().file).toBeNull();
  });
});

describe("JPG, la captura que se puede mandar por correo", () => {
  it("exporta el fotograma en el que se esta, no el trozo recortado", async () => {
    // Es la diferencia entera entre una foto y un video: `from` y `to` tienen que ser el
    // fotograma actual, no el recorte de A a B.
    pintar();
    fireEvent.click(screen.getByText("JPG"));
    fireEvent.click(screen.getByRole("button", { name: /Guardar/ }));
    await screen.findByText(/Guardar/);
    const req = loExportado();
    expect(req.format).toBe("jpg");
    expect(req.from).toBe(42);
    expect(req.to).toBe(42);
  });

  it("lleva barra de calidad, que es su razon de existir", () => {
    pintar();
    fireEvent.click(screen.getByText("JPG"));
    expect(screen.getByText("Calidad")).toBeInTheDocument();
  });

  it("y no lleva fotogramas por segundo, que una foto no tiene", () => {
    pintar();
    fireEvent.click(screen.getByText("JPG"));
    expect(screen.queryByText("Fotogramas por segundo")).toBeNull();
  });

  it("el PNG sigue sin barra de calidad, porque no pierde nada", () => {
    pintar();
    fireEvent.click(screen.getByText("PNG"));
    expect(screen.queryByText("Calidad")).toBeNull();
  });

  it("el video si lleva las dos barras", () => {
    pintar();
    expect(screen.getByText("Calidad")).toBeInTheDocument();
    expect(screen.getByText("Fotogramas por segundo")).toBeInTheDocument();
  });
});

describe("lo que no debe colarse en una foto", () => {
  it("el audio no viaja en un JPG aunque la grabacion lo tuviera", async () => {
    pintar();
    fireEvent.click(screen.getByText("JPG"));
    fireEvent.click(screen.getByRole("button", { name: /Guardar/ }));
    await screen.findByText(/Guardar/);
    expect(loExportado().audio).toBe(false);
  });

  it("y en un MP4 si", async () => {
    pintar();
    fireEvent.click(screen.getByRole("button", { name: /Guardar/ }));
    await screen.findByText(/Guardar/);
    expect(loExportado().audio).toBe(true);
  });
});

describe("recortar la imagen", () => {
  const MITAD_DERECHA: Recorte = { x1: 0.5, y1: 0, x2: 1, y2: 1 };

  it("las dimensiones salen del trozo, no de la captura entera", () => {
    // Ensennar 800 x 600 despues de recortar la mitad seria ensennar el tamanno de algo
    // que ya no se va a exportar.
    pintar({}, MITAD_DERECHA);
    expect(screen.getByLabelText("Ancho")).toHaveValue(400);
    expect(screen.getByLabelText("Alto")).toHaveValue(600);
  });

  it("y el recorte viaja a Rust tal cual, en tanto por uno", async () => {
    pintar({}, MITAD_DERECHA);
    fireEvent.click(screen.getByRole("button", { name: /Guardar/ }));
    await screen.findByText(/Guardar/);
    expect(loExportado().crop).toEqual(MITAD_DERECHA);
  });

  it("el 50 % es la mitad del trozo, no la mitad de la captura entera", async () => {
    // Con el recorte puesto, escalar sobre la captura entera estiraria el trozo al doble.
    pintar({}, MITAD_DERECHA);
    fireEvent.click(screen.getByText("50%"));
    expect(screen.getByLabelText("Ancho")).toHaveValue(200);
    expect(screen.getByLabelText("Alto")).toHaveValue(300);
  });

  it("sin recorte se manda null y salen las medidas de la region grabada", async () => {
    pintar();
    expect(screen.getByLabelText("Ancho")).toHaveValue(800);
    fireEvent.click(screen.getByRole("button", { name: /Guardar/ }));
    await screen.findByText(/Guardar/);
    expect(loExportado().crop).toBeNull();
  });
});

describe("el zoom que se acerca a los clics", () => {
  it("sale con vídeo, apagado de fábrica", () => {
    // Encendido de fábrica sorprende: el vídeo se movería solo sin que nadie lo pida.
    pintar();
    expect(screen.getByText("Acercarse a los clics")).toBeInTheDocument();
    expect(screen.getByText("sin zoom")).toBeInTheDocument();
  });

  it("no sale en una foto, que no tiene tiempo dentro", () => {
    pintar();
    fireEvent.click(screen.getByText("JPG"));
    expect(screen.queryByText("Acercarse a los clics")).toBeNull();
  });

  it("ni cuando la grabación no tuvo un solo clic", () => {
    // Un interruptor que no puede hacer nada es peor que no tenerlo.
    pintar({ hasClicks: false });
    expect(screen.queryByText("Acercarse a los clics")).toBeNull();
  });

  it("apagado se manda 1, que en Rust significa no acercarse", async () => {
    pintar();
    fireEvent.click(screen.getByRole("button", { name: /Guardar/ }));
    await screen.findByText(/Guardar/);
    expect(loExportado().zoom).toBe(1);
  });

  it("y en una foto se manda 1 aunque estuviera puesto", async () => {
    pintar();
    fireEvent.change(screen.getByLabelText("Acercarse a los clics"), { target: { value: "2" } });
    fireEvent.click(screen.getByText("PNG"));
    fireEvent.click(screen.getByRole("button", { name: /Guardar/ }));
    await screen.findByText(/Guardar/);
    expect(loExportado().zoom).toBe(1);
  });

  it("puesto a 2 se manda 2", async () => {
    pintar();
    fireEvent.change(screen.getByLabelText("Acercarse a los clics"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: /Guardar/ }));
    await screen.findByText(/Guardar/);
    expect(loExportado().zoom).toBe(2);
  });
});

describe("el puntero dibujado", () => {
  it("viene encendido al tamanno normal, porque la grabacion ya no lo lleva cocido", () => {
    pintar({ cursorBaked: false, region: { x: 0, y: 0, width: 1920, height: 1080 } });
    const barra = screen.getByLabelText("Puntero dibujado") as HTMLInputElement;
    expect(Number(barra.value)).toBe(43);
  });

  it("y en una grabacion vieja con el cursor cocido empieza apagado, para no ensennar dos", () => {
    pintar({ cursorBaked: true });
    const barra = screen.getByLabelText("Puntero dibujado") as HTMLInputElement;
    expect(Number(barra.value)).toBe(0);
    expect(screen.getByText("el de Windows")).toBeInTheDocument();
  });

  it("sale aunque la grabacion no tenga un solo clic: un video sin clics tambien tiene raton", () => {
    pintar({ hasClicks: false });
    expect(screen.getByLabelText("Puntero dibujado")).toBeInTheDocument();
    expect(screen.queryByLabelText("Acercarse a los clics")).toBeNull();
  });

  it("lo que se decide se avisa hacia arriba, para la vista previa", () => {
    const avisos: unknown[] = [];
    render(
      <ExportPanel
        anotaciones={[]}
        recorte={null}
        session={GRABACION}
        inIndex={10}
        outIndex={80}
        currentIndex={42}
        fpsMax={60}
        hasFfmpeg={false}
        saveDirectory="C:\\capturas"
        onEstudio={(e) => avisos.push(e)}
      />,
    );
    fireEvent.change(screen.getByLabelText("Acercarse a los clics"), { target: { value: "2" } });
    const ultimo = avisos.at(-1) as { zoom: number; cursor: number };
    expect(ultimo.zoom).toBe(2);
    expect(ultimo.cursor).toBe(24);
  });
});

describe("la velocidad", () => {
  /** El botón de cada velocidad, que se lee «2×». */
  const boton = (v: string) => screen.getByRole("button", { name: `${v}×` });

  it("empieza en 1x, que es como se grabo", () => {
    pintar();
    expect(boton("1")).toHaveAttribute("aria-pressed", "true");
  });

  it("no sale en una foto, que no tiene tiempo dentro", () => {
    pintar({ format: "still", frameCount: 1 });
    expect(screen.queryByText("Velocidad")).not.toBeInTheDocument();
  });

  it("a 2x viaja a Rust, y el video se queda sin sonido", async () => {
    pintar();
    fireEvent.click(boton("2"));
    fireEvent.click(screen.getByRole("button", { name: /Guardar/ }));
    await screen.findByRole("button", { name: /Guardar/ });
    // Acelerar la pista sin cambiarle el tono es otro problema entero, y dejarla tal cual
    // la despegaría de la imagen desde el primer segundo. Se dice y se quita.
    expect(loExportado()).toMatchObject({ speed: 2, audio: false });
  });

  it("y lo avisa antes de exportar, no despues", () => {
    pintar();
    fireEvent.click(boton("2"));
    expect(screen.getByText(/sale sin sonido/)).toBeInTheDocument();
  });
});

describe("la proporcion de un clic", () => {
  it("9:16 pide el trozo vertical mas grande que cabe, centrado", () => {
    // Lo que se graba de un monitor sale apaisado SIEMPRE: para subir algo vertical hay
    // que recortar, y a ojo no se acierta un 9:16 exacto.
    pintar();
    fireEvent.click(screen.getByText("9:16"));
    const puesto = alRecorte.mock.calls.at(-1)?.[0] as Recorte;
    // La sesion de prueba es de 800x600.
    expect(medida(puesto, 800, 600)).toEqual({ width: 338, height: 600 });
    expect(puesto.x1).toBeCloseTo(1 - puesto.x2, 6);
  });

  it("y el boton se queda marcado mientras ese recorte siga puesto", () => {
    const vertical = conProporcion(9 / 16, 800, 600);
    pintar({}, vertical);
    expect(screen.getByText("9:16")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("1:1")).toHaveAttribute("aria-pressed", "false");
  });

  it("las dimensiones salen del trozo, no de la captura entera", () => {
    // El fallo que esto evita: exportar un 9:16 con el ancho de la pantalla, que estira
    // la imagen hasta dejarla irreconocible.
    pintar({}, conProporcion(9 / 16, 800, 600));
    expect(screen.getByLabelText("Ancho")).toHaveValue(338);
    expect(screen.getByLabelText("Alto")).toHaveValue(600);
  });

  it("y la × lo quita entero", () => {
    pintar({}, conProporcion(1, 800, 600));
    fireEvent.click(screen.getByLabelText("Quitar el recorte"));
    expect(alRecorte).toHaveBeenCalledWith(null);
  });
});
