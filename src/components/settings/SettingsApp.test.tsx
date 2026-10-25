/**
 * La pantalla de ajustes, que es la unica de winshotx que se ve entera y con calma.
 *
 * Lo que se comprueba aqui es que las cuatro secciones existen, que cada una lleva lo suyo
 * y que **en ingles no se queda ni una frase en castellano**. Eso ultimo no lo puede ver
 * la prueba del diccionario: una frase puede estar traducida en `textos-en.ts` y salir en
 * espannol igual, porque el componente la escribio a pelo sin pasarla por `t()`. Ha pasado.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsApp } from "./SettingsApp";
import { aplicarIdioma } from "../../lib/i18n";
import { emite, llamadas, responde } from "../../test/preparar";
import { EVENTS, type ReplayStatus, type Settings } from "../../lib/types";

vi.mock("@tauri-apps/plugin-updater", () => ({
  check: () => Promise.resolve(null),
}));

/** El anillo apagado, que es como viene winshotx de fabrica. */
const PARADO: ReplayStatus = {
  running: false,
  seconds: 0,
  screen: 0,
  screenLabel: "",
  bytes: 0,
  bytesPerSecond: 0,
  width: 0,
  height: 0,
  bufferedMs: 0,
};

const AJUSTES: Settings = {
  trayClickAction: "latestFolder",
  videoCodec: "h264",
  captureShortcut: "Ctrl+Shift+2",
  editShortcut: "Super+Shift+KeyL",
  theme: "sistema",
  language: "sistema",
  recordShortcut: "Ctrl+Shift+5",
  replayShortcut: "Ctrl+Shift+6",
  saveDirectory: "C:\\Users\\prueba\\Pictures\\winshotx",
  copyAfterCapture: true,
  openEditorAfterRecording: true,
  captureCursor: false,
  recordAudio: true,
  recordMicrophone: false,
  highlightClicks: false,
  highlightKeys: false,
  fps: 30,
  replayEnabled: false,
  replaySeconds: 30,
  replayScreen: null,
  replayFps: 15,
  replayHeight: 0,
  playSound: true,
  showMagnifier: true,
  windowHighlight: true,
  windowHighlightColor: "#f97316",
  instantSave: false,
  startWithWindows: false,
  captureDelaySeconds: 0,
  hideDesktopIcons: false,
  captureFlow: "toolbar",
  printScreenCapture: false,
  takeWinShiftS: false,
  adminShortcuts: false,
  onboarded: true,
  snippingKeyRestore: null,
  disabledHotkeysRestore: null,
};

/** Monta los ajustes con Rust contestando datos de mentira, y espera a que carguen. */
async function abrirAjustes(
  replay?: ReplayStatus,
  pantallas?: unknown[],
  ajustes?: Partial<Settings>,
  capturaModerna = true,
) {
  responde("get_settings", { ...AJUSTES, ...ajustes });
  responde("shortcut_status", {
    capture: true,
    record: true,
    replay: true,
    printScreen: false,
    winShiftS: false,
  });
  responde("cache_stats", { bytes: 12_345_678, sessions: 3 });
  responde("print_screen_state", { enabled: false, active: false });
  responde("just_updated", false);
  responde("replay_status", replay ?? PARADO);
  responde("list_screens", pantallas ?? []);
  responde("captura_moderna", capturaModerna);
  render(<SettingsApp onVerBienvenida={vi.fn()} />);
  // La pantalla se pinta vacia y se rellena cuando contesta Rust.
  await waitFor(() => expect(screen.getByRole("button", { name: /Capturar|Capture/ })).toBeInTheDocument());
}

beforeEach(() => aplicarIdioma("es"));

describe("el codec se elige antes de grabar", () => {
  it("guarda H.265 desde Grabar y conserva la eleccion al volver a abrir", async () => {
    aplicarIdioma("en");
    await abrirAjustes();
    fireEvent.click(screen.getByRole("button", { name: "Record" }));
    expect(screen.getByText("Before recording")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "H.265 (HEVC)" }));
    await waitFor(() => expect(llamadas.filter((l) => l.comando === "set_settings").at(-1)?.args)
      .toMatchObject({ settings: { videoCodec: "h265" } }));
    responde("get_settings", { ...AJUSTES, videoCodec: "h265" });
    emite(EVENTS.settingsShown, null);
    await waitFor(() => expect(screen.getByRole("button", { name: "H.265 (HEVC)" }))
      .toHaveAttribute("aria-pressed", "true"));
  });
});

describe("F2 para capturar region", () => {
  it("quitar la captura guarda un valor vacio y avisa sin marcar un conflicto", async () => {
    await abrirAjustes();
    responde("shortcut_status", {
      capture: false, edit: true, record: true, replay: false,
      printScreen: false, winShiftS: false,
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Quitar atajo" })[0]);
    await waitFor(() => expect(llamadas.filter((l) => l.comando === "set_settings").at(-1)?.args)
      .toMatchObject({ settings: { captureShortcut: "" } }));
    expect(screen.getByText("Sin asignar")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Sin atajo de teclado");
    expect(screen.queryByText("esa combinación está ocupada")).toBeNull();
  });

  it("guarda F2 por IPC, conserva los otros ajustes y lo relee al abrir", async () => {
    await abrirAjustes();
    fireEvent.click(screen.getAllByTitle("Clic para cambiar el atajo")[0]);
    fireEvent.keyDown(window, { key: "F2", code: "F2" });

    const esperado = { ...AJUSTES, captureShortcut: "F2" };
    await waitFor(() => {
      expect(llamadas.filter((l) => l.comando === "set_settings")).toEqual([
        { comando: "set_settings", args: { settings: esperado } },
      ]);
    });
    expect(screen.getAllByTitle("Clic para cambiar el atajo")[0]).toHaveTextContent(/^F2$/);

    responde("get_settings", esperado);
    emite(EVENTS.settingsShown, null);
    await waitFor(() => expect(llamadas.filter((l) => l.comando === "get_settings")).toHaveLength(2));
    expect(screen.getAllByTitle("Clic para cambiar el atajo")[0]).toHaveTextContent(/^F2$/);
  });

  it("sigue avisando cuando Rust no consigue registrar F2", async () => {
    await abrirAjustes();
    responde("shortcut_status", {
      capture: false, edit: true, record: true, replay: false,
      printScreen: false, winShiftS: false,
    });
    fireEvent.click(screen.getAllByTitle("Clic para cambiar el atajo")[0]);
    fireEvent.keyDown(window, { key: "F2", code: "F2" });
    await waitFor(() => {
      expect(screen.getAllByTitle("Clic para cambiar el atajo")[0]).toHaveClass("border-red-500/40");
    });
    expect(screen.getByText("esa combinación está ocupada")).toBeInTheDocument();
    expect(screen.getAllByTitle("Clic para cambiar el atajo")[0]).toHaveTextContent(/^F2$/);
  });
});

describe("las secciones", () => {
  it("van en la columna de la izquierda, cada una con su icono y su nombre, como las herramientas del editor", async () => {
    await abrirAjustes();
    const menu = screen.getByLabelText("Secciones de ajustes");
    const nombres = within(menu)
      .getAllByRole("button")
      .map((b) => b.getAttribute("aria-label") ?? b.textContent);
    expect(nombres).toEqual(["Capturar", "Grabar", "Galería", "Teclas", "Ajustes"]);
    for (const nombre of nombres) expect(within(menu).getByRole("button", { name: nombre! }).querySelector("svg")).not.toBeNull();
    expect(within(menu).getByRole("button", { name: "Capturar" })).toHaveAttribute("aria-pressed", "true");
  });

  it("en ingles se llaman por su nombre ingles", async () => {
    aplicarIdioma("en");
    await abrirAjustes();
    const menu = screen.getByLabelText("Settings sections");
    const nombres = within(menu)
      .getAllByRole("button")
      .map((b) => b.getAttribute("aria-label") ?? b.textContent);
    expect(nombres).toEqual(["Capture", "Record", "Gallery", "Keys", "Settings"]);
  });

  it("opens Gallery inside the current window and stops it when leaving", async () => {
    responde("gallery_list", { items: [], total: 0, directory: "C:/captures" });
    await abrirAjustes();
    fireEvent.click(screen.getByRole("button", { name: "Galería" }));
    expect(screen.getByLabelText("Buscar capturas")).toBeInTheDocument();
    expect(llamadas.some(c => c.comando === "open_gallery")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Capturar" }));
    expect(screen.queryByLabelText("Buscar capturas")).toBeNull();
  });

  it("handles a pending tray Gallery request and later opening requests", async () => {
    responde("take_gallery_request", true);
    responde("gallery_list", { items: [], total: 0, directory: "C:/captures" });
    await abrirAjustes();
    await screen.findByLabelText("Buscar capturas");
    fireEvent.click(screen.getByRole("button", { name: "Capturar" }));
    emite(EVENTS.settingsShown, null);
    await screen.findByLabelText("Buscar capturas");
  });

  it("empieza por Capturar, que es lo que se viene a cambiar", async () => {
    await abrirAjustes();
    expect(screen.getByText("Al pulsar el atajo")).toBeInTheDocument();
  });
});

describe("con la aplicacion en ingles", () => {
  /**
   * Frases que delatan que algo se quedo sin traducir. Se buscan en el texto de la
   * pantalla entera: si alguna aparece, hay un componente escribiendo espannol a pelo.
   */
  const DELATORAS = [
    "Al pulsar el atajo",
    "Sale la barra",
    "Se copia sola",
    "Sin espera",
    "Automático",
    "segundos",
    "Carpeta",
    "Versión",
  ];

  it("no queda ni una frase en castellano por ningun rincon", async () => {
    aplicarIdioma("en");
    await abrirAjustes();
    const pantalla = document.body.textContent ?? "";
    const coladas = DELATORAS.filter((frase) => pantalla.includes(frase));
    expect(coladas).toEqual([]);
  });

  it("y la version se sigue leyendo, con su palabra delante", async () => {
    aplicarIdioma("en");
    await abrirAjustes();
    expect(screen.getByText(/^Version /)).toBeInTheDocument();
  });
});

describe("lo que ensenna de la maquina, en «La app»", () => {
  /** Los archivos y la version viven en la ultima seccion, no en la primera. */
  async function irALaApp() {
    await abrirAjustes();
    fireEvent.click(screen.getByRole("button", { name: "Ajustes" }));
  }

  it("dice cuanto ocupa la cache en unidades que se entienden", async () => {
    await irALaApp();
    // 12.345.678 bytes son 11,8 MB.
    expect(screen.getByText(/11[,.]8 MB/)).toBeInTheDocument();
  });

  it("ensenna la carpeta donde caen las capturas", async () => {
    await irALaApp();
    expect(screen.getByText(/Pictures.winshotx/)).toBeInTheDocument();
  });

  it("y el numero de version, que es lo primero que se mira al reportar un fallo", async () => {
    await irALaApp();
    expect(screen.getByText(/^Versión \d+\.\d+\.\d+$/)).toBeInTheDocument();
  });

  it("removes About and keeps the bottom bar free of the Tour button", async () => {
    await irALaApp();
    expect(screen.queryByText("Acerca de")).toBeNull();
    expect(screen.queryByText("winshotx.com")).toBeNull();
    expect(within(screen.getByRole("contentinfo")).queryByRole("button", { name: /Tour/ })).toBeNull();
  });

  it("defaults tray click to the latest saved folder and persists every alternative", async () => {
    await irALaApp();
    const selector = screen.getByRole("combobox", { name: "Clic izquierdo" });
    expect(selector).toHaveValue("latestFolder");
    for (const action of ["capture", "record", "gallery", "settings", "captureFolder", "latestFolder"]) {
      fireEvent.change(selector, { target: { value: action } });
      await waitFor(() => expect(llamadas.filter(c => c.comando === "set_settings").at(-1)?.args)
        .toMatchObject({ settings: { trayClickAction: action } }));
    }
  });
});

/**
 * El tour se cierra donde se pide ayuda, y esa es la unica parada que tiene un boton que
 * saca de la aplicacion. Lo que se comprueba es que se llega hasta el final y que ese
 * boton lleva donde dice: el resto del recorrido se mira en foto, porque es colocacion.
 */
describe("el tour de los ajustes", () => {
  async function hastaElFinal() {
    await abrirAjustes();
    fireEvent.click(screen.getByRole("button", { name: "Ajustes" }));
    fireEvent.click(screen.getByRole("button", { name: "Empezar" }));
    // «Siguiente» hasta que el boton cambia a «Listo», que es como se sabe que es la
    // ultima. Contar las paradas a mano dejaria la prueba pidiendo un numero cada vez que
    // se anade una.
    for (let i = 0; i < 20; i += 1) {
      const siguiente = screen.queryByRole("button", { name: "Siguiente" });
      if (!siguiente) break;
      fireEvent.click(siguiente);
    }
    expect(screen.getByRole("button", { name: "Listo" })).toBeInTheDocument();
  }

  it("ends on the tray setting and closes normally", async () => {
    await hastaElFinal();
    expect(screen.getByText("El icono a tu manera")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Listo" }));
    expect(screen.queryByText("El icono a tu manera")).toBeNull();
  });

  it("y ninguna otra parada pide nada", async () => {
    await abrirAjustes();
    fireEvent.click(screen.getByRole("button", { name: "Ajustes" }));
    fireEvent.click(screen.getByRole("button", { name: "Empezar" }));
    expect(screen.queryByRole("button", { name: /Invítame a un café/ })).not.toBeInTheDocument();
  });
});

/**
 * Los ultimos segundos es la unica funcion que trabaja sin que nadie se lo haya pedido en
 * ese momento, asi que lo que se comprueba aqui es que la pantalla lo CUENTE: que esta
 * encendido, sobre que pantalla y con cuanto guardado. Un interruptor mudo seria peor que
 * no tener la funcion.
 */
describe("los ultimos segundos, en «Grabar»", () => {
  async function irAGrabar(
    replay?: ReplayStatus,
    pantallas?: unknown[],
    ajustes?: Partial<Settings>,
  ) {
    await abrirAjustes(replay, pantallas, ajustes);
    // El nombre del boton cambia con el idioma, y una de estas pruebas va en ingles.
    fireEvent.click(screen.getByRole("button", { name: /^(Grabar|Record)$/ }));
  }

  const CORRIENDO: ReplayStatus = {
    running: true,
    seconds: 30,
    screen: 2,
    screenLabel: "DELL U2723QE",
    bytes: 48_234_496,
    bytesPerSecond: 3_400_000,
    width: 1280,
    height: 720,
    bufferedMs: 30_000,
  };

  it("apagado, explica lo que va a hacer antes de que nadie lo encienda", async () => {
    await irAGrabar();
    expect(screen.getByText("Los últimos segundos")).toBeInTheDocument();
    expect(screen.getByText(/graba sin parar y tira lo viejo/)).toBeInTheDocument();
  });

  /**
   * Lo que de verdad cuesta tenerlo puesto no son los megabytes guardados, que se quedan
   * quietos en cuanto el anillo se llena: es lo que le escribe al disco cada segundo, que
   * sigue pasando toda la tarde. Por eso la fila enseña las dos cosas y el tamaño real.
   */
  it("encendido, dice de dónde graba, a qué tamaño y lo que le cuesta al disco", async () => {
    await irAGrabar(CORRIENDO);
    // El número de pantalla, no el nombre que le pone Windows: «\.\DISPLAY3» no le
    // dice nada a nadie, y el número es el mismo que sale al elegirla para capturar.
    expect(screen.getByText(/pantalla 2/)).toBeInTheDocument();
    expect(screen.getByText(/1280 × 720/)).toBeInTheDocument();
    expect(screen.getByText(/3[,.]2 MB\/s/)).toBeInTheDocument();
  });

  it("si hay menos de lo que promete el ajuste, dice cuanto hay de verdad", async () => {
    // Pasa mientras se llena, y pasa para siempre en una pantalla que cambia tanto que el
    // tope de disco tira lo viejo antes de tiempo. Prometer treinta y dar ocho seria
    // mentir justo cuando alguien va a pulsar la tecla.
    await irAGrabar({ ...CORRIENDO, bufferedMs: 8_400 });
    expect(screen.getByText(/ahora mismo hay 8 s guardados/)).toBeInTheDocument();
  });

  it("apagado, la tecla no promete nada que no vaya a pasar", async () => {
    await irAGrabar();
    expect(screen.getByText("primero hay que encenderlo aquí arriba")).toBeInTheDocument();
  });

  /**
   * Munir tuvo el anillo semanas a 60 fotogramas y resolución nativa, que entonces era el
   * 86% de un núcleo todo el día, y lo que notó fue que el ordenador iba con lag y que el
   * atajo tardaba en abrir la captura. Nadie elige eso sabiendo lo que cuesta: se elige
   * porque suena a mejor. Ahora lo dice la propia fila, y en rojo, con lo medido el 17 de
   * septiembre de 2026 (22% quieto, hasta el 60% en movimiento).
   */
  it("la combinación más cara dice lo que cuesta, y avisa", async () => {
    await irAGrabar(undefined, undefined, { replayFps: 60, replayHeight: 0 });
    const coste = screen.getByText(/22% de un núcleo.*60%/);
    expect(coste).toBeInTheDocument();
    expect(coste.className).toMatch(/amber|warn|yellow/);
  });

  it("y la combinación de en medio dice la suya", async () => {
    await irAGrabar(undefined, undefined, { replayFps: 30, replayHeight: 1080 });
    expect(screen.getByText(/17% de un núcleo/)).toBeInTheDocument();
  });

  /**
   * Solo se midieron esas dos. Las otras siete saldrían de extrapolar dos puntos, o sea
   * de inventarse un número y ponérselo delante a quien decide.
   */
  it("y de las que no se midieron no se inventa ninguna cifra", async () => {
    await irAGrabar(undefined, undefined, { replayFps: 15, replayHeight: 720 });
    expect(screen.getByText("fotogramas por segundo")).toBeInTheDocument();
    expect(screen.queryByText(/% de un núcleo/)).toBeNull();
  });

  it("en ingles no se cuela ni una palabra en castellano", async () => {
    aplicarIdioma("en");
    await irAGrabar(CORRIENDO);
    const pantalla = document.body.textContent ?? "";
    const coladas = [
      "Los últimos segundos",
      "Grabar siempre",
      "Cuánto se guarda",
      "Quedarme con",
      "vigilando",
    ].filter((frase) => pantalla.includes(frase));
    expect(coladas).toEqual([]);
  });
});

/**
 * La barra de abajo.
 *
 * Lo que la justifica es que esté SIEMPRE, así que lo que hay que comprobar no es que
 * exista, sino que siga ahí al cambiar de sección y que sus atajos cambien el ajuste de
 * verdad, y no solo se pinten.
 */
describe("la barra de abajo", () => {
  const barra = () => screen.getByRole("contentinfo");

  it("está en las cuatro secciones, no solo en la primera", async () => {
    await abrirAjustes();
    expect(within(barra()).getByText("Al soltar")).toBeInTheDocument();

    for (const nombre of ["Grabar", "Teclas", "Ajustes"]) {
      fireEvent.click(screen.getByRole("button", { name: nombre }));
      expect(within(barra()).getByRole("group", { name: "Tema" })).toBeInTheDocument();
    }
  });

  it("lo de actualizar está aquí y ya no dentro de una sección", async () => {
    await abrirAjustes();
    // Lo de actualizar vive en la barra, a la vista desde cualquier sitio, aunque estando
    // al día sea solo un tick.
    await waitFor(() =>
      expect(
        within(barra()).getByRole("button", { name: "estás en la última versión" }),
      ).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Ajustes" }));
    expect(screen.queryByText("Actualizaciones")).toBeNull();
  });

  it("estando al día no gasta sitio en decirlo: solo un tick", async () => {
    // «Estás en la última versión» es la respuesta casi todos los días, y se llevaba un
    // cuarto de la barra para no contar nada. La frase vuelve cuando hay algo que decir.
    await abrirAjustes();
    await waitFor(() =>
      expect(
        within(barra()).getByRole("button", { name: "estás en la última versión" }),
      ).toBeInTheDocument(),
    );
    expect(within(barra()).queryByText("estás en la última versión")).toBeNull();
    expect(within(barra()).queryByRole("button", { name: /Buscar/ })).toBeNull();
  });

  it("cambiar lo que pasa al soltar el ratón viaja hasta Rust", async () => {
    await abrirAjustes();
    fireEvent.click(within(barra()).getByRole("button", { name: "Copia" }));

    await waitFor(() => {
      const guardados = llamadas.filter((l) => l.comando === "set_settings");
      expect(guardados.at(-1)?.args).toMatchObject({
        settings: expect.objectContaining({ captureFlow: "instant" }),
      });
    });
  });

  it("y el idioma, que además se cambia en el acto", async () => {
    await abrirAjustes();
    fireEvent.click(within(barra()).getByRole("button", { name: "EN" }));

    // Sin recargar nada: la propia barra ya está en inglés.
    await waitFor(() => expect(within(barra()).getByText("When you let go")).toBeInTheDocument());
    const guardados = llamadas.filter((l) => l.comando === "set_settings");
    expect(guardados.at(-1)?.args).toMatchObject({
      settings: expect.objectContaining({ language: "en" }),
    });
  });
});

/** Tres monitores como los de Munir, con el principal marcado. */
const TRES_PANTALLAS = [
  { id: 0, label: "\\.\DISPLAY1", x: 0, y: 0, width: 1920, height: 1080, scale: 1, isPrimary: true },
  { id: 1, label: "\\.\DISPLAY2", x: 1920, y: 0, width: 1080, height: 1920, scale: 1, isPrimary: false },
  { id: 2, label: "\\.\DISPLAY3", x: -1920, y: 0, width: 1920, height: 1080, scale: 1, isPrimary: false },
];

describe("elegir pantalla y calidad", () => {
  async function irAGrabar(pantallas: unknown[] = TRES_PANTALLAS) {
    await abrirAjustes(undefined, pantallas);
    fireEvent.click(screen.getByRole("button", { name: /^(Grabar|Record)$/ }));
  }

  it("con una sola pantalla no pregunta cuál: elegir entre una es ruido", async () => {
    await irAGrabar([TRES_PANTALLAS[0]]);
    expect(screen.queryByText("Qué pantalla")).not.toBeInTheDocument();
  });

  it("con tres, se elige, y de fábrica va donde esté el ratón", async () => {
    await irAGrabar();
    expect(screen.getByText("Qué pantalla")).toBeInTheDocument();
    const elegida = screen.getByRole("button", { name: "Ratón" });
    expect(elegida).toHaveAttribute("aria-pressed", "true");
  });

  it("al elegir la segunda, viaja a Rust por su número interno", async () => {
    await irAGrabar();
    fireEvent.click(screen.getByRole("button", { name: "2" }));
    const ultima = [...llamadas].reverse().find((l) => l.comando === "set_settings");
    expect((ultima?.args as { settings: Record<string, unknown> }).settings).toMatchObject({
      replayScreen: 1,
    });
  });

  /**
   * Los segundos no dicen nada de lo que cuestan: una partida escribe diez veces más que un
   * escritorio. Este es el número que decide si alguien deja esto puesto o no.
   */
  it("la calidad dice cuánto disco puede llegar a comerse", async () => {
    await irAGrabar();
    // 30 s a 15 fps por 2,3 MB son unos 987 MB.
    expect(screen.getByText(/hasta 98[0-9][,.]\d MB en disco/)).toBeInTheDocument();
  });

  /**
   * «La pantalla 2» no dice nada si no sabes cuál es la 2. Enseñar el número EN esa
   * pantalla es la única forma que no admite duda, y es lo que pidió Munir al verlo.
   */
  it("al elegir una pantalla, la enseña en la propia pantalla", async () => {
    await irAGrabar();
    fireEvent.click(screen.getByRole("button", { name: "2" }));
    const aviso = [...llamadas].reverse().find((l) => l.comando === "show_screen_number");
    expect(aviso?.args).toEqual({ screen: 1 });
  });

  it("y con «Ratón» no enseña nada, porque no hay ninguna que señalar", async () => {
    await irAGrabar();
    fireEvent.click(screen.getByRole("button", { name: "Ratón" }));
    expect(llamadas.filter((l) => l.comando === "show_screen_number")).toEqual([]);
  });

  /** Es el ajuste que más disco ahorra: 720p deja el fotograma en menos de la mitad. */
  it("la calidad se elige por tamaño, no por un número suelto", async () => {
    await irAGrabar();
    const grupo = screen.getByRole("group", { name: "Calidad" });
    expect(within(grupo).getByRole("button", { name: "Resolución original" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(within(grupo).getByRole("button", { name: "720p" }));
    const ultima = [...llamadas].reverse().find((l) => l.comando === "set_settings");
    expect((ultima?.args as { settings: Record<string, unknown> }).settings).toMatchObject({
      replayHeight: 720,
    });
  });

  it("y ese número sube al subir la fluidez", async () => {
    await irAGrabar();
    // «60 fps» sale dos veces, los de grabar y los del anillo: por eso el grupo tiene
    // nombre, que además es lo que oye quien usa un lector de pantalla.
    const grupo = screen.getByRole("group", { name: "Fluidez" });
    fireEvent.click(within(grupo).getByRole("button", { name: "60" }));
    const ultima = [...llamadas].reverse().find((l) => l.comando === "set_settings");
    expect((ultima?.args as { settings: Record<string, unknown> }).settings).toMatchObject({
      replayFps: 60,
    });
  });
});

describe("cuando este Windows no tiene la captura moderna", () => {
  /**
   * El aviso existe porque la diferencia se ve en la foto y no hay nada que tocar: sin
   * decirlo, las capturas salen con trozos en negro y parece un fallo de winshotx. Munir
   * lo tuvo asi meses hasta que mando una foto de Adeorq.
   */
  it("lo dice en Capturar, que es donde se viene a buscar por que sale mal una foto", async () => {
    await abrirAjustes(undefined, undefined, undefined, false);
    await waitFor(() =>
      expect(screen.getByText("Este Windows usa la captura antigua")).toBeInTheDocument(),
    );
    expect(screen.getByText(/trozos en negro/)).toBeInTheDocument();
  });

  it("y cuando si la tiene, que es lo normal, no se dice nada", async () => {
    await abrirAjustes();
    // Se espera a que conteste Rust antes de dar por bueno que no esta: sin esto, la
    // prueba pasaria igual mirando la pantalla antes de que llegara la respuesta.
    await waitFor(() =>
      expect(llamadas.some((l) => l.comando === "captura_moderna")).toBe(true),
    );
    expect(screen.queryByText("Este Windows usa la captura antigua")).not.toBeInTheDocument();
  });

  it("en ingles tampoco se queda en castellano", async () => {
    aplicarIdioma("en");
    await abrirAjustes(undefined, undefined, undefined, false);
    await waitFor(() =>
      expect(screen.getByText("This Windows uses the old capture")).toBeInTheDocument(),
    );
    expect(screen.queryByText(/trozos en negro/)).not.toBeInTheDocument();
  });
});

describe("el resalte de la ventana", () => {
  const guardados = () =>
    llamadas
      .filter((l) => l.comando === "set_settings")
      .map((l) => (l.args as { settings: Settings }).settings);

  it("elegir una muestra guarda ese color", async () => {
    await abrirAjustes();
    fireEvent.click(screen.getByRole("radio", { name: "#22c55e" }));
    await waitFor(() => expect(guardados().at(-1)?.windowHighlightColor).toBe("#22c55e"));
  });

  it("apagado, el color ya no se ofrece", async () => {
    await abrirAjustes(undefined, undefined, { windowHighlight: false });
    expect(screen.queryByRole("radiogroup", { name: "Color del resalte" })).toBeNull();
    fireEvent.click(screen.getByRole("switch", { name: "Resaltar la ventana bajo el cursor" }));
    await waitFor(() => expect(guardados().at(-1)?.windowHighlight).toBe(true));
    expect(screen.getByRole("radiogroup", { name: "Color del resalte" })).toBeInTheDocument();
  });
});
