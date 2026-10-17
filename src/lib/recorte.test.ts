/**
 * Las cuentas del recorte.
 *
 * Son cuatro funciones puras y las cuatro deciden algo que despues no se puede corregir:
 * que trozo se exporta y de que tamanno. Se prueban aqui, sin ventana, porque el fallo
 * tipico no es visual, es de un pixel de mas o de una esquina invertida.
 */
import { describe, expect, it } from "vitest";
import {
  conProporcion,
  esLaProporcion,
  medida,
  ordenar,
  recortaAlgo,
  type Recorte,
} from "./recorte";

const MITAD_DERECHA: Recorte = { x1: 0.5, y1: 0, x2: 1, y2: 1 };

describe("ordenar las dos esquinas", () => {
  it("arrastrar de derecha a izquierda da el mismo marco", () => {
    // Arrastrar hacia atras es tan normal como hacia delante, y nadie va a repetirlo.
    const alReves: Recorte = { x1: 0.8, y1: 0.9, x2: 0.2, y2: 0.1 };
    expect(ordenar(alReves)).toEqual({ x1: 0.2, y1: 0.1, x2: 0.8, y2: 0.9 });
  });

  it("lo que se sale por los bordes se queda dentro", () => {
    expect(ordenar({ x1: -0.4, y1: -1, x2: 1.7, y2: 2 })).toEqual({
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 1,
    });
  });
});

describe("cuanto mide el trozo", () => {
  it("la mitad de 800 son 400", () => {
    expect(medida(MITAD_DERECHA, 800, 600)).toEqual({ width: 400, height: 600 });
  });

  it("un arrastre de nada no deja un lado de cero", () => {
    // Un lado de cero revienta al codificador de video mucho despues, y para entonces ya
    // no se sabe de donde venia.
    const casi = { x1: 0.5, y1: 0.5, x2: 0.5, y2: 0.5 };
    expect(medida(casi, 800, 600)).toEqual({ width: 2, height: 2 });
  });

  it("se mide sobre la captura, no sobre la vista previa", () => {
    // El mismo marco sobre una captura mas grande da un trozo mas grande. Es toda la
    // razon de que las coordenadas vayan de 0 a 1.
    expect(medida(MITAD_DERECHA, 1920, 1200)).toEqual({ width: 960, height: 1200 });
  });
});

describe("si el marco recorta algo de verdad", () => {
  it("un clic sin arrastre, no", () => {
    expect(recortaAlgo({ x1: 0.3, y1: 0.3, x2: 0.302, y2: 0.31 })).toBe(false);
  });

  it("el marco que abarca la captura entera, tampoco", () => {
    expect(recortaAlgo({ x1: 0, y1: 0, x2: 1, y2: 1 })).toBe(false);
  });

  it("pero quitar solo una franja, si", () => {
    // Recortar la barra de tareas de abajo es un caso de verdad, y el alto cambia poco.
    expect(recortaAlgo({ x1: 0, y1: 0, x2: 1, y2: 0.94 })).toBe(true);
  });

  it("y la mitad, tambien", () => {
    expect(recortaAlgo(MITAD_DERECHA)).toBe(true);
  });
});

describe("las proporciones de un tiron", () => {
  // Una pantalla normal, que es de donde sale todo lo que se graba.
  const ANCHO = 1920;
  const ALTO = 1080;

  it("9:16 se queda con una columna centrada, no con una franja estirada", () => {
    // Lo que se exporta para el movil. De 1920x1080, lo mas alto que cabe en 9:16 son
    // 1080 de alto por 607 de ancho: el recorte tiene que medir eso, no la pantalla
    // entera aplastada.
    const r = conProporcion(9 / 16, ANCHO, ALTO);
    const { width, height } = medida(r, ANCHO, ALTO);
    expect(height).toBe(1080);
    expect(width).toBe(608);
    expect(width / height).toBeCloseTo(9 / 16, 2);
  });

  it("y queda centrado, con el mismo margen a los dos lados", () => {
    const r = conProporcion(9 / 16, ANCHO, ALTO);
    expect(r.x1).toBeCloseTo(1 - r.x2, 6);
    expect(r.y1).toBe(0);
    expect(r.y2).toBe(1);
  });

  it("1:1 da un cuadrado de lado el alto de la captura", () => {
    const { width, height } = medida(conProporcion(1, ANCHO, ALTO), ANCHO, ALTO);
    expect(width).toBe(1080);
    expect(height).toBe(1080);
  });

  it("la proporcion que ya tiene la captura no recorta nada", () => {
    const r = conProporcion(16 / 9, ANCHO, ALTO);
    expect(medida(r, ANCHO, ALTO)).toEqual({ width: 1920, height: 1080 });
    expect(recortaAlgo(r)).toBe(false);
  });

  it("sobre una captura vertical, 16:9 recorta por arriba y por abajo", () => {
    // El caso al reves: una ventana estrecha grabada en vertical llevada a apaisado.
    const { width, height } = medida(conProporcion(16 / 9, 1080, 1920), 1080, 1920);
    expect(width).toBe(1080);
    expect(height).toBe(608);
  });

  it("y la proporcion puesta se reconoce, para poder marcar su boton", () => {
    const r = conProporcion(9 / 16, ANCHO, ALTO);
    expect(esLaProporcion(9 / 16, r, ANCHO, ALTO)).toBe(true);
    expect(esLaProporcion(1, r, ANCHO, ALTO)).toBe(false);
    expect(esLaProporcion(16 / 9, r, ANCHO, ALTO)).toBe(false);
  });

  it("moverlo de sitio no le cambia la proporcion", () => {
    // Al elegir 9:16 el marco se puede arrastrar: sigue siendo 9:16 y su boton sigue
    // marcado. Si no, elegir la proporcion y colocarla serian dos cosas peleadas.
    const centrado = conProporcion(9 / 16, ANCHO, ALTO);
    const ancho = centrado.x2 - centrado.x1;
    const movido = { ...centrado, x1: 0, x2: ancho };
    expect(esLaProporcion(9 / 16, movido, ANCHO, ALTO)).toBe(true);
  });
});
