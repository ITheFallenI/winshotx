/**
 * La capa donde se dibujan las marcas sobre la vista previa.
 *
 * Lo que se comprueba aquí es lo que puede salir mal de verdad: que las coordenadas se
 * guarden **de 0 a 1** y no en píxeles (que es lo que hace que el mismo dibujo valga a
 * cualquier tamaño de exportación), y que un clic sin arrastre no deje una marca invisible
 * de cero píxeles que después no hay forma de quitar.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CapaAnotaciones } from "./CapaAnotaciones";
import { aplicarIdioma } from "../../lib/i18n";
import type { Anotacion } from "../../lib/anotaciones";

/**
 * En happy-dom nada tiene tamaño, así que `getBoundingClientRect` devuelve ceros y la
 * capa no sabría dividir. Se le da una caja de 400 x 200 empezando en (100, 50), que
 * además obliga a las cuentas a restar el origen y no solo a dividir.
 */
function conTamanno() {
    Element.prototype.getBoundingClientRect = vi.fn(() => ({
      x: 100,
      y: 50,
      left: 100,
      top: 50,
      right: 500,
      bottom: 250,
      width: 400,
      height: 200,
      toJSON: () => ({}),
    })) as unknown as typeof Element.prototype.getBoundingClientRect;
}

function pintar(props: Partial<React.ComponentProps<typeof CapaAnotaciones>> = {}) {
  const onAnadir = vi.fn();
  const { container } = render(
    <CapaAnotaciones
      herramienta="box"
      color="#ef4444"
      anotaciones={[]}
      onAnadir={onAnadir}
      texto=""
      {...props}
    />,
  );
  return { onAnadir, svg: container.querySelector("svg")! };
}

beforeEach(() => {
  aplicarIdioma("es");
  conTamanno();
});

describe("dibujar una marca", () => {
  it("redimensiona el recorrido completo del pincel desde una esquina", () => {
    const onCambiar = vi.fn();
    const original: Anotacion = { kind: "brush", x1: .1, y1: .1, x2: .5, y2: .1,
      points: [[.1,.1],[.3,.5],[.5,.1]], color: "#ef4444", text: "", strokeWidth: .006 };
    const { svg } = pintar({ herramienta: "select", anotaciones: [original], seleccionada: 0, onCambiar });
    fireEvent.pointerDown(svg.querySelector('[data-corner="se"]')!, { clientX: 300, clientY: 150 });
    fireEvent.pointerMove(svg, { clientX: 460, clientY: 230 });
    fireEvent.pointerUp(svg);
    expect(onCambiar).toHaveBeenCalledTimes(1);
    const points = onCambiar.mock.calls[0][1].points;
    expect(points[0]).toEqual([.1,.1]);
    expect(points[1][0]).toBeCloseTo(.5); expect(points[1][1]).toBeCloseTo(.9);
    expect(points[2][0]).toBeCloseTo(.9); expect(points[2][1]).toBeCloseTo(.1);
  });
  it("mueve una marca seleccionada en un solo cambio y cancelar conserva el original", () => {
    const onCambiar = vi.fn(), onSeleccionar = vi.fn();
    const original: Anotacion = { kind: "box", x1: .1, y1: .1, x2: .5, y2: .5, color: "#ef4444", text: "" };
    const { svg } = pintar({ herramienta: "select", anotaciones: [original], onCambiar, onSeleccionar });
    fireEvent.pointerDown(svg, { clientX: 180, clientY: 90 });
    fireEvent.pointerMove(svg, { clientX: 220, clientY: 110 });
    fireEvent.pointerMove(svg, { clientX: 260, clientY: 130 });
    expect(onCambiar).not.toHaveBeenCalled();
    fireEvent.pointerUp(svg);
    expect(onSeleccionar).toHaveBeenCalledWith(0);
    expect(onCambiar).toHaveBeenCalledTimes(1);
    expect(onCambiar.mock.calls[0][1].x1).toBeCloseTo(.3);
    fireEvent.pointerDown(svg, { clientX: 180, clientY: 90 });
    fireEvent.pointerMove(svg, { clientX: 400, clientY: 200 });
    fireEvent.pointerCancel(svg);
    expect(onCambiar).toHaveBeenCalledTimes(1);
    expect(original.x1).toBe(.1);
  });
  it("el pincel conserva un recorrido curvo y se confirma una sola vez", () => {
    const { onAnadir, svg } = pintar({ herramienta: "brush", grosorPincel: 0.012, color: "#0a9bff" });
    fireEvent.pointerDown(svg, { clientX: 140, clientY: 70 });
    fireEvent.pointerMove(svg, { clientX: 300, clientY: 210 });
    fireEvent.pointerUp(svg, { clientX: 460, clientY: 70 });
    expect(onAnadir).toHaveBeenCalledTimes(1);
    expect(onAnadir.mock.calls[0][0]).toMatchObject({
      kind: "brush", color: "#0a9bff", strokeWidth: 0.012,
      points: [[0.1, 0.1], [0.5, 0.8], [0.9, 0.1]],
    });
  });

  it("el pincel dibuja un punto visible con un clic y descarta un gesto cancelado", () => {
    const { onAnadir, svg } = pintar({ herramienta: "brush" });
    fireEvent.pointerDown(svg, { clientX: 300, clientY: 150 });
    fireEvent.pointerUp(svg, { clientX: 300, clientY: 150 });
    expect(onAnadir).toHaveBeenCalledTimes(1);
    expect(onAnadir.mock.calls[0][0].points).toEqual([[0.5, 0.5]]);
    fireEvent.pointerDown(svg, { clientX: 200, clientY: 100 });
    fireEvent.pointerMove(svg, { clientX: 300, clientY: 150 });
    fireEvent.pointerCancel(svg);
    fireEvent.pointerUp(svg, { clientX: 300, clientY: 150 });
    expect(onAnadir).toHaveBeenCalledTimes(1);
  });

  it("el boton derecho no dibuja y un segundo puntero no altera el trazo", () => {
    const { onAnadir, svg } = pintar({ herramienta: "brush" });
    fireEvent.pointerDown(svg, { button: 2, clientX: 100, clientY: 50 });
    fireEvent.pointerUp(svg, { button: 2, clientX: 100, clientY: 50 });
    expect(onAnadir).not.toHaveBeenCalled();
    fireEvent.pointerDown(svg, { pointerId: 1, clientX: 100, clientY: 50 });
    fireEvent.pointerMove(svg, { pointerId: 2, clientX: 400, clientY: 200 });
    fireEvent.pointerUp(svg, { pointerId: 1, clientX: 300, clientY: 150 });
    expect(onAnadir.mock.calls[0][0].points).toEqual([[0, 0], [0.5, 0.5]]);
  });

  it("guarda las esquinas de 0 a 1, no en píxeles", () => {
    const { onAnadir, svg } = pintar();
    // De la esquina de arriba a la izquierda al centro de la capa.
    fireEvent.pointerDown(svg, { clientX: 100, clientY: 50 });
    fireEvent.pointerMove(svg, { clientX: 300, clientY: 150 });
    fireEvent.pointerUp(svg);

    expect(onAnadir).toHaveBeenCalledTimes(1);
    const marca: Anotacion = onAnadir.mock.calls[0][0];
    expect(marca.x1).toBeCloseTo(0, 5);
    expect(marca.y1).toBeCloseTo(0, 5);
    expect(marca.x2).toBeCloseTo(0.5, 5);
    expect(marca.y2).toBeCloseTo(0.5, 5);
  });

  it("se queda con la herramienta y el color que estén puestos", () => {
    const { onAnadir, svg } = pintar({ herramienta: "highlight", color: "#fbbf24" });
    fireEvent.pointerDown(svg, { clientX: 120, clientY: 60 });
    fireEvent.pointerMove(svg, { clientX: 400, clientY: 200 });
    fireEvent.pointerUp(svg);
    expect(onAnadir.mock.calls[0][0]).toMatchObject({
      kind: "highlight",
      color: "#fbbf24",
    });
  });

  it("un clic sin arrastre no deja una marca de cero píxeles", () => {
    // Sin esto, cada pulsación sin querer dejaba un rectángulo invisible e imposible de
    // quitar, porque no se puede pulsar encima de algo que no se ve.
    const { onAnadir, svg } = pintar();
    fireEvent.pointerDown(svg, { clientX: 200, clientY: 100 });
    fireEvent.pointerUp(svg);
    expect(onAnadir).not.toHaveBeenCalled();
  });

  it("arrastrar fuera de la capa recorta al borde en vez de salirse", () => {
    const { onAnadir, svg } = pintar();
    fireEvent.pointerDown(svg, { clientX: 300, clientY: 150 });
    fireEvent.pointerMove(svg, { clientX: 9999, clientY: 9999 });
    fireEvent.pointerUp(svg);
    const marca: Anotacion = onAnadir.mock.calls[0][0];
    expect(marca.x2).toBe(1);
    expect(marca.y2).toBe(1);
  });

  it("sin herramienta elegida no se dibuja nada y los clics pasan de largo", () => {
    const { onAnadir, svg } = pintar({ herramienta: null });
    fireEvent.pointerDown(svg, { clientX: 120, clientY: 60 });
    fireEvent.pointerMove(svg, { clientX: 400, clientY: 200 });
    fireEvent.pointerUp(svg);
    expect(onAnadir).not.toHaveBeenCalled();
    expect(svg.getAttribute("class")).toContain("pointer-events-none");
  });
});

describe("el texto", () => {
  it("se pone de un clic, sin arrastrar", () => {
    const { onAnadir, svg } = pintar({ herramienta: "text", texto: "mira esto" });
    fireEvent.pointerDown(svg, { clientX: 300, clientY: 150 });
    expect(onAnadir).toHaveBeenCalledTimes(1);
    expect(onAnadir.mock.calls[0][0]).toMatchObject({ kind: "text", text: "mira esto" });
  });

  it("sin nada escrito no se pone nada", () => {
    const { onAnadir, svg } = pintar({ herramienta: "text", texto: "   " });
    fireEvent.pointerDown(svg, { clientX: 300, clientY: 150 });
    expect(onAnadir).not.toHaveBeenCalled();
  });
});

describe("lo que ya está dibujado", () => {
  const marcas: Anotacion[] = [
    { kind: "box", x1: 0.1, y1: 0.1, x2: 0.5, y2: 0.5, color: "#ef4444", text: "" },
    { kind: "text", x1: 0.6, y1: 0.2, x2: 0.6, y2: 0.2, color: "#0a9bff", text: "aquí" },
  ];

  it("se pinta todo lo que hay, en su orden", () => {
    const { svg } = pintar({ anotaciones: marcas, herramienta: null });
    expect(svg.querySelectorAll("rect")).toHaveLength(1);
    expect(screen.getByText("aquí")).toBeInTheDocument();
  });

  it("el rectángulo sale hueco, para no tapar lo que señala", () => {
    const { svg } = pintar({ anotaciones: [marcas[0]], herramienta: null });
    expect(svg.querySelector("rect")?.getAttribute("fill")).toBe("none");
  });

  it("y se coloca donde dicen sus coordenadas, escaladas al lienzo del SVG", () => {
    const { svg } = pintar({ anotaciones: [marcas[0]], herramienta: null });
    const rect = svg.querySelector("rect")!;
    // El SVG trabaja en un lienzo de 1000 x 1000, así que 0,1 son 100.
    expect(rect.getAttribute("x")).toBe("100");
    expect(rect.getAttribute("width")).toBe("400");
  });
});

describe("los pasos numerados", () => {
  it("se ponen con un clic, sin arrastrar", () => {
    conTamanno();
    const { onAnadir, svg } = pintar({ herramienta: "step" });
    fireEvent.pointerDown(svg, { clientX: 300, clientY: 150 });
    expect(onAnadir).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "step", x1: 0.5, y1: 0.5, text: "1" }),
    );
  });

  /**
   * Numerar a mano es justo lo que se olvida cuando alguien mete un paso en medio, y
   * entonces hay dos treses en la misma imagen. La cuenta la lleva la capa.
   */
  it("el siguiente sigue la cuenta de los que ya hay", () => {
    conTamanno();
    const puestos: Anotacion[] = [
      { kind: "step", x1: 0.1, y1: 0.1, x2: 0.1, y2: 0.1, color: "#ef4444", text: "1" },
      { kind: "box", x1: 0, y1: 0, x2: 0.5, y2: 0.5, color: "#ef4444", text: "" },
      { kind: "step", x1: 0.2, y1: 0.2, x2: 0.2, y2: 0.2, color: "#ef4444", text: "2" },
    ];
    const { onAnadir, svg } = pintar({ herramienta: "step", anotaciones: puestos });
    fireEvent.pointerDown(svg, { clientX: 300, clientY: 150 });
    // Tres marcas puestas, pero solo dos son pasos: el que entra es el 3.
    expect(onAnadir).toHaveBeenCalledWith(expect.objectContaining({ text: "3" }));
  });

  /**
   * Uno puesto contra el borde cabe entero.
   *
   * Si no, se ve un cuarto de disco y el número se va fuera de la captura, que es lo que
   * pedía arreglar la issue 1. Al exportar se hace la misma cuenta (`centro_metido`), así
   * que lo que se ve en la vista previa es lo que sale en el archivo.
   */
  it("uno contra el borde se mete para que quepa entero", () => {
    conTamanno();
    const enLaEsquina: Anotacion[] = [
      { kind: "step", x1: 0, y1: 0, x2: 0, y2: 0, color: "#ef4444", text: "1" },
    ];
    const { svg } = pintar({ herramienta: null, anotaciones: enLaEsquina });
    const aro = svg.querySelector("ellipse")!;
    expect(Number(aro.getAttribute("cx"))).toBeGreaterThanOrEqual(38);
    expect(Number(aro.getAttribute("cy"))).toBeGreaterThanOrEqual(38);
  });

  it("y uno que ya cabía no se mueve de donde se puso", () => {
    conTamanno();
    const enMedio: Anotacion[] = [
      { kind: "step", x1: 0.5, y1: 0.5, x2: 0.5, y2: 0.5, color: "#ef4444", text: "1" },
    ];
    const { svg } = pintar({ herramienta: null, anotaciones: enMedio });
    const aro = svg.querySelector("ellipse")!;
    expect(aro.getAttribute("cx")).toBe("500");
    expect(aro.getAttribute("cy")).toBe("500");
  });

  it("se dibuja con su número dentro para verlo antes de exportar", () => {
    conTamanno();
    const puesto: Anotacion[] = [
      { kind: "step", x1: 0.5, y1: 0.5, x2: 0.5, y2: 0.5, color: "#0a9bff", text: "4" },
    ];
    pintar({ herramienta: null, anotaciones: puesto });
    expect(screen.getByText("4")).toBeInTheDocument();
  });
});
