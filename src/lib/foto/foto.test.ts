import { describe, expect, it } from "vitest";
import {
  cajaDe,
  estirarMarca,
  estirarRect,
  alternarBloqueo,
  estaBloqueada,
  marcasTocables,
  meterEnGrupo,
  meterRect,
  moverMarca,
  ponerJunto,
  recortaAlgo,
  rectConProporcion,
  renumerar,
  toca,
  type DocFoto,
  type Marca,
} from "./marcas";
import { historia, DOC_VACIO } from "./historia";
import { ajustar, aImagen, pasoDeZoom, zoomHacia } from "./vista";
import { piezasDeFlecha } from "./pintar";

const marca = (m: Partial<Marca>): Marca => ({ id: 1, kind: "shape", x1: 10, y1: 10, x2: 110, y2: 60, color: "#ef4444", grosor: 4, ...m });

describe("las marcas", () => {
  it("un rectángulo hueco se coge por el borde y deja pinchar lo de dentro", () => {
    const caja = marca({});
    expect(toca(caja, [10, 30], 5)).toBe(true);
    expect(toca(caja, [60, 35], 5)).toBe(false);
    expect(toca({ ...caja, relleno: true }, [60, 35], 5)).toBe(true);
  });

  it("una marca escondida no se puede pinchar", () => {
    expect(toca(marca({ oculta: true }), [10, 30], 5)).toBe(false);
  });

  it("la flecha se estira por sus dos extremos, no por una caja", () => {
    const flecha = marca({ kind: "arrow", x1: 0, y1: 0, x2: 100, y2: 0 });
    expect(estirarMarca(flecha, "p2", [50, 50])).toMatchObject({ x1: 0, y1: 0, x2: 50, y2: 50 });
    expect(estirarMarca(flecha, "p1", [20, 30])).toMatchObject({ x1: 20, y1: 30, x2: 100, y2: 0 });
  });

  it("estirar un texto cambia su tamaño de letra en vez de deformarlo", () => {
    const texto = marca({ kind: "text", x1: 0, y1: 0, x2: 0, y2: 0, texto: "hola", tamano: 20 });
    const antes = cajaDe(texto);
    const despues = estirarMarca(texto, "se", [antes.w * 2, antes.h * 2]);
    expect(despues.tamano).toBe(40);
    expect(despues.texto).toBe("hola");
    // Por la esquina de abajo a la derecha, la de arriba a la izquierda no se mueve.
    expect([despues.x1, despues.y1]).toEqual([0, 0]);
  });

  it("un lado no se puede pasar del contrario", () => {
    expect(estirarRect({ x: 0, y: 0, w: 100, h: 100 }, "w", [500, 0], 4)).toEqual({ x: 96, y: 0, w: 4, h: 100 });
  });

  it("mover un dibujo mueve todos sus puntos", () => {
    const dibujo = marca({ kind: "pen", puntos: [[0, 0], [5, 5]] });
    expect(moverMarca(dibujo, 10, 20).puntos).toEqual([[10, 20], [15, 25]]);
  });

  it("los pasos se numeran en el orden en que están", () => {
    const pasos = renumerar([
      marca({ id: 1, kind: "step", numero: 3 }),
      marca({ id: 2, kind: "arrow" }),
      marca({ id: 3, kind: "step", numero: 3 }),
    ]);
    expect(pasos.filter((m) => m.kind === "step").map((m) => m.numero)).toEqual([1, 2]);
  });
});

describe("bloquear", () => {
  const grupos = [{ id: 7, nombre: "Carpeta 1", bloqueado: true }];

  it("una marca está bloqueada por sí misma o por su carpeta", () => {
    expect(estaBloqueada(marca({ bloqueada: true }), [])).toBe(true);
    expect(estaBloqueada(marca({ grupo: 7 }), grupos)).toBe(true);
    expect(estaBloqueada(marca({ grupo: 7 }), [{ ...grupos[0], bloqueado: false }])).toBe(false);
    expect(estaBloqueada(marca({}), grupos)).toBe(false);
  });

  const conCarpeta = (bloqueado: boolean) => ({
    ...DOC_VACIO,
    grupos: [{ id: 7, nombre: "Carpeta 1", bloqueado }],
    marcas: [marca({ id: 1, grupo: 7 }), marca({ id: 2, grupo: 7 }), marca({ id: 3 })],
  });
  const bloqueadas = (d: DocFoto) => d.marcas.filter((m) => estaBloqueada(m, d.grupos)).map((m) => m.id);

  it("Ctrl+L con una carpeta entera elegida bloquea la carpeta, no cada capa", () => {
    const d = alternarBloqueo(conCarpeta(false), [1, 2]);
    expect(d.grupos[0].bloqueado).toBe(true);
    expect(d.marcas.every((m) => !m.bloqueada)).toBe(true);
    expect(bloqueadas(d)).toEqual([1, 2]);
    // Y otra vez la desbloquea.
    expect(bloqueadas(alternarBloqueo(d, [1, 2]))).toEqual([]);
  });

  it("desbloquear una capa de una carpeta bloqueada suelta solo esa", () => {
    const d = alternarBloqueo(conCarpeta(true), [1]);
    expect(bloqueadas(d)).toEqual([2]);
    expect(d.grupos[0].bloqueado).toBe(false);
  });

  it("con una sola capa de la carpeta, bloquea esa y no la carpeta", () => {
    const d = alternarBloqueo(conCarpeta(false), [1]);
    expect(bloqueadas(d)).toEqual([1]);
    expect(d.grupos[0].bloqueado).toBeFalsy();
  });

  it("si alguna se puede tocar, Ctrl+L bloquea todas en vez de desbloquear las otras", () => {
    const d = alternarBloqueo(conCarpeta(true), [2, 3]);
    expect(bloqueadas(d)).toEqual([1, 2, 3]);
  });

  it("sacar una capa de una carpeta bloqueada no la desbloquea", () => {
    const d = { ...conCarpeta(true), grupos: [...conCarpeta(true).grupos, { id: 8, nombre: "Carpeta 2" }] };
    expect(bloqueadas(meterEnGrupo(d, [1], 8))).toContain(1);
    expect(bloqueadas(ponerJunto(d, [1], 3))).toContain(1);
  });

  it("en la imagen solo se tocan las que se ven y no están bloqueadas", () => {
    const doc = {
      ...DOC_VACIO,
      grupos,
      marcas: [marca({ id: 1 }), marca({ id: 2, bloqueada: true }), marca({ id: 3, grupo: 7 }), marca({ id: 4, oculta: true })],
    };
    expect(marcasTocables(doc).map((m) => m.id)).toEqual([1]);
  });
});

describe("soltar capas en el panel", () => {
  const doc = { ...DOC_VACIO, grupos: [{ id: 7, nombre: "Carpeta 1" }], marcas: [marca({ id: 1 }), marca({ id: 2, grupo: 7 }), marca({ id: 3 })] };

  it("soltada encima de otra queda justo por encima, y en su carpeta", () => {
    const d = ponerJunto(doc, [3], 2, true);
    expect(d.marcas.map((m) => m.id)).toEqual([1, 2, 3]);
    expect(d.marcas.find((m) => m.id === 3)?.grupo).toBe(7);
  });

  it("soltada debajo queda justo por debajo", () => {
    expect(ponerJunto(doc, [3], 2, false).marcas.map((m) => m.id)).toEqual([1, 3, 2]);
  });

  it("soltarla sobre sí misma no cambia nada", () => {
    expect(ponerJunto(doc, [2], 2)).toBe(doc);
  });
});

describe("el recorte", () => {
  it("se queda dentro de la captura", () => {
    expect(meterRect({ x: -20, y: 90, w: 50, h: 50 }, 100, 100)).toEqual({ x: 0, y: 50, w: 50, h: 50 });
  });

  it("la proporción da el trozo más grande que cabe, centrado", () => {
    expect(rectConProporcion(1, 200, 100)).toEqual({ x: 50, y: 0, w: 100, h: 100 });
  });

  it("la captura entera no cuenta como recorte", () => {
    expect(recortaAlgo({ x: 0, y: 0, w: 100, h: 100 }, 100, 100)).toBe(false);
    expect(recortaAlgo({ x: 0, y: 0, w: 99, h: 100 }, 100, 100)).toBe(true);
  });
});

describe("la vista", () => {
  it("ajustar centra la imagen y nunca la agranda por encima del 100 %", () => {
    const v = ajustar({ x: 0, y: 0, w: 100, h: 50 }, 1000, 800);
    expect(v.zoom).toBe(1);
    expect(v.panX).toBe(450);
    expect(v.panY).toBe(375);
  });

  it("acercar con el ratón deja quieto lo que hay debajo del ratón", () => {
    const v = { zoom: 0.5, panX: 10, panY: 20 };
    const antes = aImagen(v, 300, 200);
    const despues = aImagen(zoomHacia(v, 2, 300, 200), 300, 200);
    expect(despues[0]).toBeCloseTo(antes[0]);
    expect(despues[1]).toBeCloseTo(antes[1]);
  });

  it("los pasos de zoom pasan por el 100 %", () => {
    expect(pasoDeZoom(0.8, 1)).toBe(1);
    expect(pasoDeZoom(1, -1)).toBe(0.67);
  });
});

describe("deshacer", () => {
  it("el recorte también se deshace", () => {
    let h = { pasado: [], presente: DOC_VACIO, futuro: [] } as Parameters<typeof historia>[0];
    h = historia(h, { type: "editar", cambio: (d) => ({ ...d, recorte: { x: 0, y: 0, w: 5, h: 5 } }) });
    expect(h.presente.recorte).not.toBeNull();
    h = historia(h, { type: "deshacer" });
    expect(h.presente.recorte).toBeNull();
  });

  it("un arrastre que no se soltó no bloquea Ctrl+Z", () => {
    let h = { pasado: [], presente: DOC_VACIO, futuro: [] } as Parameters<typeof historia>[0];
    h = historia(h, { type: "editar", cambio: { marcas: [marca({})], grupos: [], recorte: null } });
    h = historia(h, { type: "empezar" });
    h = historia(h, { type: "deshacer" });
    expect(h.presente.marcas).toEqual([]);
  });

  it("un arrastre entero es un solo paso", () => {
    let h = { pasado: [], presente: DOC_VACIO, futuro: [] } as Parameters<typeof historia>[0];
    h = historia(h, { type: "empezar" });
    for (let x = 0; x < 5; x++) h = historia(h, { type: "editar", cambio: { marcas: [marca({ x1: x })], grupos: [], recorte: null } });
    h = historia(h, { type: "terminar" });
    expect(h.pasado.length).toBe(1);
  });
});

describe("la flecha", () => {
  it("la punta crece con el grosor", () => {
    const fina = piezasDeFlecha(marca({ kind: "arrow", x1: 0, y1: 0, x2: 400, y2: 0, grosor: 4 }));
    const gorda = piezasDeFlecha(marca({ kind: "arrow", x1: 0, y1: 0, x2: 400, y2: 0, grosor: 16 }));
    const ancho = (p: typeof fina) => Math.abs(p.cabezas[0][1][1] - p.cabezas[0][2][1]);
    expect(ancho(gorda)).toBeGreaterThan(ancho(fina));
  });

  it("con dos puntas lleva dos, y sin punta ninguna", () => {
    expect(piezasDeFlecha(marca({ kind: "arrow", puntas: "both" })).cabezas).toHaveLength(2);
    expect(piezasDeFlecha(marca({ kind: "arrow", puntas: "none" })).cabezas).toHaveLength(0);
  });
});
